-- Import as an On Connect script. Private settings belong in this script's JSON file.
script_trigger_type = "On Connect"

function sa_on_socket(title, event, message, code)
    if title ~= "sa_helper_bridge" then return end
    local app = getApp()
    if event == "OnOpen" then
        local settings = get("sa_settings")
        set("sa_connected", true)
        app.sendWebsocketMessage(title, json.serialize({ version=1, type="auth", token=settings.token }))
    elseif event == "OnMessage" then
        local queue = get("sa_mailbox") or {}
        if #queue >= 32 then set("sa_connected", false); app.removeWebSocket(title); return end
        queue[#queue+1] = message
        set("sa_mailbox", queue)
    elseif event == "OnClose" or event == "OnError" then
        set("sa_connected", false)
    end
end

return function()
    load()
    local settings = get("data")
    if type(settings) ~= "table" or type(settings.url) ~= "string" or type(settings.token) ~= "string" or #settings.token < 16 then
        log("SA bridge: configure private URL/token in the script JSON settings")
        return
    end
    local app = getApp()
    local socket = "sa_helper_bridge"
    local objects, owned, seen, seenOrder = {}, {}, {}, {}
    local snapshot, effect = nil, nil
    local elapsed, serverOffset, updateElapsed = 0, 0, 0
    local retryAt, retryDelay, rotation, wasConnected = 0, 1, 0, false
    local worldWidth = settings.worldWidth or 32
    local worldHeight = settings.worldHeight or 32
    local avatarTop = settings.avatarTopOffset or 40
    if worldWidth <= 0 or worldHeight <= 0 or avatarTop < 0 then log("SA bridge: invalid measured image geometry"); return end
    local function send(value) app.sendWebsocketMessage(socket, json.serialize(value)) end
    local function diagnostic(code) send({version=1,type="diagnostic",code=code}) end
    local function clearObjects()
        for _,entry in pairs(objects) do pcall(entry.object.destroy) end
        objects = {}; effect = nil
    end
    local function reconcileCrowd(ids)
        if not settings.customService then
            if #ids > 0 then diagnostic("custom-service-required") end
            return
        end
        local desired = {}
        for _,name in ipairs(ids) do
            local index = tonumber(string.match(name, "^sa_rehearsal_(%d+)$"))
            if index and index >= 1 and index <= 100 then desired[900000+index] = name end
        end
        for id,_ in pairs(owned) do if not desired[id] then app.platformServiceSettings.SetUserLeave(id); owned[id]=nil end end
        for id,name in pairs(desired) do if not owned[id] then app.platformServiceSettings.SetUserJoin(id,name); owned[id]=true end end
        local idsToRemember={}; for id,_ in pairs(owned) do idsToRemember[#idsToRemember+1]=id end
        set("sa_owned_ids",idsToRemember)
    end
    local function cleanup()
        clearObjects(); reconcileCrowd({}); snapshot=nil; set("sa_mailbox",{})
    end
    local function number(value) return type(value)=="number" and value==value and value~=math.huge and value~=-math.huge end
    local function validCrowd(ids)
        if type(ids)~="table" or #ids>100 then return false end
        for _,name in ipairs(ids) do
            if type(name)~="string" or not string.match(name,"^sa_rehearsal_%d+$") then return false end
            local n=tonumber(string.match(name,"(%d+)$")); if n<1 or n>100 then return false end
        end
        return true
    end
    local function validSnapshot(value)
        return type(value.session)=="table" and type(value.strip)=="table" and type(value.render)=="table" and
            number(value.serverNowMs) and number(value.strip.x) and number(value.strip.y) and number(value.strip.width) and number(value.strip.height) and
            value.strip.width>=worldWidth and value.strip.height>=worldHeight and type(value.rehearsal)=="table" and validCrowd(value.rehearsal.crowdIds) and
            number(value.render.maxHearts) and value.render.maxHearts>=1 and value.render.maxHearts<=100 and
            number(value.render.heartOffset) and value.render.heartOffset>=0
    end
    local function handleMessage(value)
        if type(value)~="table" or value.version~=1 then diagnostic("unsupported-message"); return end
        if value.type=="heartbeat" and number(value.serverNowMs) then
            serverOffset=value.serverNowMs-elapsed*1000
            send({version=1,type="heartbeat"}); return
        end
        if (value.mode~="production" and value.mode~="rehearsal") or not number(value.generation) or value.generation<0 then return end
        if value.type=="clear" then
            clearObjects(); reconcileCrowd({}); snapshot=nil
        elseif value.type=="snapshot" and validSnapshot(value) then
            if not snapshot or snapshot.generation~=value.generation or snapshot.mode~=value.mode or snapshot.session.sessionId~=value.session.sessionId then clearObjects() end
            snapshot=value; serverOffset=value.serverNowMs-elapsed*1000; retryDelay=1
            reconcileCrowd(value.mode=="rehearsal" and value.rehearsal.crowdIds or {})
            local resolution=app.getResolution()
            send({version=1,type="ready",capabilities={"hearts","crowd","session","clock"},resolution={width=resolution.x,height=resolution.y}})
        elseif value.type=="crowd" and snapshot and snapshot.mode=="rehearsal" and value.mode==snapshot.mode and value.generation==snapshot.generation and validCrowd(value.crowdIds) then
            reconcileCrowd(value.crowdIds)
        elseif value.type=="hearts" and snapshot and value.mode==snapshot.mode and value.generation==snapshot.generation and value.sessionId==snapshot.session.sessionId and
            type(value.id)=="string" and #value.id>0 and #value.id<=128 and number(value.expiresAtMs) and number(value.issuedAtMs) and value.expiresAtMs>value.issuedAtMs and
            value.expiresAtMs-value.issuedAtMs<=10000 and value.expiresAtMs>elapsed*1000+serverOffset and value.durationMs==5000 and not seen[value.id] then
            clearObjects()
            seen[value.id]=true; seenOrder[#seenOrder+1]=value.id
            if #seenOrder>256 then seen[table.remove(seenOrder,1)]=nil end
            effect={ends=elapsed+5,offset=rotation}; rotation=rotation+snapshot.render.maxHearts
        else diagnostic("unsupported-message") end
    end
    local function renderTick()
        if not effect or not snapshot then return end
        if elapsed>=effect.ends then clearObjects(); return end
        local users=getUsers(); table.sort(users,function(a,b) return tostring(a.id)<tostring(b.id) end)
        local selected={}; local count=math.min(#users,snapshot.render.maxHearts)
        for i=1,count do local user=users[((i-1+effect.offset)%#users)+1]; selected[tostring(user.id)]=user end
        for id,entry in pairs(objects) do if not selected[id] then pcall(entry.object.destroy); objects[id]=nil end end
        for id,user in pairs(selected) do
            local entry=objects[id]
            if not entry then
                local object=app.createGameObject()
                local ok=pcall(function() applyImage(object,"sa_heart"); object.image.anchor("center",true) end)
                if not ok then object.destroy(); diagnostic("missing-heart-image"); clearObjects(); return end
                entry={object=object}; objects[id]=entry
            end
            local pos=user.getPosition(); local strip=snapshot.strip
            local x=math.max(strip.x+worldWidth/2,math.min(strip.x+strip.width-worldWidth/2,pos.x))
            local y=math.max(strip.y+worldHeight/2,math.min(strip.y+strip.height-worldHeight/2,pos.y+avatarTop+snapshot.render.heartOffset))
            entry.object.setPosition(x,y)
        end
    end
    -- Reload cleanup uses only IDs this companion previously created, never real viewers.
    if settings.customService then
        for _,id in ipairs(get("sa_owned_ids") or {}) do if id>=900001 and id<=900100 then app.platformServiceSettings.SetUserLeave(id) end end
        app.platformServiceSettings.SetStreamer(900000,"sa_rehearsal_host")
    end
    set("sa_settings",settings); set("sa_mailbox",{}); set("sa_connected",false)
    app.removeWebSocket(socket); addEvent("websocket","sa_on_socket")
    local bottom=app.convertPercentToPosition(0,0); local top=app.convertPercentToPosition(1,1)
    log("SA game bounds: "..bottom.x..","..bottom.y.." to "..top.x..","..top.y)
    while true do
        local connected=get("sa_connected")
        if not connected and wasConnected then cleanup(); retryAt=elapsed+retryDelay; retryDelay=math.min(30,retryDelay*2) end
        wasConnected=connected
        if not connected and elapsed>=retryAt then
            retryAt=elapsed+retryDelay; retryDelay=math.min(30,retryDelay*2)
            app.removeWebSocket(socket); app.createWebsocket(socket,settings.url)
            wasConnected=get("sa_connected")
        end
        local queue=get("sa_mailbox") or {}; set("sa_mailbox",{})
        for _,raw in ipairs(queue) do
            local ok,value=pcall(json.parse,raw)
            if ok then local handled=pcall(handleMessage,value); if not handled then clearObjects(); diagnostic("render-error") end
            else diagnostic("unsupported-message") end
        end
        if updateElapsed>=0.05 then local ok=pcall(renderTick); if not ok then clearObjects(); diagnostic("render-error") end; updateElapsed=0 end
        local delta=yield()
        if number(delta) and delta>0 then elapsed=elapsed+delta; updateElapsed=updateElapsed+delta end
    end
end
