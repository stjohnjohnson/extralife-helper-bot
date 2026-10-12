local script, scenario = arg[1], arg[2]
local shared, packets, users, objects, callbacks = {}, {}, {}, {}, {}
local codec = dofile("tests/lua/vendor/json.lua")
local logs = {}
local statusScenario = scenario:match("^status%-")
local statusHost
local statusCreateFailure = scenario=="status-create-error"
local statusCreateCalls = 0
local themeScenario = scenario:match("^theme%-") or scenario:match("^entrance%-")
local themeRevision = themeScenario and arg[3] or string.rep("a",64)
if not themeRevision then themeRevision=string.rep("a",64) end
-- Stream Avatars bundles a MoonSharp codec whose serializer emits \/,
-- but whose Lua lexer rejects it. get() round-trips tables through that codec.
local function hostParse(text)
    for slashes,slash in text:gmatch("(\\+)(/?)") do
        if slash == "/" and #slashes % 2 == 1 then error("invalid escape sequence near escaped slash") end
    end
    return codec.decode(text)
end
local function hostSerialize(value) return (codec.encode(value):gsub("/", "\\/")) end
local function clone(value) if type(value) ~= "table" or value==codec.null then return value end local copy={} for k,v in pairs(value) do copy[k]=clone(v) end return copy end
local connectedCount, leaves, removals = 0, 0, 0
local jumps, dances, exits = 0, 0, 0
local hugs, commands = {}, {}
local hostClock, cooldownWarnings = 0, 0
local cooldownScenario = scenario:match("^cooldown%-") ~= nil
local config = { url = "ws://127.0.0.1/sa/socket", token = "private-test-token", image = "sa_heart" }
if scenario=="cooldown-custom" then config.danceCooldownSeconds=25 end
if scenario=="cooldown-invalid" then config.hugCooldownSeconds="10" end
local expectedUrl=config.url
if scenario=="address-ip" then config={address="192.168.1.42",token=config.token}; expectedUrl="ws://192.168.1.42:3000/sa/socket" end
if scenario=="address-port" then config={address="192.168.1.42:4444",token=config.token}; expectedUrl="ws://192.168.1.42:4444/sa/socket" end
if scenario=="address-wss" then config={address="wss://bridge.example/sa/socket",token=config.token}; expectedUrl=config.address end
if scenario=="address-ipv6" then config={address="[::1]",token=config.token}; expectedUrl="ws://[::1]:3000/sa/socket" end
if scenario=="invalid-address" then config={address=" ",token=config.token} end
local app = {}
app.getStreamerUser = function()
    if scenario=="status-host-error" then error("private host lookup failure") end
    return statusHost
