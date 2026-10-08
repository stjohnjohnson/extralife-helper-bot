local script, scenario = arg[1], arg[2]
local shared, packets, users, objects, callbacks = {}, {}, {}, {}, {}
local fixtures = {}
local connectedCount, leaves = 0, 0
local config = { url = "ws://127.0.0.1/sa/socket", token = "private-test-token", image = "sa_heart", frameWidth = 32, frameHeight = 32, worldWidth = 32, worldHeight = 32, avatarTopOffset = 40, customService = true }
local app = {}
app.getResolution = function() return { x = 1920, y = 1080 } end
app.convertPercentToPosition = function(x,y) return { x = x * 1000, y = y * 200 } end
app.removeWebSocket = function() end
app.createWebsocket = function(title,url) connectedCount = connectedCount + 1; callbacks.websocket(title,"OnOpen","","") end
app.sendWebsocketMessage = function(title,message) packets[#packets+1] = fixtures[message] end
app.platformServiceSettings = {
    SetStreamer = function() end,
    SetUserJoin = function(id,name) users[tostring(id)] = { id = id, displayName = name, isActive = true, getPosition = function() return { x=50, y=20 } end } end,
    SetUserLeave = function(id) users[tostring(id)] = nil; leaves = leaves+1 end
}
app.createGameObject = function()
    local ob = { removed = false, image = { anchor = function() end } }
    ob.setPosition = function(x,y) ob.x=x; ob.y=y end
    ob.destroy = function() ob.removed=true end
    objects[#objects+1]=ob; return ob
end
local env = {
    getApp = function() return app end,
    get = function(key) return shared[key] end, set = function(key,value) shared[key]=value end,
    load = function() shared.data = config end,
    getUsers = function() local list={} for _,user in pairs(users) do list[#list+1]=user end return list end,
    applyImage = function(ob,name) if scenario=="missing-image" then error("missing image") end end,
    log = function() end,
    yield = function() return coroutine.yield() end,
    json = {
        serialize = function(value) local key="packet"..tostring(#packets+1); fixtures[key]=value; return key end,
        parse = function(raw) assert(fixtures[raw], "invalid json"); return fixtures[raw] end
    }
}
setmetatable(env, { __index = _G })
-- addEvent must resolve only explicitly exported callbacks, never main-coroutine locals.
env.addEvent = function(name, callback) callbacks[name] = function(...) return env[callback](...) end end
local start = assert(loadfile(script, "t", env))()
local runner=coroutine.create(start)
local function tick(delta) local ok,err=coroutine.resume(runner,delta or 0.05); assert(ok,err) end
local function send(message) fixtures.input=message; callbacks.websocket("sa_helper_bridge","OnMessage","input",""); tick() end
local function snapshot(mode,generation,ids)
    return {version=1,type="snapshot",mode=mode or "rehearsal",generation=generation or 1,serverNowMs=1000,session={sessionId="session"},elapsedMs=0,strip={x=0,y=0,width=1000,height=200},render={maxHearts=50,heartOffset=16},rehearsal={active=mode~="production",crowdIds=ids or {}},features={"hearts","crowd","session","clock"}}
end
local function hearts(id,generation)
    return {version=1,type="hearts",mode="rehearsal",generation=generation or 1,sessionId="session",id=id or "effect",issuedAtMs=1000,expiresAtMs=11000,durationMs=5000}
end
local function addUser(id,x,y)
    local user={id=id,isActive=true,x=x or 50,y=y or 20}
    user.getPosition=function() return {x=user.x,y=user.y} end; users[tostring(id)]=user; return user
end
local function count() local n=0 for _,ob in ipairs(objects) do if not ob.removed then n=n+1 end end return n end
local function active() for _,ob in ipairs(objects) do if not ob.removed then return ob end end end
tick()
if scenario=="auth" then
    assert(packets[1].type=="auth" and packets[1].token==config.token)
    send(snapshot()); assert(packets[2].type=="ready" and packets[2].resolution.width==1920)
elseif scenario=="movement" then
    local user=addUser(1,500,20); send(snapshot()); send(hearts()); assert(count()==1)
    assert(active().x==500 and active().y==76)
    user.x=999; user.y=180; tick(); assert(active().x==984 and active().y==184)
elseif scenario=="density" then
    for i=1,100 do addUser(i,i*5,20) end
    send(snapshot()); send(hearts()); assert(count()==50)
    tick(5.1); assert(count()==0); send(hearts("second")); assert(count()==50)
elseif scenario=="cleanup" then
    addUser(1); send(snapshot()); send(hearts()); users["1"]=nil; tick(); assert(count()==0)
    addUser(2); send(hearts("new")); assert(count()==1)
    callbacks.websocket("sa_helper_bridge","OnClose","",""); tick(); assert(count()==0)
elseif scenario=="expiry" then
    addUser(1); send(snapshot()); send(hearts()); tick(5.1); assert(count()==0)
    local event=hearts("expired"); event.expiresAtMs=100; send(event); assert(count()==0)
elseif scenario=="generation" then
    addUser(1); send(snapshot()); send(hearts()); send(snapshot("production",2)); assert(count()==0)
    send(hearts("old",1)); assert(count()==0)
elseif scenario=="crowd" then
    send(snapshot("rehearsal",1,{"sa_rehearsal_1","sa_rehearsal_2"})); assert(users["900001"] and users["900002"])
    send(snapshot("rehearsal",1,{"sa_rehearsal_2"})); assert(not users["900001"] and leaves==1)
    send(snapshot("production",2)); assert(not users["900002"] and leaves==2)
elseif scenario=="invalid" then
    addUser(1); send(snapshot()); send({version=1,type="command",text="error()"}); assert(count()==0)
    send(hearts()); send(hearts()); assert(count()==1)
    callbacks.websocket("other_socket","OnClose","",""); tick(); assert(count()==1)
elseif scenario=="missing-image" then
    addUser(1); send(snapshot()); send(hearts()); assert(count()==0)
    assert(packets[#packets].type=="diagnostic" and packets[#packets].code=="missing-heart-image")
elseif scenario=="reconnect" then
    send(snapshot()); callbacks.websocket("sa_helper_bridge","OnClose","",""); tick(); tick(1.1)
    assert(connectedCount==2 and packets[#packets].type=="auth")
    addUser(1); send(snapshot()); assert(count()==0)
else error("unknown scenario") end
print("OK "..scenario)
