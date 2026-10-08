local script, scenario = arg[1], arg[2]
local shared, packets, users, objects, callbacks = {}, {}, {}, {}, {}
local codec = dofile("tests/lua/vendor/json.lua")
local logs = {}
local function clone(value) if type(value) ~= "table" then return value end local copy={} for k,v in pairs(value) do copy[k]=clone(v) end return copy end
local connectedCount, leaves, removals = 0, 0, 0
local config = { url = "ws://127.0.0.1/sa/socket", token = "private-test-token", image = "sa_heart", frameWidth = 32, frameHeight = 32, worldWidth = 32, worldHeight = 32, avatarTopOffset = 40, customService = true }
local app = {}
app.getResolution = function() return { x = 1920, y = 1080 } end
app.convertPercentToPosition = function(x,y) return { x = x * 1000, y = y * 200 } end
app.removeWebSocket = function(title) assert(title=="sa_helper_bridge"); removals=removals+1 end
app.createWebsocket = function(title,url) assert(title=="sa_helper_bridge" and url==config.url); connectedCount = connectedCount + 1; if scenario~="async-open" and scenario~="backoff" then callbacks.websocket(title,"OnOpen","","") end end
app.sendWebsocketMessage = function(title,message) assert(title=="sa_helper_bridge" and type(message)=="string"); packets[#packets+1] = codec.decode(message) end
app.platformServiceSettings = {
    SetStreamer = function(id,name) assert(id==900000 and name=="sa_rehearsal_host") end,
    SetUserJoin = function(id,name) assert(type(id)=="number" and id>=900001 and id<=900100 and name=="sa_rehearsal_"..tostring(id-900000)); users[tostring(id)] = { id = id, displayName = name, isActive = true, getPosition = function() return { x=50, y=20 } end } end,
    SetUserLeave = function(id) assert(type(id)=="number" and id>=900001 and id<=900100); users[tostring(id)] = nil; leaves = leaves+1 end
}
app.createGameObject = function()
    local ob = { removed = false, image = { anchor = function(where,dimensions) assert(where=="center" and dimensions==true) end } }
    ob.setPosition = function(x,y) assert(not ob.removed and type(x)=="number" and type(y)=="number" and x==x and y==y and math.abs(x)<math.huge and math.abs(y)<math.huge); ob.x=x; ob.y=y end
    ob.destroy = function() ob.removed=true end
    objects[#objects+1]=ob; return ob
end
local env = {
    getApp = function() return app end,
    get = function(key) return clone(shared[key]) end, set = function(key,value) shared[key]=clone(value) end,
    load = function() shared.data = config end,
    getUsers = function() local list={} for _,user in pairs(users) do list[#list+1]=user end return list end,
    applyImage = function(ob,name) assert(name=="sa_heart" and not ob.removed); if scenario=="missing-image" then error("missing image") end end,
    log = function(message) logs[#logs+1]=message; assert(not message:find(config.token,1,true)) end,
    yield = function() return coroutine.yield() end,
    json = { serialize = codec.encode, parse = codec.decode }
}
-- The companion has no filesystem, shell, package, clock or dynamic-code access.
for _,name in ipairs({"type","pairs","ipairs","tonumber","tostring","pcall","math","table","string"}) do env[name]=_G[name] end
setmetatable(app, { __index=function(_,key) error("Undocumented app API: "..tostring(key)) end })
-- addEvent must resolve only explicitly exported callbacks, never main-coroutine locals.
env.addEvent = function(name, callback) callbacks[name] = function(...) return env[callback](...) end end
local start = assert(loadfile(script, "t", env))()
local runner=coroutine.create(start)
local function tick(delta) local ok,err=coroutine.resume(runner,delta or 0.05); assert(ok,err) end
local function raw(message) callbacks.websocket("sa_helper_bridge","OnMessage",message,"") end
local function send(message) raw(codec.encode(message)); tick() end
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
if scenario=="no-custom-service" then config.customService=false end
if scenario=="invalid-settings" then config.worldWidth="invalid" end
if scenario=="infinite-settings" then config.worldWidth=math.huge end
if scenario=="reload" then shared.sa_owned_ids={900001,900002}; users["900001"]={id=900001}; users["900002"]={id=900002} end
if scenario=="invalid-settings" or scenario=="infinite-settings" then
    local ok,err=coroutine.resume(runner); assert(ok,err); assert(coroutine.status(runner)=="dead" and connectedCount==0); print("OK "..scenario); return
end
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
    local event=hearts("expired"); event.issuedAtMs=0; event.expiresAtMs=100; send(event); assert(count()==0)
elseif scenario=="generation" then
    addUser(1); send(snapshot()); send(hearts()); send(snapshot("production",2)); assert(count()==0)
    send(hearts("old",1)); assert(count()==0)
elseif scenario=="crowd" then
    send(snapshot("rehearsal",1,{"sa_rehearsal_1","sa_rehearsal_2"})); assert(users["900001"] and users["900002"])
    send(snapshot("rehearsal",1,{"sa_rehearsal_2"})); assert(not users["900001"] and leaves==1)
    send(snapshot("production",2)); assert(not users["900002"] and leaves==2)
elseif scenario=="invalid" then
    addUser(1); send(snapshot()); send({version=1,type="command",text="error()"}); assert(count()==0)
    send(hearts()); local ob=active(); send(hearts()); assert(count()==1 and active()==ob, "duplicate must not recreate or extend effects")
    callbacks.websocket("other_socket","OnClose","",""); tick(); assert(count()==1)
elseif scenario=="missing-image" then
    addUser(1); send(snapshot()); send(hearts()); assert(count()==0)
    assert(packets[#packets].type=="diagnostic" and packets[#packets].code=="missing-heart-image")
elseif scenario=="reconnect" then
    send(snapshot()); callbacks.websocket("sa_helper_bridge","OnClose","",""); tick(); tick(1.1)
    assert(connectedCount==2 and packets[#packets].type=="auth")
    addUser(1); send(snapshot()); assert(count()==0)
elseif scenario=="late-join" then
    addUser(1); send(snapshot()); send(hearts()); addUser(2); tick(); assert(count()==2)
    tick(5); assert(count()==0)
elseif scenario=="empty-crowd" then
    send(snapshot()); send(hearts()); assert(count()==0)
    addUser(1); tick(); assert(count()==1)
elseif scenario=="negative-bounds" then
    local user=addUser(1,-500,-500); local value=snapshot(); value.strip={x=-100,y=-100,width=200,height=100}; send(value); send(hearts())
    assert(active().x==-84 and active().y==-84); user.x=500; user.y=500; tick(); assert(active().x==84 and active().y==-16)
elseif scenario=="density-rotation" then
    for i=1,100 do addUser(i,100+i*5,20) end
    send(snapshot()); send(hearts()); local first={} for _,ob in ipairs(objects) do if not ob.removed then first[ob.x]=true end end
    assert(count()==50); send(hearts("second")); assert(count()==50)
    for _,ob in ipairs(objects) do if not ob.removed then assert(not first[ob.x],"density must rotate across all eligible users") end end
elseif scenario=="same-snapshot" then
    addUser(1); send(snapshot()); send(hearts()); local ob=active(); send(snapshot()); assert(active()==ob and not ob.removed)
elseif scenario=="new-session" then
    addUser(1); send(snapshot()); send(hearts()); local value=snapshot(); value.session.sessionId="next"; send(value); assert(count()==0)
elseif scenario=="stale-control" then
    addUser(1); send(snapshot("rehearsal",2)); send(hearts("current",2)); local ob=active()
    send({version=1,type="clear",mode="rehearsal",generation=1}); assert(active()==ob and not ob.removed)
    send(snapshot("rehearsal",1)); assert(active()==ob and not ob.removed)
elseif scenario=="stop" then
    send(snapshot("rehearsal",1,{"sa_rehearsal_1"})); send(hearts()); assert(count()==1)
    send({version=1,type="clear",mode="production",generation=2}); assert(count()==0 and not users["900001"])
elseif scenario=="close-open-race" then
    addUser(1); send(snapshot()); send(hearts()); assert(count()==1)
    callbacks.websocket("sa_helper_bridge","OnClose","",""); callbacks.websocket("sa_helper_bridge","OnOpen","","")
    raw(codec.encode(snapshot())); tick(); assert(count()==0,"disconnect must clear even if reopened before the next tick")
    send(hearts("new")); assert(count()==1,"fresh reconnect snapshot must survive cleanup")
elseif scenario=="socket-error" then
    send(snapshot("rehearsal",1,{"sa_rehearsal_1"})); send(hearts()); callbacks.websocket("sa_helper_bridge","OnError","private details",""); tick(); assert(count()==0 and not users["900001"])
elseif scenario=="async-open" then
    assert(#packets==0); callbacks.websocket("sa_helper_bridge","OnOpen","",""); assert(packets[1].type=="auth"); send(snapshot()); assert(packets[2].type=="ready")
elseif scenario=="backoff" then
    assert(connectedCount==1); tick(0.9); assert(connectedCount==1); tick(0.1); assert(connectedCount==2)
    tick(1.9); assert(connectedCount==2); tick(0.1); assert(connectedCount==3)
    tick(100); local before=connectedCount; tick(29); assert(connectedCount<=before+1)
elseif scenario=="mailbox-burst" then
    addUser(1); raw(codec.encode(snapshot())); raw(codec.encode(hearts())); raw(codec.encode({version=1,type="clear",mode="production",generation=2})); tick(); assert(count()==0)
    raw(codec.encode(snapshot("rehearsal",3))); raw(codec.encode(hearts("later",3))); tick(); assert(count()==1)
elseif scenario=="mailbox-overflow" then
    addUser(1); send(snapshot()); send(hearts()); for i=1,33 do raw(codec.encode({version=1,type="heartbeat",serverNowMs=1000})) end
    tick(); assert(count()==0 and shared.sa_connected==false and removals>=2)
elseif scenario=="malformed-json" then
    addUser(1); send(snapshot()); raw('{broken'); raw('null'); raw('42'); raw('["command"]'); tick(); assert(count()==0)
    send(hearts()); assert(count()==1,"malformed input must not kill the renderer")
elseif scenario=="invalid-snapshot" then
    addUser(1); local bad=snapshot(); bad.strip.width=0; send(bad); send(hearts()); assert(count()==0)
    bad=snapshot(); bad.render.maxHearts=1.5; send(bad); send(hearts("fractional")); assert(count()==0)
    send(snapshot()); send(hearts("good")); assert(count()==1)
elseif scenario=="wrong-session" then
    addUser(1); send(snapshot()); local value=hearts(); value.sessionId="wrong"; send(value); assert(count()==0)
elseif scenario=="heartbeat-expiry" then
    addUser(1); send(snapshot()); send({version=1,type="heartbeat",serverNowMs=20000}); send(hearts()); assert(count()==0)
elseif scenario=="virtual-clock" then
    addUser(1); local value=snapshot(); value.elapsedMs=25200000; send(value); send(hearts()); assert(count()==1)
    value.elapsedMs=300000; send(value); tick(5); assert(count()==0)
elseif scenario=="no-custom-service" then
    addUser(42); send(snapshot("rehearsal",1,{"sa_rehearsal_1"})); assert(not users["900001"] and users["42"] and leaves==0)
    assert(packets[#packets-1].code=="custom-service-required")
elseif scenario=="reload" then
    assert(not users["900001"] and not users["900002"] and leaves==2)
    send(snapshot("rehearsal",1,{"sa_rehearsal_3"})); assert(users["900003"] and #shared.sa_owned_ids==1)
elseif scenario=="wire-contract" then
    local file=assert(io.open(arg[3],"rb")); local message=file:read("*a"); file:close(); raw(message); tick(); assert(packets[#packets].type=="ready")
    addUser(1); send(hearts()); assert(count()==1)
else error("unknown scenario") end
print("OK "..scenario)