end
app.getResolution = function() return { x = 1920, y = 1080 } end
app.convertPercentToPosition = function(x,y) return { x = x * 1000, y = y * 200 } end
app.removeWebSocket = function(title) assert(title=="sa_helper_bridge"); removals=removals+1 end
app.createWebsocket = function(title,url) assert(title=="sa_helper_bridge" and url==expectedUrl); connectedCount = connectedCount + 1; if scenario~="async-open" and scenario~="backoff" then callbacks.websocket(title,"OnOpen","","") end end
app.sendWebsocketMessage = function(title,message) assert(title=="sa_helper_bridge" and type(message)=="string"); packets[#packets+1] = codec.decode(message) end
app.platformServiceSettings = {
    SetStreamer = function(id,name) assert(id==900000 and name=="sa_integration_host") end,
    SetUserJoin = function(id,name) assert(type(id)=="number" and id>=900001 and id<=900100 and name=="sa_integration_"..tostring(id-900000)); users[tostring(id)] = { id = id, displayName = name, isActive = true, getPosition = function() return { x=50, y=20 } end } end,
    SetUserLeave = function(id) assert(type(id)=="number" and id>=900001 and id<=900100); users[tostring(id)] = nil; leaves = leaves+1 end
}
app.createGameObject = function()
    if statusCreateFailure then statusCreateCalls=statusCreateCalls+1; error("private object creation failure") end
    local ob; ob = { removed = false, scale = 1, image = { anchor = function(where,dimensions) assert(where=="center" and dimensions==true); ob.anchored=true end, sorting = function(value,layer) assert(value==0 or value==1 or value==2); assert(layer=="behindBackground" or layer=="background" or (ob.name and ob.name:match("^sa_bridge_") and layer=="afterForeground")); if scenario=="theme-prop-sorting-error" and ob.name:find("scenery_one") then error("private native sorting failure") end; ob.layer=layer; ob.order=value end }, text = { setText = function(value) assert(type(value)=="string"); ob.caption=value end, setSize = function(value) assert(type(value)=="number" and value>0); ob.fontSize=value end } }
    local initialScaleFailure=scenario=="theme-prop-initial-scale-error" and #objects==4
    ob.setScale = function(x,y) assert(x==y); if initialScaleFailure and x==0 and not ob.name then error("private initial scale failure") end; if scenario=="theme-prop-scale-error" and x>0 and ob.name and ob.name:find("scenery_one") then error("private native scale failure") end; ob.scale=x end
    ob.setPosition = function(x,y) if scenario=="theme-prop-position-error" and ob.name and ob.name:find("scenery_one") then error("private native position failure") end; assert(not ob.removed and type(x)=="number" and type(y)=="number" and x==x and y==y and math.abs(x)<math.huge and math.abs(y)<math.huge); ob.x=x; ob.y=y end
    ob.destroy = function() ob.removed=true end
    objects[#objects+1]=ob; return ob
end
local loaders, loaderSequence = {}, 0
local allowImageCompletion = scenario~="pending-image-stop" and scenario~="theme-stale-load" and scenario~="status-delayed-image"
local env; env = {
    getApp = function() return app end,
    get = function(key)
        if scenario=="host-json-escapes" and type(shared[key])=="table" then return env.json.parse(hostSerialize(shared[key])) end
        return clone(shared[key])
    end, set = function(key,value) shared[key]=clone(value) end,
    load = function() shared.data = config end,
    getUsers = function() local list={} for _,user in pairs(users) do list[#list+1]=user end return list end,
    applyImage = function(ob,name) assert(type(name)=="string" and name:match("^sa_") and not ob.removed); ob.asset=name; ob.name=name; if themeScenario and name~="sa_heart" then assert(ob.scale==0, "pending theme must be invisible") end; if (scenario=="celebration-missing-confetti" and name=="sa_confetti") or (scenario=="celebration-missing-heart" and name=="sa_heart") then error("missing layer") end; if scenario=="missing-image" then error("missing image") end
        if statusScenario and name:match("^sa_bridge_") then
            assert(ob.scale==0, "pending status images must be invisible")
            if scenario=="status-missing-image" and name=="sa_bridge_healthy" then error("private missing status image") end
            if scenario=="status-delayed-image" and name=="sa_bridge_healthy" then while not allowImageCompletion do coroutine.yield() end end
            if scenario=="status-image-timeout" then while true do coroutine.yield() end end
        end
        if scenario=="theme-missing-backdrop" and name:find("backdrop") then error("missing backdrop") end
        if scenario=="theme-missing-prop" and name:find("scenery_one") then error("missing prop") end
        if scenario=="theme-backdrop-timeout" and name:find("backdrop") then
            while not allowImageCompletion do coroutine.yield() end
        end
        if (scenario=="theme-load-timeout" or scenario=="theme-pending-cap") and name~="sa_heart" then while true do coroutine.yield() end end
        if scenario=="theme-stale-load" and name~="sa_heart" then ob.imageLoaded=true; coroutine.yield() end; if scenario=="missing-image" then error("missing image") end
        if (scenario=="missing-image-host" or scenario=="image-pending-cap") then error("CLR missing image") end
        if scenario=="celebration-delay-cancel" or scenario=="image-load-delay" or scenario=="pending-image-stop" or scenario=="image-loaded-before-clear" then
            -- The real callback plays the image before it resumes the worker.
            ob.imageLoaded=true; coroutine.yield()
        end
        if scenario=="celebration-pending-cap" or scenario=="image-load-timeout" then while true do coroutine.yield() end end
        ob.imageLoaded=true
    end,
    log = function(message)
        logs[#logs+1]=message
        if type(config)=="table" and type(config.token)=="string" then assert(not message:find(config.token,1,true)) end
    end,
    yield = function() return coroutine.yield() end,
    json = { null=codec.null, serialize = scenario=="host-json-escapes" and hostSerialize or codec.encode, parse = scenario=="host-json-escapes" and hostParse or codec.decode }
}
-- MoonSharp json.null is a function; parsed JSON null is special userdata.
local nativeNull
if scenario:find("native-null",1,true) or scenario=="native-null-donation" or scenario=="native-null-goal" or scenario=="native-null-hidden" or scenario=="native-null-goal-only" then
    nativeNull=assert(io.tmpfile())
    env.json.null=function() return nativeNull end
    env.json.isnull=function(value) return value==nil or value==nativeNull end
    if scenario:find("-native-null-",1,true) then
        local originalMetatable=debug.getmetatable(nativeNull)
        local metatable={};for key,value in pairs(originalMetatable) do metatable[key]=value end
        local close=nativeNull.close
        metatable.__index=function(_,key) if key=="close" then return function(value) debug.setmetatable(value,originalMetatable);return close(value) end end error("cannot index native JsonNull: "..tostring(key)) end
        debug.setmetatable(nativeNull,metatable)
    end
    local function nativeDecode(value)
        if value==codec.null then return nativeNull end
        if type(value)=="table" then for key,item in pairs(value) do value[key]=nativeDecode(item) end end
        return value
    end
    env.json.parse=function(text) return nativeDecode(codec.decode(text)) end
end
-- Only the host-documented wall clock is exposed; no filesystem, shell, package
-- or dynamic-code access. Native cooldowns do not follow scaled game time.
env.os={time=function() return math.floor(hostClock) end}
local hostMath={};for key,value in pairs(math) do hostMath[key]=value end
hostMath.random=function(limit) return scenario=="hug-shuffle" and 1 or limit end
for _,name in ipairs({"type","pairs","ipairs","tonumber","tostring","pcall","math","table","string"}) do env[name]=_G[name] end
env.math=hostMath
setmetatable(app, { __index=function(_,key) error("Undocumented app API: "..tostring(key)) end })
-- addEvent must resolve only explicitly exported callbacks, never main-coroutine locals.
env.addEvent = function(name, callback) callbacks[name] = function(...) return env[callback](...) end end
env.async = function(name, ...)
    assert((name=="sa_load_heart" or name=="sa_load_theme") and type(env[name])=="function")
    loaderSequence=loaderSequence+1
    local worker=coroutine.create(env[name]); loaders[loaderSequence]=worker
    local ok=coroutine.resume(worker,...)
    -- The real host catches CLR exceptions at the child coroutine boundary.
    if not ok or coroutine.status(worker)=="dead" then loaders[loaderSequence]=nil end
    return loaderSequence
end
env.stopAsync = function(id) loaders[id]=nil end
if (scenario=="missing-image-host" or scenario=="image-pending-cap") then
    env.pcall=function(fn,...)
        local result={pcall(fn,...)}
        if not result[1] and tostring(result[2]):find("CLR missing image",1,true) then error(result[2]) end
        return table.unpack(result)
    end
end
local start = assert(loadfile(script, "t", env))()
local runner=coroutine.create(start)
local function tick(delta,wallDelta)
    hostClock=hostClock+(wallDelta or delta or 0.05)
    for _,pair in ipairs(hugs) do
        pair.frames=pair.frames+1
        if pair.frames==3 then pair.from.state="Hug";if users[tostring(pair.to.id)]==pair.to and pair.to.state=="Idle" then pair.to.state="Targeted" end end
        if pair.frames==30 then pair.from.state="Idle";if pair.to.state=="Targeted" then pair.to.state="Idle" end end
    end
    for _,user in pairs(users) do if user.pendingDance then
        user.pendingDance=user.pendingDance-1
        if scenario=="async-dance-alias" and user.pendingDance==2 then user.state="CustomAnimation";user.animation="idle" end
        if user.pendingDance==0 then user.pendingDance=nil;user.state="CustomAnimation";user.animation=scenario=="async-dance-alias" and "custom2" or (scenario=="async-dance-tween" and "idle" or "dance") end
    end end
    for id,worker in pairs(loaders) do
        local ok=true
        if allowImageCompletion then ok=coroutine.resume(worker) end
        if not ok or coroutine.status(worker)=="dead" then loaders[id]=nil end
    end
    local ok,err=coroutine.resume(runner,delta or 0.05); assert(ok,err)
end
local function raw(message) callbacks.websocket("sa_helper_bridge","OnMessage",message,"") end
local function send(message) raw(codec.encode(message)); tick() end
local function snapshot(mode,generation,ids)
    return {version=3,type="snapshot",mode=mode or "integration",generation=generation or 1,serverNowMs=1000,campaign={campaignId="session",initialized=true,totalCents=154350,goalCents=1000000,nextMilestoneCents=200000,goalHandled=false},integration={active=mode~="production",crowdIds=ids or {}},features={"hearts","crowd","campaign"}}
end
local function hearts(id,generation)
    return {version=3,type="hearts",mode="integration",generation=generation or 1,campaignId="session",id=id or "effect",issuedAtMs=1000,expiresAtMs=11000,durationMs=5000}
end
local function addUser(id,x,y)
    local user={id=id,isActive=true,x=x or 50,y=y or 20,gear="sentinel",state="Idle",animation="idle"}
    user.getState=function() return user.state end; user.getAnimation=function() return user.animation end
    user.exitState=function() exits=exits+1; user.state="Idle"; user.animation="idle" end
    user.runCommand=function(command,quiet)
        local target=command:match("^!{cmd:hug} ([A-Za-z0-9_:%-]+)$")
        commands[#commands+1]={from=tostring(user.id),target=target,command=command}
        assert(quiet==true and (command=="!{cmd:jump}" or command=="!{cmd:dance}" or target),"must use validated native commands")
        if cooldownScenario and (target or command=="!{cmd:dance}") then
            local action=target and "hug" or "dance"
            local duration=action=="dance" and (config.danceCooldownSeconds or 10) or 10
            user.lastAction=user.lastAction or {}
            if user.lastAction[action] and hostClock-user.lastAction[action]<duration then cooldownWarnings=cooldownWarnings+1;return end
            user.lastAction[action]=hostClock
            if scenario=="cooldown-dance-rejected" then return end
        end
        if target then
            if scenario=="hug-exception" then error("hug unavailable") end
            local partner=assert(users[target]);assert(partner~=user,"must not self-pair")
            hugs[#hugs+1]={from=user,to=partner,frames=0};return
        end
        if scenario=="celebration-faults" then error("action unavailable") end
        if command=="!{cmd:jump}" then jumps=jumps+1 else dances=dances+1; if scenario:match("^async%-dance") then user.pendingDance=3 else user.state="CustomAnimation"; user.animation="dance" end end
    end
    user.getPosition=function() return {x=user.x,y=user.y} end; users[tostring(id)]=user; return user
end
local function count() local n=0 for _,ob in ipairs(objects) do if not ob.removed and ob.imageLoaded and ob.scale>0 then n=n+1 end end return n end
local function assetCount(prefix) local n=0 for _,ob in ipairs(objects) do if not ob.removed and ob.imageLoaded and ob.scale>0 and ob.asset and (ob.asset==prefix or (prefix=="sa_digit" and ob.asset:find("sa_digit_",1,true))) then n=n+1 end end return n end
local function celebration(kind,id)
    local party=kind=="goal" or kind=="milestone"
    return {version=3,type="celebration",mode="integration",generation=1,campaignId="session",sequenceId=party and "party_1000" or "window_1000",phase=party and "party" or "recognition",id=id or "celebration",issuedAtMs=1000,expiresAtMs=11000,donationCount=party and 0 or 1,donationTotalCents=party and 0 or 2500,recognitionStartedAtMs=party and codec.null or 1000,recognitionAction=party and codec.null or "jump",heartsUntilMs=party and 0 or 6000,partyStartedAtMs=party and 1000 or codec.null,partyUntilMs=kind=="goal" and 21000 or (kind=="milestone" and 19000 or 0),kind=kind or "donation",campaignTotalCents=154350,milestoneCents=kind=="milestone" and 150000 or codec.null}
end
local function active() for _,ob in ipairs(objects) do if not ob.removed and ob.imageLoaded and ob.scale>0 then return ob end end end
if scenario=="host-json-escapes" then
    config.token="private/test\\path/token"
    local ok=pcall(hostParse,hostSerialize(config)); assert(not ok, "must reproduce embedded codec failure")
end
if statusScenario then statusHost=addUser("host",50,20); addUser("viewer",700,20) end
if scenario=="status-settings-missing" then config=nil end
if scenario=="status-settings-invalid" then config="invalid settings" end
if scenario=="status-token-missing" then config.token=nil end
if scenario=="status-token-short" then config.token="short" end
if scenario=="status-address-missing" then config.url=nil end
if scenario=="status-address-empty" then config.url="" end
if scenario=="status-address-whitespace" then config.url=" " end
if scenario=="invalid-settings" then config.url=42 end
if scenario=="invalid-token" then config.token=math.huge end
if scenario=="reload" then shared.sa_owned_ids={900001,900002}; users["900001"]={id=900001}; users["900002"]={id=900002} end
if scenario=="invalid-settings" or scenario=="invalid-token" or scenario=="invalid-address" or scenario=="cooldown-invalid" then
    local ok,err=coroutine.resume(runner); assert(ok,err); assert(coroutine.status(runner)=="suspended" and connectedCount==0, "invalid settings must retain rendering without opening a connection"); if nativeNull then nativeNull:close() end;print("OK "..scenario); return
end
tick()
if statusScenario then
    local function visible(name)
        local list={}; for _,ob in ipairs(objects) do if not ob.removed and ob.scale>0 and ob.name==name then list[#list+1]=ob end end
        return list
    end
    local function status(healthy)
        assert(#visible("sa_bridge_healthy")== (healthy and 1 or 0), "healthy logo must match authenticated fresh bridge state")
        assert(#visible("sa_bridge_unknown")== (healthy and 0 or 1), "question mark must cover unconfirmed bridge state")
        local indicator=visible(healthy and "sa_bridge_healthy" or "sa_bridge_unknown")[1]
        assert(indicator.scale==0.5, "both indicators must display at half size")
    end
    if scenario:match("^status%-settings%-") or scenario:match("^status%-token%-") or scenario:match("^status%-address%-") then
        status(false)
        for i=1,100 do tick(0,1) end
        status(false)
        assert(connectedCount==0 and #packets==0, "invalid settings must never attempt a connection or send authentication")
        assert(#objects==2 and shared.sa_pending_images==0, "unconfigured status must use a bounded pair of images")
        callbacks.websocket("sa_helper_bridge","OnOpen","",""); tick(); status(false)
        assert(#packets==0, "a late open callback must not authenticate with invalid settings")
        statusHost.isActive=false; tick(); assert(#visible("sa_bridge_unknown")==0, "unconfigured indicator must hide for an inactive host")
        statusHost=nil; tick(); assert(#visible("sa_bridge_unknown")==0, "unconfigured indicator must hide for an absent host")
    elseif scenario=="status-create-error" then
        for i=1,100 do tick() end
        assert(statusCreateCalls==1 and (shared.sa_pending_images or 0)==0, "status allocation failure must not retry or consume other image budgets")
        statusCreateFailure=false; send(snapshot()); send(celebration()); assert(#visible("sa_heart")==2, "status allocation failure must preserve donation rendering")
    elseif scenario=="status-host-error" then
        send(snapshot()); send(celebration()); assert(#visible("sa_heart")==2, "host lookup failure must preserve donation rendering")
    elseif scenario=="status-image-timeout" then
        send(snapshot()); tick(0,3); for i=1,100 do tick(0,1) end
        assert(#objects==2 and #visible("sa_bridge_healthy")==0 and #visible("sa_bridge_unknown")==0, "failed status loads must remain bounded and hidden")
        send(celebration()); assert(#visible("sa_heart")==2, "status image timeout must preserve donation rendering")
    elseif scenario=="status-missing-image" then
        send(snapshot()); status(false); send(celebration()); assert(#visible("sa_heart")==1, "question-mark fallback must replace only the host heart")
    elseif scenario=="status-delayed-image" then
        send(snapshot()); status(false); callbacks.websocket("sa_helper_bridge","OnClose","",""); tick(); allowImageCompletion=true; tick(); status(false)
    else
        status(false)
        if scenario=="status-startup" then
            send({version=3,type="heartbeat",serverNowMs=1000}); status(false)
            local bad=snapshot(); bad.campaign.totalCents=-1; send(bad); status(false)
        else
            send(snapshot()); tick(); status(true)
            if scenario=="status-timeout" then
                tick(0,31); status(false)
                send({version=3,type="heartbeat",serverNowMs=32000}); status(true)
            elseif scenario=="status-reconnect" or scenario=="status-close-open-race" then
                callbacks.websocket("sa_helper_bridge","OnClose","","")
                if scenario=="status-close-open-race" then callbacks.websocket("sa_helper_bridge","OnOpen","","") end
                tick(); status(false)
                if scenario=="status-reconnect" then tick(1.1); tick(); status(false) end
                send({version=3,type="heartbeat",serverNowMs=2000}); status(false)
                send(snapshot()); tick(); status(true)
            elseif scenario=="status-host-movement" then
                local ob=visible("sa_bridge_healthy")[1]; assert(ob.x==50 and ob.y==76 and ob.layer=="afterForeground", "compact logo must use the host's heart position")
                statusHost.x=400; tick(); assert(visible("sa_bridge_healthy")[1].x==400, "logo must follow the actual host")
                statusHost.isActive=false; tick(); assert(#visible("sa_bridge_healthy")==0 and #visible("sa_bridge_unknown")==0, "inactive host must hide status")
                statusHost=nil; tick(); assert(#visible("sa_bridge_healthy")==0 and #visible("sa_bridge_unknown")==0, "missing host must not attach status to a viewer")
                statusHost=users.host; statusHost.isActive=true; tick(); status(true)
                app.convertPercentToPosition=function(x,y) return {x=-200+x*400,y=y*100} end
                tick(); ob=visible("sa_bridge_healthy")[1]; assert(ob.x==184 and ob.y==76, "displayed status frame must stay inside resized bounds")
                app.convertPercentToPosition=function(x,y) return {x=x*40,y=y*40} end
                tick(); status(true); ob=visible("sa_bridge_healthy")[1]
                assert(ob.x==24 and ob.y==24, "compact status must fit a canvas smaller than the source frame")
                app.convertPercentToPosition=function(x,y) return {x=x*31,y=y*31} end
                tick(); assert(#visible("sa_bridge_healthy")==0 and #visible("sa_bridge_unknown")==0, "status must hide when the displayed frame cannot fit")
            elseif scenario=="status-clear" then
                send({version=3,type="clear",mode="integration",generation=2}); status(false)
                send(snapshot("integration",2)); status(true)
                assert(#objects==2, "campaign clears must reuse the two status assets")
            elseif scenario=="status-donation" or scenario=="status-legacy-hearts" then
                send(scenario=="status-donation" and celebration() or hearts()); tick(); status(true)
                local viewerHeart=visible("sa_heart")
                assert(#viewerHeart==1 and viewerHeart[1].x==700 and viewerHeart[1].scale==1, "indicator must replace only the host heart and preserve the viewer heart")
                if scenario=="status-donation" then assert(jumps==2, "host must retain its donation action") end
                statusHost=nil; tick(); assert(#visible("sa_heart")==2, "unavailable indicator must retain normal donation hearts")
                statusHost=users.host; tick(0,1); status(true); assert(#visible("sa_heart")==1, "returning host indicator must hide its existing heart while paused")
                statusHost=users.viewer; tick(0,1); status(true); viewerHeart=visible("sa_heart")
                assert(#viewerHeart==1 and viewerHeart[1].x==50 and visible("sa_bridge_healthy")[1].x==700, "replacement must follow the actual native host identity")
                statusHost=nil; tick(0,1); assert(#visible("sa_heart")==2, "indicator loss must restore the host heart while paused")
                statusHost=users.host; tick(0,31); status(false); assert(#visible("sa_heart")==1, "question mark must also replace the host heart")
                callbacks.websocket("sa_helper_bridge","OnClose","",""); tick(); status(false); assert(#visible("sa_heart")==0, "disconnect must clear donations and preserve the question mark")
            elseif scenario=="status-backward-clock" then
                tick(0,-2); status(false)
            end
        end
    end
    for _,message in ipairs(logs) do assert(not message:find("private host",1,true) and not message:find("private missing",1,true), "status logging must not expose native exception details") end
    print("OK "..scenario); return
end
local function captionText()
    local text=""
    local phrases={sa_dollar="$",sa_comma=",",sa_dot=".",sa_separator=" - ",sa_from=" FROM ",sa_donations=" DONATIONS - ",sa_thanks="THANK YOU!",sa_raised=" RAISED!",sa_goal="EXTRA LIFE GOAL REACHED!"}
    for _,ob in ipairs(objects) do if not ob.removed and ob.imageLoaded and ob.scale>0 and ob.asset then
        text=text..(phrases[ob.asset] or ob.asset:match("^sa_digit_(%d)$") or "")
    end end
    return text
end
local function timedGift(now,id,kind)
    send({version=3,type="heartbeat",serverNowMs=now})
    local v=celebration(kind,id);v.issuedAtMs=now;v.expiresAtMs=now+10000
    if v.phase=="recognition" then v.sequenceId="window_"..now;v.recognitionStartedAtMs=now;v.heartsUntilMs=now+5000 else v.partyStartedAtMs=now end
    if kind=="goal" then v.partyUntilMs=now+20000 elseif kind=="milestone" then v.partyUntilMs=now+18000 end
    return v
end
local function phaseSnapshot()
    return {version=3,type="snapshot",mode="integration",generation=1,serverNowMs=1000,campaign={campaignId="12",initialized=true,totalCents=247500,goalCents=1000000,nextMilestoneCents=250000,goalHandled=false},integration={active=true,crowdIds={}},features={"campaign","celebrations","donation-recognition"}}
end
local function phasePacket(phase,seq,id)
    local party=phase=="party"
    return {version=3,type="celebration",mode="integration",generation=1,campaignId="12",id=id or phase,sequenceId=seq or "sequence",issuedAtMs=1000,expiresAtMs=11000,phase=phase,kind=party and "milestone" or "donation",campaignTotalCents=252500,milestoneCents=party and 250000 or codec.null,donationCount=party and 0 or 1,donationTotalCents=party and 0 or 5000,recognitionStartedAtMs=party and codec.null or 1000,recognitionAction=party and codec.null or "jump",heartsUntilMs=party and 0 or 6000,partyStartedAtMs=party and 1000 or codec.null,partyUntilMs=party and 19000 or 0}
end
if themeScenario then
    local function themed(game, revision, theme)
        local value=snapshot(); value.integration.active=true
        value.theme={gameIdentity=game or string.rep("b",64),gameName="Minecraft",themeId=theme or "block-world",packRevision=revision or themeRevision}
        return value
    end
    local function entranceEvent(id, value)
        value=value or themed()
        return {version=3,type="game-entrance",mode=value.mode,generation=value.generation,campaignId=value.campaign.campaignId,id=id or "entrance",gameIdentity=value.theme.gameIdentity,themeId=value.theme.themeId,issuedAtMs=1000,expiresAtMs=11000,durationMs=6000}
    end
    local function themes() local n=0 for _,ob in ipairs(objects) do if ob.layer and not ob.removed and ob.scale>0 then n=n+1 end end return n end
    local function captions() local list={} for _,ob in ipairs(objects) do if ob.caption and not ob.removed then list[#list+1]=ob end end return list end
    local function themeObject() for _,ob in ipairs(objects) do if ob.name and ob.name~="sa_heart" and not ob.removed and ob.scale>0 then return ob end end end
    local worldFailure=scenario=="theme-missing-backdrop" or scenario=="theme-missing-prop" or scenario=="theme-backdrop-timeout" or scenario=="theme-load-timeout"
    local function worldDiagnostics(expected)
        local n=0
        for _,packet in ipairs(packets) do if packet.type=="diagnostic" then
            assert(packet.code=="missing-theme-image", "world failure must report a dedicated diagnostic without unrelated gear errors")
            local fields=0; for _ in pairs(packet) do fields=fields+1 end
            assert(fields==3 and packet.version==3, "world diagnostic must contain only bounded allowlisted vocabulary")
            n=n+1
        end end
        assert(n==expected, "world failure must emit one diagnostic per cooldown without a tile/reload flood")
    end
    if scenario:match("^theme%-density%-") then
        local n=tonumber(scenario:match("(%d+)$")); for i=1,n do addUser(i,i*5,20) end
    elseif not worldFailure then addUser(1) end
    if scenario=="theme-backdrop-timeout" then allowImageCompletion=false end
    if scenario=="theme-native-null-auth" then
        send(snapshot());local ready=#packets
        local value=snapshot();value.theme=codec.null;send(value)
        assert(#packets==ready+1 and packets[#packets].type=="ready", "native-null negotiated snapshot must be installed after base auth")
        send(celebration());tick();assert(assetCount("sa_heart")==1 and #captions()==0 and jumps==1)
        print("OK "..scenario);return
    end
    if scenario=="theme-no-game-title" then
        local textCalls=0
        local create=app.createGameObject
        app.createGameObject=function()
            local ob=create()
            ob.text.setText=function(value) textCalls=textCalls+1; ob.caption=value end
            return ob
        end
        send(themed()); tick(); local original=themeObject()
        send(entranceEvent()); assert(themes()==8 and jumps==1 and #objects==8 and textCalls==0, "game entrance must jump without allocating or displaying title text")
        local value=themed(string.rep("c",64)); value.theme.gameName="PlateUp! 🚀 <size=900>"; send(value); send(entranceEvent("shared",value))
        assert(themeObject()==original and jumps==2 and #objects==8 and textCalls==0, "shared-theme game must keep scenery and jump without title text")
        value=themed(string.rep("d",64),nil,"kitchen"); value.theme.gameName="kitchen"; send(value); tick(); send(entranceEvent("kitchen",value))
        assert(themes()==8 and jumps==3 and #objects==16 and textCalls==0, "theme switch must replace scenery without a title object")
        send(celebration()); tick()
        assert(captionText()=="$25 - THANK YOU!" and assetCount("sa_heart")==1 and textCalls==0, "removing game titles must preserve bitmap donation captions and hearts")
        value=themed(string.rep("e",64)); value.theme.themeId=nil; value.theme.gameName="Just Chatting"; send(value); send(entranceEvent("neutral",value))
        assert(themes()==0 and #captions()==0 and textCalls==0 and captionText()=="$25 - THANK YOU!", "neutral must clear scenery without title text or clearing donation captions")
        print("OK "..scenario);return
    end
    if scenario=="theme-no-native-gear" then
        local nativeGearCalls=0
        local function forbiddenGear()
            nativeGearCalls=nativeGearCalls+1; error("native cosmetics must not be accessed")
        end
        env.getAvatar=forbiddenGear
        local function guard(user)
            user.avatar="small"
            for _,method in ipairs({"getGear","getWearableGearSetPieces","setTemporaryGear","setGear","saveUserData","clearAllTemporarySelections"}) do user[method]=forbiddenGear end
        end
        guard(users["1"])
        send(themed()); tick(); assert(themes()==8 and nativeGearCalls==0, "legacy gear metadata must never invoke native gear APIs")
        send(entranceEvent()); assert(#captions()==0 and jumps==1)
        send(celebration()); tick(); local heart
        for _,ob in ipairs(objects) do if ob.asset=="sa_heart" and not ob.removed then heart=ob end end
        assert(heart and assetCount("sa_heart")==1, "scenery must preserve donation recognition")
        send(themed(nil,nil,"kitchen")); tick(); assert(themes()==8 and not heart.removed)
        local late=addUser(2); guard(late); tick(12); tick()
        send(snapshot()); tick(); send(themed()); tick()
        -- F5 destroys native Lua objects before starting the replacement script.
        for _,ob in ipairs(objects) do ob.destroy() end
        local oldRunner=runner; runner=coroutine.create(assert(loadfile(script,"t",env))()); tick(); send(themed()); tick()
        assert(coroutine.status(oldRunner)=="suspended" and themes()==8, "reload must restore scenery")
        callbacks.websocket("sa_helper_bridge","OnClose","",""); tick()
        assert(themes()==0 and nativeGearCalls==0 and users["1"].gear=="sentinel" and late.gear=="sentinel", "theme changes, late joins, reload and disconnect must preserve native cosmetics")
        for _,packet in ipairs(packets) do assert(packet.type~="diagnostic", "ignored legacy gear must not emit gear diagnostics") end
        print("OK "..scenario);return
    end
    send(themed()); tick()
    if scenario=="theme-native-background" then
        -- Installed TagManager order: behindBackground=1, background=2, Characters=8.
        -- A native background sprite at background/0 must not cover our continuous band.
        local layers={behindBackground=1,background=2,Characters=8}
        local visibleTiles=0
        for _,ob in ipairs(objects) do if ob.name and ob.name:find("backdrop") and not ob.removed and ob.scale>0 then
            local aboveNative=layers[ob.layer]>2 or (layers[ob.layer]==2 and ob.order>0)
            local belowCharacters=layers[ob.layer]<8
            if aboveNative and belowCharacters then visibleTiles=visibleTiles+1 end
        end end
        assert(visibleTiles==4, "all backdrop tiles must remain visible above native background and below characters")
    elseif scenario:match("^theme%-prop%-.+%-error$") then
        tick(); assert(themes()==7, "one failing prop must preserve four backdrops and three props")
        send(entranceEvent()); send(hearts()); tick()
        assert(jumps==1 and #captions()==0 and assetCount("sa_heart")==1 and themes()==7, "component failure must preserve the entrance jump and hearts")
        local function errors(expected)
            local n=0; for _,packet in ipairs(packets) do if packet.type=="diagnostic" then
                assert(packet.code=="theme-render-error", "placement failure must have its own diagnostic")
                local fields=0; for _ in pairs(packet) do fields=fields+1 end
                assert(fields==3, "component diagnostics must not expose native exception details")
                n=n+1
            end end
            assert(n==expected, "component errors must be bounded across theme reloads")
        end
        errors(1)
        if scenario=="theme-prop-initial-scale-error" then
            assert(objects[5].removed and shared.sa_pending_images==0, "initial scale failure must destroy its object without a pending load leak")
        else
            send(themed(nil,nil,"kitchen")); tick(); send(themed()); tick(); errors(1)
            tick(31); send(themed(nil,nil,"kitchen")); tick(); errors(2)
        end
    elseif scenario=="theme-stale-load" then
        allowImageCompletion=false; send(themed(string.rep("c",64),string.rep("d",64))); assert(themes()==0)
        send(themed()); assert(themes()==0); allowImageCompletion=true; tick(); tick(); assert(themes()==8)
        for i=1,8 do assert(objects[i].removed and objects[i].scale==0, "stale theme must stay invisible and be discarded") end
    elseif scenario=="theme-load-timeout" then
        assert(next(users)==nil, "timeout diagnostic regression must start with zero viewers")
        assert(themes()==0); tick(2.1); tick(); assert(themes()==0 and shared.sa_pending_images==8)
        worldDiagnostics(1)
        for _=1,10 do tick(0.1) end; worldDiagnostics(1)
        send({version=3,type="heartbeat",serverNowMs=4000}); assert(packets[#packets].type=="heartbeat")
    elseif scenario=="theme-pending-cap" then
        for i=1,15 do send(themed(nil,string.rep("d",64))); send(themed()); tick(2.1); tick() end
        assert(#objects==100 and shared.sa_pending_images==100, "theme must cap pending loads")
        send({version=3,type="heartbeat",serverNowMs=4000}); assert(packets[#packets].type=="heartbeat")
    elseif scenario=="theme-missing-backdrop" or scenario=="theme-missing-prop" or scenario=="theme-backdrop-timeout" then
        assert(next(users)==nil, "world diagnostic regression must start with zero viewers")
        local survivors=scenario=="theme-missing-prop" and 7 or 4
        if scenario=="theme-backdrop-timeout" then tick(2.1) end
        tick(); assert(themes()==survivors, "missing world image must preserve unaffected tiles/props")
        worldDiagnostics(1)
        for _=1,10 do tick(0.1) end; send(themed()); worldDiagnostics(1)
        addUser(1); send(hearts()); assert(count()==survivors+1, "world image failure must preserve hearts")
        local heart=objects[#objects]
        -- Trigger a second set of failed loads while the heart remains active.
        send(themed(nil,nil,"kitchen")); tick(); send(themed()); tick()
        if scenario=="theme-backdrop-timeout" then tick(2.1); tick() end
        assert(themes()==survivors and count()==survivors+1 and not heart.removed, "world reload failure must preserve the heart owner")
        worldDiagnostics(1)
        if scenario=="theme-backdrop-timeout" then
            allowImageCompletion=true; tick(); tick()
            assert(shared.sa_pending_images==0 and next(loaders)==nil, "cancelled callbacks must finish without leaked pending loads")
            assert(themes()==4, "timed-out backdrop callbacks must never become visible")
        end
        tick(30); tick(); send(themed(nil,nil,"kitchen")); tick(); send(themed()); tick()
        if scenario~="theme-backdrop-timeout" then worldDiagnostics(2) else worldDiagnostics(1); assert(themes()==8) end
        send({version=3,type="heartbeat",serverNowMs=40000}); assert(packets[#packets].type=="heartbeat")
        callbacks.websocket("sa_helper_bridge","OnClose","",""); tick(); assert(themes()==0, "missing component must not leak surviving props on disconnect")
    elseif scenario=="theme-small-bounds" then
        app.convertPercentToPosition=function(x,y) return {x=x*10,y=y*0.1} end; tick(); assert(themes()==0)
        app.convertPercentToPosition=function(x,y) return {x=x*1000,y=y*200} end; tick(); assert(themes()==8)
    else
        assert(themes()==8, "theme must create four literal tiles and four props")
        for _,ob in ipairs(objects) do
            assert(ob.layer=="background" and ob.order>0 and (not ob.name:find("scenery") or ob.order>1), "theme must appear above native background with props above the backdrop")
            if ob.name:find("backdrop") then assert(math.abs(ob.y-18.75)<0.0001, "center pivot must preserve baseline anchor") end
        end
        if scenario:match("^theme%-density%-") then
            local n=tonumber(scenario:match("(%d+)$")); send(entranceEvent()); assert(jumps==n and themes()==8 and #captions()==0)
            for _,user in pairs(users) do assert(user.x==user.id*5 and user.y==20, "world must preserve movement positions") end
        elseif scenario=="theme-kitchen" then
            send(themed(string.rep("c",64),nil,"kitchen")); tick(); assert(themes()==8)
            for _,ob in ipairs(objects) do if not ob.removed then assert(ob.name:match("^sa_kitchen_"), "new world must replace only old world") end end
        elseif scenario=="theme-shared-game" then
            local ob=themeObject(); local x=ob.x; local value=themed(string.rep("c",64)); value.theme.gameName="Minecraft Bedrock"; send(value); assert(themeObject()==ob and ob.x==x and #objects==8)
        elseif scenario=="theme-neutral" then
            local value=snapshot(); value.theme=nil; send(value); assert(themes()==0); send(hearts()); assert(count()==1)
        elseif scenario=="theme-resize" then
            local before={}; for _,ob in ipairs(objects) do before[ob]=ob.x end
            app.convertPercentToPosition=function(x,y) return {x=-100+x*777,y=-20+y*200} end; tick(); assert(themes()==8 and #objects==8)
            for _,ob in ipairs(objects) do assert(math.abs(ob.x-(-100+before[ob]*777/1000))<0.0001); assert(math.abs(ob.scale-777/1920)<0.0001) end
        elseif scenario=="theme-heart-coexistence" then
            send(hearts()); assert(count()==9); send(entranceEvent()); assert(count()==9 and #captions()==0); tick(5.1); tick(); assert(themes()==8 and count()==8 and #captions()==0); tick(1); tick(); assert(themes()==8 and #captions()==0)
        elseif scenario=="theme-reconnect-no-entrance" then
            assert(jumps==0 and #captions()==0); send(entranceEvent()); assert(jumps==1); callbacks.websocket("sa_helper_bridge","OnClose","",""); tick(); assert(themes()==0 and #captions()==0); tick(1.1); send(themed()); tick(); assert(themes()==8 and jumps==1 and #captions()==0)
        elseif scenario=="theme-native-null-recognition" or scenario=="theme-native-null-party" then
            local party=scenario=="theme-native-null-party";send(celebration(party and "milestone" or "donation"));tick()
            local effects={};for _,ob in ipairs(objects) do if not ob.layer and not ob.removed then effects[#effects+1]=ob end end
            assert(#effects>0);local actions=jumps+dances;local value=snapshot();value.theme=codec.null;send(value);tick()
            assert(themes()==0 and #captions()==0, "native-null theme must clear the world without replay")
            for _,ob in ipairs(effects) do assert(not ob.removed, "native-null theme must preserve each donation object") end
            assert(jumps+dances==actions and exits==0, "native-null theme must preserve donation actions")
            for _,packet in ipairs(packets) do assert(packet.type~="diagnostic", "native null must not throw") end
            send(entranceEvent("obsolete"));assert(#captions()==0 and jumps+dances==actions, "cleared snapshot must reject old entrance")
        elseif scenario=="theme-native-null-repeated-neutral" then
            local value=themed();value.theme.themeId=codec.null;value.theme.gameName="Just Chatting"
            send(value);send(entranceEvent("neutral",value));assert(#captions()==0 and themes()==0 and jumps==1)
            for _=1,3 do send(value);tick(0.2);assert(#captions()==0 and jumps==1, "unchanged native-null neutral snapshots must not add titles or replay the entrance") end
            tick(6);tick();assert(#captions()==0 and jumps==1, "neutral entrance must not replay")
        elseif scenario=="theme-wire-neutral" then
        local value=themed(); value.theme.themeId=codec.null; send(value); assert(themes()==0, "native JSON null must clear theme")
    elseif scenario=="theme-donation-jump" or scenario=="theme-donation-hug" or scenario=="theme-donation-party" then
        users={}; addUser(1); addUser(2)
        local gift=celebration(scenario=="theme-donation-party" and "milestone" or "donation")
        if scenario=="theme-donation-hug" then gift.recognitionAction="hug" end
        raw(codec.encode(entranceEvent())); raw(codec.encode(gift)); tick()
        assert(themes()==8 and #captions()==0, "donation must preserve scenery without adding a game title")
        if scenario=="theme-donation-jump" then assert(jumps==2, "same-frame entrance and donation must jump each avatar only once")
        elseif scenario=="theme-donation-hug" then assert(jumps==0 and #hugs==1, "entrance must defer to donation hug ownership")
        else assert(jumps==0 and dances==2, "entrance must defer to donation party ownership") end
    elseif scenario=="theme-production-gate" then
            local value=themed(); value.mode="production"; value.integration.active=false; send(value); assert(themes()==0, "candidate must never render in production")
            value=themed(); value.integration.active=false; send(value); assert(themes()==0, "candidate requires active rehearsal")
        elseif scenario=="theme-revision" then
            send(entranceEvent()); assert(#captions()==0); send(themed(nil,string.rep("d",64))); assert(themes()==0 and #captions()==0, "theme revision must cancel entrance"); send(themed()); tick(); assert(themes()==8 and #objects==16)
        elseif scenario=="theme-scope-cancellation" then
            for _,change in ipairs({"clear","mode","session","disconnect"}) do
                send(themed()); tick(); send(entranceEvent(change)); assert(#captions()==0)
                if change=="clear" then send({version=3,type="clear",mode="integration",generation=1})
                elseif change=="mode" then local value=snapshot("production"); send(value)
                elseif change=="session" then local value=snapshot(); value.campaign.campaignId="next"; send(value)
                else callbacks.websocket("sa_helper_bridge","OnClose","",""); tick() end
                assert(themes()==0 and #captions()==0, "scope cancellation must clear theme and entrance")
            end
        elseif scenario=="entrance-timing" then
            send(entranceEvent()); assert(#captions()==0 and jumps==1); send(entranceEvent()); assert(jumps==1)
            tick(6.1); tick(); assert(#captions()==0 and themes()==8 and jumps==1)
            -- An admitted action must not run if the native render loop resumes too late.
            send(themed()); raw(codec.encode(entranceEvent("delayed"))); tick(0); tick(6.1)
            assert(jumps==1, "pending entrance jump must expire after six seconds")
            local expired=entranceEvent("expired"); expired.issuedAtMs=0; expired.expiresAtMs=10000; send({version=3,type="heartbeat",serverNowMs=20000}); send(expired); assert(jumps==1)
        elseif scenario=="entrance-bounds-failure" then
            send(entranceEvent()); assert(#captions()==0 and jumps==1, "entrance must jump without title text before bounds fail")
            local convert=app.convertPercentToPosition
            app.convertPercentToPosition=function() error("native bounds unavailable") end
            for _=1,70 do tick(0.1) end
            assert(#captions()==0 and jumps==1, "bounds failure must not create titles or repeat entrance actions")
            send({version=3,type="heartbeat",serverNowMs=9000})
            assert(packets[#packets].type=="heartbeat", "bounds failure must preserve heartbeat transport")
            app.convertPercentToPosition=convert; send(themed()); tick()
            assert(themes()==8 and #captions()==0 and jumps==1, "bounds recovery must restore world without replaying entrance")
        elseif scenario=="entrance-obsolete" then
            local value=entranceEvent(); value.gameIdentity=string.rep("c",64); send(value); assert(jumps==0)
            value=entranceEvent(); value.themeId="kitchen"; send(value); assert(jumps==0)
            value=entranceEvent(); value.campaignId="wrong"; send(value); assert(jumps==0)
            value=entranceEvent(); value.generation=0; send(value); assert(jumps==0)
        elseif scenario=="entrance-neutral" then
            local value=themed(); value.theme.themeId=nil; value.theme.gameName="Just Chatting"; send(value); send(entranceEvent(nil,value)); assert(themes()==0 and #captions()==0 and jumps==1)
        elseif scenario=="entrance-supersession" then
            raw(codec.encode(entranceEvent())); local value=themed(string.rep("c",64)); value.theme.gameName="Next Game"; raw(codec.encode(value)); tick()
            assert(#captions()==0 and jumps==0 and themes()==8, "game switch must cancel an unconsumed entrance jump")
            send(entranceEvent("new",value)); assert(#captions()==0 and jumps==1 and themes()==8)
        end
    end
elseif scenario=="phase-ordered" then
    addUser(1);send(phaseSnapshot());send(phasePacket("recognition"));tick()
    assert(captionText()=="$50 - THANK YOU!" and dances==0 and jumps==1 and assetCount("sa_heart")==1,"recognition must precede party actions")
    tick(5);local p=phasePacket("party");p.issuedAtMs=6000;p.expiresAtMs=16000;p.partyStartedAtMs=6000;p.partyUntilMs=24000;send(p);tick()
    assert(captionText()=="$2,525 RAISED!" and dances==1 and jumps==1 and assetCount("sa_heart")==0,"party must replace only completed recognition visuals")
elseif scenario=="phase-regression" then
    addUser(1);send(phaseSnapshot());send(phasePacket("party"));local stale=phasePacket("recognition");stale.issuedAtMs=1001;send(stale);tick()
    assert(dances==1 and jumps==0 and assetCount("sa_thanks")==0,"party sequences must never regress to old thanks")
elseif scenario=="phase-schema" then
    addUser(1);send(phaseSnapshot())
    for i,patch in ipairs({{phase="party"},{partyStartedAtMs=1000},{campaignTotalCents=-1},{phase="future"},{sequenceId=""},{command="!dance"},{kind="goal"}}) do local p=phasePacket("recognition",nil,"bad"..i);for k,v in pairs(patch) do p[k]=v end;send(p);assert(jumps==0 and count()==0,"invalid phase metadata must be rejected") end
    local legacy=phasePacket("recognition");legacy.version=2;send(legacy);assert(jumps==0,"v2 must be rejected")
elseif scenario=="phase-party-update" then
    local user=addUser(1);send(phaseSnapshot());send(phasePacket("party"));user.state="Idle"
    local p=phasePacket("party",nil,"update");p.issuedAtMs=1001;p.kind="goal";p.partyUntilMs=21000;send(p);tick()
    assert(dances==1 and assetCount("sa_goal")==1,"party upgrades must retain attempted sequence IDs")
    tick(11);tick();assert(dances==1,"party updates must not readmit users when their native cooldown expires")
elseif scenario=="phase-delayed-party-update" then
    addUser(1);send(phaseSnapshot());send(phasePacket("party"));tick();assert(dances==1)
    tick(18);assert(assetCount("sa_confetti")==0,"original party must expire locally")
    local p=phasePacket("party",nil,"delayed-goal");p.issuedAtMs=18900;p.expiresAtMs=28900;p.kind="goal";p.partyUntilMs=38900
    send(p);tick();assert(dances==1 and assetCount("sa_goal")==1,"delayed goal upgrade must retain party action history after visual expiry")
    addUser(2);tick();assert(dances==2,"a late eligible avatar must join the retained party once")
    tick();assert(dances==2,"goal updates must not retry already attempted avatars")
elseif scenario=="recognition-delayed-extension" or scenario=="recognition-delayed-hug" then
    local hug=scenario=="recognition-delayed-hug"
    addUser(1);if hug then addUser(2) end;send(snapshot());local original=celebration();original.recognitionAction=hug and "hug" or "jump";send(original);tick()
    for i=1,35 do tick() end
    assert((hug and #hugs==1 and jumps==0) or (not hug and jumps==1))
    send({version=3,type="heartbeat",serverNowMs=6100});tick();assert(count()==0)
    local extension=celebration("donation","delayed");extension.issuedAtMs=5900;extension.expiresAtMs=15900;extension.heartsUntilMs=10900;extension.donationCount=2;extension.donationTotalCents=5000
    extension.recognitionAction=hug and "hug" or "jump"
    send(extension);tick();assert((hug and #hugs==1 and jumps==0) or (not hug and jumps==1),"delayed extension must retain handled avatars")
    assert(captionText()=="$50 FROM 2 DONATIONS - THANK YOU!" and assetCount("sa_heart")== (hug and 2 or 1))
elseif scenario=="recognition-delayed-suppression" then
    addUser(1);send(snapshot());send(celebration("goal"))
    local gift=timedGift(17000,"party-gift");gift.sequenceId="party_1000";send(gift);tick();assert(jumps==0)
    send({version=3,type="heartbeat",serverNowMs=22100});tick();assert(count()==0)
    local extension=celebration("donation","delayed-party-gift");extension.issuedAtMs=21900;extension.expiresAtMs=31900;extension.recognitionStartedAtMs=17000;extension.heartsUntilMs=26900;extension.donationCount=2;extension.donationTotalCents=5000;extension.sequenceId="party_1000"
    send(extension);tick();assert(jumps==0 and captionText()=="" and assetCount("sa_heart")==0,"a delayed recognition update must not revive a completed party sequence")
    send(timedGift(30000,"actually-fresh"));tick();assert(jumps==1 and captionText()=="$25 - THANK YOU!")
elseif scenario=="native-null-hidden" or scenario=="native-null-goal-only" then
    addUser(1);send(snapshot());local v=celebration(scenario=="native-null-goal-only" and "goal" or "donation")
    if scenario=="native-null-hidden" then v.donationTotalCents=codec.null
    else v.donationCount=0;v.donationTotalCents=0;v.recognitionStartedAtMs=codec.null;v.recognitionAction=codec.null;v.heartsUntilMs=0 end
    send(v);tick();assert(captionText()==(scenario=="native-null-hidden" and "THANK YOU!" or "EXTRA LIFE GOAL REACHED!"),"must accept native userdata null metadata")
    assert(assetCount("sa_heart")== (scenario=="native-null-hidden" and 1 or 0))
elseif scenario:match("^hug%-crowd%-%d+$") then
    local n=tonumber(scenario:match("(%d+)$"));for i=1,n do addUser(i) end;send(snapshot());local v=celebration();v.recognitionAction="hug";send(v);tick()
    assert(#hugs==math.floor(n/2) and jumps==n%2,"must issue one initiating hug per pair")
    local used={};for _,pair in ipairs(hugs) do local a,b=tostring(pair.from.id),tostring(pair.to.id);assert(not used[a] and not used[b] and a~=b,"must pair without reuse");used[a]=true;used[b]=true end
    for i=1,35 do tick() end;for _,user in pairs(users) do assert(user.state=="Idle") end;assert(exits==0,"hugs must finish natively")
elseif scenario=="hug-shuffle" then
    for i=1,4 do addUser(i) end;send(snapshot());local v=celebration();v.recognitionAction="hug";send(v)
    assert(#hugs==2 and hugs[1].from.id==2 and hugs[1].to.id==3 and hugs[2].from.id==4 and hugs[2].to.id==1,"must shuffle stable sorted users")
elseif scenario=="hug-once" then
    addUser(1);addUser(2);send(snapshot());local v=celebration();v.recognitionAction="hug";send(v);send(v)
    v.id="amount-update";v.donationCount=2;v.donationTotalCents=5000;send(v)
    assert(#hugs==1 and jumps==0,"amount updates must retain handled window")
    addUser(3);addUser(4);tick();assert(#hugs==2,"late joins pair only with unhandled users")
    for i=1,35 do tick() end
    tick(11) -- Advance the native per-user timer as well as the server clock.
    v=timedGift(12000,"new-window");v.recognitionAction="hug";send(v);assert(#hugs==4,"new start must reset actions")
elseif scenario=="hug-busy" or scenario=="jump-busy" then
    for i=1,6 do local u=addUser(i);if i<=4 then u.state=({"MiniGame","Hug","Targeted","CustomAnimation"})[i] end end
    send(snapshot());local v=celebration();v.recognitionAction=scenario=="hug-busy" and "hug" or "jump";send(v);tick()
    assert(#hugs==(scenario=="hug-busy" and 1 or 0) and jumps==(scenario=="jump-busy" and 2 or 0),"must leave busy users untouched")
    for _,cmd in ipairs(commands) do assert(cmd.from=="5" or cmd.from=="6","must preserve native action") end
elseif scenario=="hug-recheck" or scenario=="hug-recheck-initiator" then
    local a,b=addUser(1),addUser(2);local changed=scenario=="hug-recheck" and b or a;local calls=0
    changed.getState=function() calls=calls+1;if calls>=2 then changed.state="MiniGame" end;return changed.state end
    send(snapshot());local v=celebration();v.recognitionAction="hug";send(v);tick();assert(#hugs==0,"must recheck both users before command")
    for _,cmd in ipairs(commands) do assert(cmd.from~=tostring(changed.id),"must not jump busy fallback") end
elseif scenario=="hug-unsafe" or scenario=="hug-exception" then
    addUser(1);addUser(scenario=="hug-unsafe" and "2;injected" or 2);send(snapshot());local v=celebration();v.recognitionAction="hug";send(v);tick()
    assert(#hugs==0 and jumps==2,"unsafe/rejected pair must fall back to jumps")
    if scenario=="hug-unsafe" then for _,cmd in ipairs(commands) do assert(not cmd.command:find("hug",1,true),"must not dispatch unsafe ID") end end
    if scenario=="hug-exception" then local found=false;for _,p in ipairs(packets) do if p.code=="action-error" then found=true end end;assert(found) end
elseif scenario=="hug-party" then
    addUser(1);addUser(2);send(snapshot());local v=celebration("goal");send(v);assert(#hugs==0 and dances==2)
    v=timedGift(20000,"party-gift");v.recognitionAction="hug";v.sequenceId="party_1000";send(v);send({version=3,type="heartbeat",serverNowMs=22000});tick()
    assert(#hugs==0 and jumps==0 and assetCount("sa_heart")==0 and captionText()=="","a party sequence must not replay old actions")
elseif scenario=="hug-reload" or scenario=="hug-clear" or scenario=="hug-disconnect" or scenario=="hug-target-leaves" or scenario=="hug-takeover" then
    local a,b=addUser(1),addUser(2);send(snapshot());local v=celebration();v.recognitionAction="hug";send(v);tick();tick();assert(#hugs==1)
    if scenario=="hug-reload" then runner=coroutine.create(start);tick()
    elseif scenario=="hug-target-leaves" then users["2"]=nil
    elseif scenario=="hug-takeover" then b.state="MiniGame"
    elseif scenario=="hug-clear" then send({version=3,type="clear",mode="integration",generation=2})
    else callbacks.websocket("sa_helper_bridge","OnClose","","");tick() end
    tick(12);tick();assert(#hugs==1 and exits==0,"never force-exit/retry native hugs")
    if scenario=="hug-takeover" then assert(b.state=="MiniGame") end
    if scenario=="hug-clear" or scenario=="hug-disconnect" or scenario=="hug-reload" then
        for i=1,35 do tick() end
        if scenario=="hug-disconnect" then callbacks.websocket("sa_helper_bridge","OnOpen","","") end
        send(snapshot("integration",2));local fresh=celebration("donation","after-reset");fresh.generation=2;fresh.recognitionAction="hug";send(fresh);assert(#hugs==2,"clear/reconnect/reload must reset bookkeeping")
    end
elseif scenario=="caption-single" or scenario=="caption-batch" or scenario=="caption-cents" or scenario=="caption-hidden" then
    addUser(1);send(snapshot());local v=celebration();v.campaignTotalCents=50000
    local expected="$25 - THANK YOU!"
    if scenario=="caption-batch" then v.donationCount=2;expected="$25 FROM 2 DONATIONS - THANK YOU!"
    elseif scenario=="caption-cents" then v.donationTotalCents=2550;expected="$25.50 - THANK YOU!"
    elseif scenario=="caption-hidden" then v.donationTotalCents=codec.null;expected="THANK YOU!" end
    send(v);tick();assert(captionText()==expected, "fresh donation caption: "..captionText())
elseif scenario=="caption-shortening" then
    addUser(1);send(snapshot());local v=celebration();v.donationCount=100;v.donationTotalCents=12345678;send(v);tick()
    assert(captionText()=="$123,456.78 FROM 100 DONATIONS - THANK YOU!")
    v.id="hidden-update";v.donationTotalCents=codec.null;send(v);tick();assert(captionText()=="THANK YOU!" and jumps==1)
    assert(count()==2,"must release unused caption objects")
elseif scenario=="caption-party" then
    addUser(1);send(snapshot());send(celebration());tick();assert(captionText()=="$25 - THANK YOU!")
    local v=celebration("milestone","party");v.campaignTotalCents=50000;v.milestoneCents=50000;send(v);tick();assert(captionText()=="$500 RAISED!")
    local upgrade=celebration("goal","upgrade");send(upgrade);tick();assert(captionText()=="EXTRA LIFE GOAL REACHED!")
    local gift=timedGift(20000,"during-party");gift.sequenceId="party_1000";send(gift);tick();assert(captionText()=="EXTRA LIFE GOAL REACHED!")
    send({version=3,type="heartbeat",serverNowMs=22000});tick();assert(captionText()=="" and assetCount("sa_heart")==0 and jumps==1,"old party sequences must not replay donation captions")
    send(timedGift(27000,"fresh"));tick();assert(captionText()=="$25 - THANK YOU!" and jumps==2)
elseif scenario=="caption-bounds" then
    addUser(1);send(snapshot());local v=celebration();v.donationCount=9007199254740991;v.donationTotalCents=9007199254740991;send(v);tick()
    assert(captionText()=="$90,071,992,547,409.91 FROM 9007199254740991 DONATIONS - THANK YOU!",captionText())
    for _,canvas in ipairs({{x=-300,y=-200,w=90,h=64},{x=-700,y=-50,w=1500,h=300},{x=0,y=0,w=32,h=32}}) do
        app.convertPercentToPosition=function(x,y) return {x=canvas.x+x*canvas.w,y=canvas.y+y*canvas.h} end;tick()
        local captions=0
        for _,ob in ipairs(objects) do if not ob.removed and ob.imageLoaded and ob.scale>0 then
            assert(ob.x>=canvas.x and ob.x<=canvas.x+canvas.w and ob.y>=canvas.y and ob.y<=canvas.y+canvas.h)
            if ob.asset~="sa_heart" then
                captions=captions+1;local f=assert(io.open("integrations/stream-avatars/assets/"..ob.asset..".json"));local dimensions=codec.decode(f:read("*a"));f:close()
                assert(ob.x-dimensions.frameWidth*ob.scale/2>=canvas.x and ob.x+dimensions.frameWidth*ob.scale/2<=canvas.x+canvas.w,"caption width must fit canvas")
            end
        end end
        assert(captions<=48 and (shared.sa_pending_images or 0)<=128)
    end
elseif scenario=="recognition-schema" then
    addUser(1);send(snapshot())
    local bad={ {donationCount=-1}, {donationCount=1.5}, {donationTotalCents=-1}, {donationTotalCents=1.5}, {donationTotalCents=9007199254740992}, {recognitionAction="explode"}, {recognitionStartedAtMs=1001}, {heartsUntilMs=11001} }
    for i,patch in ipairs(bad) do local v=celebration();v.id="bad-"..i;for k,x in pairs(patch) do v[k]=x end;send(v);assert(count()==0 and jumps==0,"must reject malformed recognition") end
    for _,key in ipairs({"donationTotalCents","recognitionStartedAtMs","recognitionAction"}) do local v=celebration();v.id=key;v[key]=nil;send(v);assert(count()==0 and jumps==0,"must reject missing recognition fields") end
    local v=celebration();v.donationTotalCents=codec.null;send(v);tick();assert(assetCount("sa_thanks")==1 and jumps==1)
elseif scenario=="cooldown-dance-once" or scenario=="cooldown-dance-rejected" then
    local user=addUser(1);send(snapshot());send(celebration("milestone"))
    -- A mapped dance completes; a rejected request never enters a dance state.
    user.state="Wander";user.animation="idle"
    for i=1,17 do tick(1) end
    assert(#commands==1 and dances==(scenario=="cooldown-dance-rejected" and 0 or 1) and cooldownWarnings==0,"a party must never retry a completed or rejected dance")
elseif scenario=="cooldown-dance-upgrade" then
    local user=addUser(1);send(snapshot());send(celebration("milestone"));user.state="Idle"
    tick(3);local goal=celebration("goal","upgrade");goal.issuedAtMs=4000;goal.expiresAtMs=14000;goal.partyUntilMs=24000;send(goal)
    assert(#commands==1 and cooldownWarnings==0 and assetCount("sa_goal")==1,"a goal upgrade must retain the party's attempted users")
elseif scenario=="cooldown-dance-busy" then
    local user=addUser(1);user.state="MiniGame";send(snapshot());send(celebration("milestone"));tick(3)
    assert(#commands==0);user.state="Wander";tick();assert(dances==1,"busy users may join once they become eligible")
    user.state="Idle";tick(3);assert(#commands==1 and cooldownWarnings==0)
elseif scenario=="cooldown-clear" or scenario=="cooldown-reload" or scenario=="cooldown-disconnect" or scenario=="cooldown-custom" then
    local user=addUser(1);send(snapshot());send(celebration("milestone"));tick(3)
    if scenario=="cooldown-reload" then runner=coroutine.create(assert(loadfile(script,"t",env))());tick()
    elseif scenario=="cooldown-disconnect" then callbacks.websocket("sa_helper_bridge","OnClose","","");tick();callbacks.websocket("sa_helper_bridge","OnOpen","","")
    else send({version=3,type="clear",mode="integration",generation=2}) end
    send(snapshot("integration",2));local fresh=celebration("goal","new-party");fresh.generation=2;send(fresh)
    assert(dances==1 and #commands==1 and cooldownWarnings==0,"a reset must retain the native action budget")
    tick(8);tick();assert(dances==(scenario=="cooldown-custom" and 1 or 2) and cooldownWarnings==0,"admit once when the native timer expires")
    if scenario=="cooldown-custom" then tick(12);tick();assert(#commands==1,"a custom cooldown can outlast the whole party") end
elseif scenario=="cooldown-boundary" then
    local user=addUser(1);send(snapshot());send(celebration("milestone"));send({version=3,type="clear",mode="integration",generation=2})
    send(snapshot("integration",2));local fresh=celebration("goal","boundary");fresh.generation=2;send(fresh)
    tick(9.75);tick();assert(#commands==1 and cooldownWarnings==0,"whole-second truncation must not issue an early request")
    tick(1.1);tick();assert(#commands==2 and cooldownWarnings==0,"request becomes eligible after the full native timer")
elseif scenario=="cooldown-game-clock" then
    local user=addUser(1);send(snapshot());send(celebration("milestone"));send({version=3,type="clear",mode="integration",generation=2})
    send(snapshot("integration",2));local fresh=celebration("goal","fast-clock");fresh.generation=2;send(fresh)
    tick(11,0.2);tick()
    assert(#commands==1 and cooldownWarnings==0,"game time must not expire a real-time native cooldown")
elseif scenario=="cooldown-hug" or scenario=="cooldown-hug-reload" then
    local a,b=addUser(1),addUser(2);send(snapshot());local v=celebration();v.recognitionAction="hug";send(v)
    for i=1,35 do tick() end;tick(4)
    if scenario=="cooldown-hug-reload" then runner=coroutine.create(assert(loadfile(script,"t",env))());tick() end
    send(snapshot());v=celebration("donation","second");v.issuedAtMs=1001;v.recognitionStartedAtMs=1001;v.recognitionAction="hug";send(v)
    assert(#hugs==1 and jumps==2 and cooldownWarnings==0,"a nearby hug window must use jump fallback without sending a cooldown request")
    tick(11);send(snapshot());v=celebration("donation","third");v.issuedAtMs=1002;v.recognitionStartedAtMs=1002;v.recognitionAction="hug";send(v)
    assert(#hugs==2 and cooldownWarnings==0,"hugs become available after their native cooldown")
elseif scenario=="async-dance-manual-interruption" then
    local user=addUser(1);user.avatar="test-avatar";send(snapshot());send(celebration("milestone"))
    user.pendingDance=nil;user.state="CustomAnimation";user.animation="custom1"
    tick();tick(18);tick()
    assert(user.state=="CustomAnimation" and user.animation=="custom1" and exits==0,"must preserve a distinct intervening action")
elseif scenario=="async-dance-pending-avatar-reload" then
    local user=addUser(1);user.avatar="original-avatar";send(snapshot());send(celebration("milestone"))
    user.avatar="new-avatar";runner=coroutine.create(assert(loadfile(script,"t",env))());tick();tick();tick();tick()
    assert(user.state=="CustomAnimation" and exits==0,"must preserve avatar changes across pending reload")
elseif scenario=="dance-wander" then
    local user=addUser(1);user.state="Wander";send(snapshot());send(celebration("milestone"));tick()
    assert(user.state=="CustomAnimation" and dances==1,"must admit normal wandering avatars to the party")
    tick(18);tick();assert(user.state=="Idle" and exits==1)
elseif scenario=="async-dance-alias" or scenario=="async-dance-tween" then
    local user=addUser(1);user.avatar="test-avatar";send(snapshot());send(celebration("milestone"));tick();tick();tick();tick(2.1)
    assert(dances==1 and user.state=="CustomAnimation","must start native mapped or tweened dances without repeatedly issuing the command")
    tick(18);tick();assert(user.state=="CustomAnimation" and exits==0,"ambiguous custom sprites must finish their native duration without forced cleanup")
elseif scenario=="dance-other-animation" or scenario=="dance-avatar-change" then
    local user=addUser(1);user.avatar="test-avatar";send(snapshot());send(celebration("milestone"));tick()
    if scenario=="dance-other-animation" then user.animation="custom1" else user.avatar="changed-avatar" end
    tick();tick(18);tick();assert(user.state=="CustomAnimation" and exits==0,"must preserve a changed action or avatar")
elseif scenario=="async-dance-expiry" then
    local user=addUser(1); send(snapshot()); send(celebration("milestone"))
    assert(user.state=="Idle"); tick();tick();tick();tick()
    assert(user.animation=="dance" and #shared.sa_owned_dances==1,"must recognize a dance started on a later frame")
    tick(18);tick();assert(user.state=="Idle" and exits==1,"must stop the asynchronously started dance at expiry")
elseif scenario=="async-dance-reload" then
    local user=addUser(1);send(snapshot());send(celebration("milestone"));assert(user.state=="Idle")
    runner=coroutine.create(assert(loadfile(script,"t",env))());tick();tick();tick();tick()
    assert(user.state=="Idle" and exits==1,"must drain a queued dance across companion reload")
elseif scenario=="async-dance-cancel" then
    local user=addUser(1);send(snapshot());send(celebration("milestone"));send({version=3,type="clear",mode="integration",generation=2})
    tick();tick();tick();assert(user.state=="Idle" and exits==1,"must stop a queued dance that starts after cancellation")
elseif scenario=="async-dance-interrupted" then
    local user=addUser(1);send(snapshot());send(celebration("milestone"));user.pendingDance=nil;user.state="MiniGame";user.animation="attack"
    tick();tick(18);tick();assert(user.state=="MiniGame" and exits==0,"must preserve an intervening action")
elseif scenario=="async-dance-rejected" then
    local user=addUser(1);send(snapshot());send(celebration("milestone"));user.pendingDance=nil;user.state="MiniGame";tick(2.1)
    user.state="CustomAnimation";user.animation="dance";tick();tick(18);tick()
    assert(user.animation=="dance" and exits==0,"must not claim a later manual dance after the request times out")
elseif scenario=="async-dance-existing" then
    local user=addUser(1);user.state="CustomAnimation";user.animation="dance";send(snapshot());send(celebration("milestone"));tick(18);tick()
    assert(user.animation=="dance" and exits==0 and dances==0,"must leave a pre-existing dance alone")
elseif scenario=="milestone-whole-dollars" then
    addUser(1); send(snapshot()); local packet=celebration("milestone"); packet.campaignTotalCents=50000; packet.milestoneCents=50000
    send(packet); tick(); assert(assetCount("sa_digit")==3 and assetCount("sa_dot")==0 and assetCount("sa_raised")==1,"whole-dollar milestone must omit .00")
elseif scenario=="confetti-scatter" then
    app.convertPercentToPosition=function(x,y) return {x=x*1000,y=y*1000} end
    addUser(1); send(snapshot()); send(celebration("milestone")); tick()
    local particles,scales={},{}; local lowX,highX,lowY,highY=1000,0,1000,0
    for _,ob in ipairs(objects) do if ob.asset=="sa_confetti" and not ob.removed and ob.scale>0 then
        particles[#particles+1]={ob=ob,y=ob.y}; scales[ob.scale]=true
        lowX=math.min(lowX,ob.x);highX=math.max(highX,ob.x);lowY=math.min(lowY,ob.y);highY=math.max(highY,ob.y)
    end end
    assert(#particles==32 and highX-lowX>750 and highY-lowY>750,"confetti must cover the canvas, not one diagonal")
    local sizes=0;for _ in pairs(scales) do sizes=sizes+1 end;assert(sizes>=5,"confetti pieces need varied sizes")
    tick(0.25);tick();local slow,fast=1000,0
    for _,entry in ipairs(particles) do local fall=(entry.y-entry.ob.y)%1000;slow=math.min(slow,fall);fast=math.max(fast,fall) end
    assert(fast-slow>3,"confetti pieces need varied fall speeds")
elseif scenario=="celebration-pending-cap" then
    for i=1,101 do addUser(i) end; send(snapshot()); local v=celebration();v.donationCount=9007199254740991;v.donationTotalCents=9007199254740991;send(v);tick();assert(#objects==128 and shared.sa_pending_images==128)
    tick(2.1); tick(); assert(#objects==128 and count()==0)
elseif scenario=="wire-celebration" then
    local file=assert(io.open(arg[3],"rb")); local value=codec.decode(file:read("*a")); file:close()
    addUser(1); send(snapshot()); send(value); tick(); assert(assetCount(value.kind=="donation" and "sa_thanks" or value.kind=="goal" and "sa_goal" or "sa_raised")==1)
elseif scenario=="celebration-stale" then
    addUser(1); send(snapshot()); local goal=celebration("goal"); goal.issuedAtMs=1100; send(goal); tick();
    local old=celebration("milestone","old"); send(old); tick(); assert(assetCount("sa_goal")==1 and assetCount("sa_raised")==0)
elseif scenario=="celebration-density" then
    for i=1,105 do addUser(i) end; send(snapshot()); send(celebration("goal")); tick(); assert(assetCount("sa_heart")==0 and assetCount("sa_confetti")==32 and dances==101)
    local found=false; for _,packet in ipairs(packets) do if packet.code=="density-limit" then found=true end end; assert(found)
    assert((shared.sa_pending_images or 0)<=128)
    for _,ob in ipairs(objects) do if not ob.removed and ob.scale>0 then assert(ob.x>=0 and ob.x<=1000 and ob.y>=0 and ob.y<=200) end end
elseif scenario=="celebration-missing-confetti" or scenario=="celebration-missing-heart" then
    addUser(1);send(snapshot())
    if scenario=="celebration-missing-heart" then send(celebration());tick();assert(assetCount("sa_thanks")==1 and assetCount("sa_heart")==0) end
    send(celebration("milestone","party"));tick();assert(assetCount("sa_raised")==1)
    assert(assetCount("sa_heart")==0 and assetCount("sa_confetti")== (scenario=="celebration-missing-confetti" and 0 or 32))
    send({version=3,type="heartbeat",serverNowMs=1200});assert(packets[#packets].type=="heartbeat")
elseif scenario=="celebration-delay-cancel" then
    addUser(1); send(snapshot()); send(celebration("goal")); send({version=3,type="clear",mode="integration",generation=2}); tick(); assert(count()==0)
elseif scenario=="ordinary-101" or scenario=="native-null-donation" then
    for i=1,101 do addUser(i) end; send(snapshot()); send(celebration()); tick();
    assert(assetCount("sa_heart")==101 and jumps==101 and assetCount("sa_thanks")==1)
    tick(5); tick(); assert(count()==0)
elseif scenario=="milestone-banner" or scenario=="goal-banner" or scenario=="native-null-goal" or scenario=="gear-preservation" then
    local user=addUser(1); user.x=900; send(snapshot()); local kind=(scenario=="goal-banner" or scenario=="native-null-goal") and "goal" or "milestone"; send(celebration(kind)); tick();
    assert(assetCount("sa_confetti")==32 and assetCount(kind=="goal" and "sa_goal" or "sa_raised")==1 and dances==1)
    if kind=="milestone" then assert(assetCount("sa_digit")==6 and assetCount("sa_comma")==1 and assetCount("sa_dot")==1 and assetCount("sa_dollar")==1) end
    assert(user.gear=="sentinel"); tick(kind=="goal" and 20 or 18); tick(); assert(count()==0 and exits==1 and user.gear=="sentinel")
elseif scenario=="celebration-faults" then
    addUser(1); send(snapshot()); send(celebration("milestone")); tick(); assert(assetCount("sa_heart")==0 and assetCount("sa_raised")==1)
    send({version=3,type="heartbeat",serverNowMs=1200}); assert(packets[#packets].type=="heartbeat")
elseif scenario=="celebration-expiry" then
    addUser(1); send(snapshot()); send({version=3,type="heartbeat",serverNowMs=12000}); send(celebration()); assert(count()==0 and jumps==0)
    local v=celebration(); v.id="wrong"; v.campaignId="wrong"; v.expiresAtMs=22000; v.issuedAtMs=12000; send(v); assert(count()==0 and jumps==0)
elseif scenario=="celebration-merge" then
    addUser(1); send(snapshot()); send(celebration()); tick(); send(celebration()); assert(jumps==1)
    send(celebration("donation","next")); assert(jumps==1)
    send(celebration("milestone","party")); tick(); send(celebration("goal","upgrade")); tick(); assert(dances==1 and assetCount("sa_goal")==1)
elseif scenario=="celebration-late-join" then
    local user=addUser(1); send(snapshot()); send(celebration("milestone")); tick(); local late=addUser(2); tick(); tick(); assert(assetCount("sa_heart")==0 and dances==2)
    users["1"]=nil; tick(); assert(assetCount("sa_heart")==0); late.state="MiniGame"; late.animation="attack"; tick(20); tick(); assert(late.state=="MiniGame")
elseif scenario=="celebration-cancel" then
    addUser(1); send(snapshot()); send(celebration("goal")); send({version=3,type="clear",mode="integration",generation=2}); tick(); assert(count()==0 and exits==1)
elseif scenario=="image-pending-cap" then
    addUser(1)
    for i=1,105 do send(snapshot()); send(hearts("failed-"..i)); tick(2.1); tick() end
    assert(#objects==100 and shared.sa_pending_images==100, "must bound failed host loads")
    send({version=3,type="heartbeat",serverNowMs=1000}); assert(packets[#packets].type=="heartbeat")
elseif scenario=="missing-image-host" or scenario=="image-load-timeout" then
    addUser(1); send(snapshot()); send(hearts()); assert(count()==0)
    send({version=3,type="heartbeat",serverNowMs=1100}); assert(packets[#packets].type=="heartbeat")
    tick(2.1); tick(); assert(count()==0)
    assert(shared.sa_pending_images==1, "failed host callbacks retain one bounded pending load")
    assert(packets[#packets].code=="missing-heart-image")
    send({version=3,type="heartbeat",serverNowMs=4000}); assert(packets[#packets].type=="heartbeat")
elseif scenario=="image-loaded-before-clear" then
    addUser(1); send(snapshot()); send(hearts()); assert(count()==0)
    raw(codec.encode({version=3,type="clear",mode="integration",generation=1}))
    tick() -- worker finishes immediately before the parent processes clear.
    assert(shared.sa_pending_images==0 and next(loaders)==nil)
    for _,ob in ipairs(objects) do assert(ob.removed, "completed image must be destroyed before render acknowledgement") end
    for key,_ in pairs(shared) do assert(not key:match("^sa_image_"), "completed image leaked key") end
elseif scenario=="image-load-delay" then
    local user=addUser(1,500,20); send(snapshot()); send(hearts()); assert(count()==0)
    user.x=600; tick(); assert(count()==1 and active().x==600 and active().y==76)
elseif scenario=="pending-image-stop" then
    addUser(1); send(snapshot()); send(hearts()); assert(count()==0)
    callbacks.websocket("sa_helper_bridge","OnClose","",""); tick()
    assert(count()==0 and next(loaders)~=nil)
    for _,ob in ipairs(objects) do assert(not ob.removed, "host callback must retain its object") end
    allowImageCompletion=true; tick()
    assert(next(loaders)==nil and shared.sa_pending_images==0)
    for _,ob in ipairs(objects) do assert(ob.removed, "cancelled image must never become visible") end
    for key,_ in pairs(shared) do assert(not key:match("^sa_image_"), "late callback leaked completion key") end
elseif scenario=="host-json-escapes" then
    assert(packets[1].type=="auth" and packets[1].token==config.token)
    local message=snapshot(); message.campaign.campaignId="viewer/path\\name"
    send(message); assert(packets[#packets].type=="ready")
    addUser("real");local event=hearts();event.campaignId=message.campaign.campaignId;send(event);assert(count()==1)
    -- Even backslashes represent a literal backslash followed by slash, not \/.
    local values={path="literal\\/slash",url="ws://host/path",backslashes="\\\\/",quote='"/'}
    local decoded=env.json.parse(hostSerialize(values))
    for k,v in pairs(values) do assert(decoded[k]==v, "escape changed value: "..k) end
    decoded=env.json.parse(codec.encode(values))
    for k,v in pairs(values) do assert(decoded[k]==v, "wire escape changed value: "..k) end
    -- A valid near-limit JSON string with no slash must not cause quadratic
    -- pattern retries on every backslash; the harness has a five-second limit.
    local long={path=string.rep("\\",30000)}
    assert(env.json.parse(codec.encode(long)).path==long.path)
elseif scenario=="auth" or scenario:match("^address%-") then
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
    send(snapshot("integration",1,{"sa_integration_1","sa_integration_2"})); assert(users["900001"] and users["900002"])
    send(snapshot("integration",1,{"sa_integration_2"})); assert(not users["900001"] and leaves==1)
    send(snapshot("production",2)); assert(not users["900002"] and leaves==2)
elseif scenario=="invalid" then
    addUser(1); send(snapshot()); send({version=3,type="command",text="error()"}); assert(count()==0)
    send(hearts()); local ob=active(); send(hearts()); assert(count()==1 and active()==ob, "duplicate must not recreate or extend effects")
    callbacks.websocket("other_socket","OnClose","",""); tick(); assert(count()==1)
elseif scenario=="missing-image" then
    addUser(1); send(snapshot()); send(hearts()); assert(count()==0); tick(2.1); tick()
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
    app.convertPercentToPosition=function(x,y) return {x=-100+x*200,y=-100+y*100} end
    local user=addUser(1,-500,-500); send(snapshot()); send(hearts())
    assert(active().x==-84 and active().y==-84); user.x=500; user.y=500; tick(); assert(active().x==84 and active().y==-16)
elseif scenario=="density-rotation" then
    for i=1,100 do addUser(i,100+i*5,20) end
    send(snapshot()); send(hearts()); local first={} for _,ob in ipairs(objects) do if not ob.removed then first[ob.x]=true end end
    assert(count()==50); send(hearts("second")); assert(count()==50)
    for _,ob in ipairs(objects) do if not ob.removed then assert(not first[ob.x],"density must rotate across all eligible users") end end
elseif scenario=="same-snapshot" then
    addUser(1); send(snapshot()); send(hearts()); local ob=active(); send(snapshot()); assert(active()==ob and not ob.removed)
elseif scenario=="new-campaign" then
    addUser(1); send(snapshot()); send(hearts()); local value=snapshot(); value.campaign.campaignId="next"; send(value); assert(count()==0)
elseif scenario=="stale-control" then
    addUser(1); send(snapshot("integration",2)); send(hearts("current",2)); local ob=active()
    send({version=3,type="clear",mode="integration",generation=1}); assert(active()==ob and not ob.removed)
    send(snapshot("integration",1)); assert(active()==ob and not ob.removed)
elseif scenario=="stop" then
    send(snapshot("integration",1,{"sa_integration_1"})); send(hearts()); assert(count()==1)
    send({version=3,type="clear",mode="production",generation=2}); assert(count()==0 and not users["900001"])
elseif scenario=="close-open-race" then
    addUser(1); send(snapshot()); send(hearts()); assert(count()==1)
    callbacks.websocket("sa_helper_bridge","OnClose","",""); callbacks.websocket("sa_helper_bridge","OnOpen","","")
    raw(codec.encode(snapshot())); tick(); assert(count()==0,"disconnect must clear even if reopened before the next tick")
    send(hearts("new")); assert(count()==1,"fresh reconnect snapshot must survive cleanup")
elseif scenario=="socket-error" then
    send(snapshot("integration",1,{"sa_integration_1"})); send(hearts()); callbacks.websocket("sa_helper_bridge","OnError","private details",""); tick(); assert(count()==0 and not users["900001"])
elseif scenario=="async-open" then
    assert(#packets==0); callbacks.websocket("sa_helper_bridge","OnOpen","",""); assert(packets[1].type=="auth"); send(snapshot()); assert(packets[2].type=="ready")
elseif scenario=="backoff" then
    assert(connectedCount==1); tick(0.9); assert(connectedCount==1); tick(0.1); assert(connectedCount==2)
    tick(1.9); assert(connectedCount==2); tick(0.1); assert(connectedCount==3)
    tick(4); assert(connectedCount==4); tick(8); assert(connectedCount==5); tick(16); assert(connectedCount==6)
    tick(29.99); assert(connectedCount==6); tick(0.02); assert(connectedCount==7)
    tick(29.99); assert(connectedCount==7); tick(0.02); assert(connectedCount==8)
elseif scenario=="mailbox-burst" then
    addUser(1); raw(codec.encode(snapshot())); raw(codec.encode(hearts())); raw(codec.encode({version=3,type="clear",mode="production",generation=2})); tick(); assert(count()==0)
    raw(codec.encode(snapshot("integration",3))); raw(codec.encode(hearts("later",3))); tick(); assert(count()==1)
elseif scenario=="mailbox-overflow" then
    addUser(1); send(snapshot()); send(hearts()); for i=1,33 do raw(codec.encode({version=3,type="heartbeat",serverNowMs=1000})) end
    tick(); assert(count()==0 and shared.sa_connected==false and removals>=2)
elseif scenario=="malformed-json" then
    addUser(1); send(snapshot()); raw('{broken'); raw('null'); raw('42'); raw('["command"]'); tick(); assert(count()==0)
    send(hearts()); assert(count()==1,"malformed input must not kill the renderer")
elseif scenario=="invalid-snapshot" then
    addUser(1); local bad=snapshot(); bad.serverNowMs="invalid"; send(bad); send(hearts()); assert(count()==0)
    bad=snapshot(); bad.integration.crowdIds={"arbitrary-user"}; send(bad); send(hearts("fractional")); assert(count()==0)
    send(snapshot()); send(hearts("good")); assert(count()==1)
elseif scenario=="wrong-campaign" then
    addUser(1); send(snapshot()); local value=hearts(); value.campaignId="wrong"; send(value); assert(count()==0)
elseif scenario=="heartbeat-expiry" then
    addUser(1); send(snapshot()); send({version=3,type="heartbeat",serverNowMs=20000}); send(hearts()); assert(count()==0)
elseif scenario=="campaign-state" then
    addUser(1); local value=snapshot(); value.campaign.totalCents=25200000;value.campaign.nextMilestoneCents=25250000; send(value); send(hearts()); assert(count()==1)
    value.campaign.totalCents=300000;value.campaign.nextMilestoneCents=350000; send(value); tick(5); assert(count()==0)
elseif scenario=="crowd-no-extra-config" then
    addUser(42); send(snapshot("integration",1,{"sa_integration_1"})); assert(users["900001"] and users["42"] and leaves==0)
elseif scenario=="resized-bounds" then
    local user=addUser(1,900,500); send(snapshot()); send(hearts()); assert(active().x==900 and active().y==184)
    app.convertPercentToPosition=function(x,y) return {x=-200+x*400,y=y*100} end
    tick(); assert(active().x==184 and active().y==84)
elseif scenario=="small-bounds" then
    app.convertPercentToPosition=function(x,y) return {x=x*10,y=y*10} end
    addUser(1); send(snapshot()); send(hearts()); assert(count()==0)
    assert(packets[#packets].code=="render-error")
elseif scenario=="reload" then
    assert(not users["900001"] and not users["900002"] and leaves==2)
    send(snapshot("integration",1,{"sa_integration_3"})); assert(users["900003"] and #shared.sa_owned_ids==1)
elseif scenario=="wire-contract" then
    local file=assert(io.open(arg[3],"rb")); local message=file:read("*a"); file:close(); raw(message); tick(); assert(packets[#packets].type=="ready")
    addUser(1); local event=hearts(); event.campaignId="session_é"; send(event); assert(count()==1)
else error("unknown scenario") end
if nativeNull then nativeNull:close() end;print("OK "..scenario)
