-- Import as an On Connect script. Private settings belong in this script's JSON file.
script_trigger_type = "On Connect"

-- The package generator updates these dimensions from the sa_heart manifest.
local HEART_WIDTH, HEART_HEIGHT = 32, 32
local MAX_HEARTS, AVATAR_TOP = 50, 40

-- Some bundled MoonSharp versions serialize / as \/ but cannot parse it.
-- get() internally round-trips tables with this codec, including our URL and
-- queued messages. Normalize only odd backslash runs; preserve literal \\/.
local parseJson = json.parse
json.parse = function(text, ...)
    local compatible = text:gsub("(\\+)(/?)", function(slashes, slash)
        if slash == "/" and #slashes % 2 == 1 then return slashes:sub(1, -2)..slash end
        return slashes..slash
    end)
    return parseJson(compatible, ...)
end

-- Image loading yields and CLR host errors can escape Lua pcall. Keep it in
-- a child coroutine so transport, expiry and cleanup continue independently.
function sa_load_heart(object, key, asset)
    local ok=pcall(function() applyImage(object,asset or "sa_heart") end)
    set("sa_pending_images",math.max(0,(get("sa_pending_images") or 1)-1))
    if get(key)=="cancelled" then object.destroy(); set(key,nil); return end
    if not ok then set(key,"failed"); return end
    object.image.anchor("center",true)
    set(key,"loaded")
end

function sa_on_socket(title, event, message, code)
    if title ~= "sa_helper_bridge" then return end
    local app = getApp()
    if event == "OnOpen" then
        local settings = get("sa_settings")
        set("sa_connected", true)
        app.sendWebsocketMessage(title, json.serialize({ version=2, type="auth", token=settings.token }))
    elseif event == "OnMessage" then
        if not get("sa_connected") then return end
        local queue = get("sa_mailbox") or {}
        if #queue >= 32 then set("sa_connected", false); set("sa_disconnect_pending",true); set("sa_mailbox",{}); app.removeWebSocket(title); return end
        queue[#queue+1] = message
        set("sa_mailbox", queue)
    elseif event == "OnClose" or event == "OnError" then
        set("sa_connected", false); set("sa_disconnect_pending",true); set("sa_mailbox",{})
    end
end

return function()
    load()
    local settings = get("data")
    if type(settings) ~= "table" or type(settings.address or settings.url) ~= "string" or type(settings.token) ~= "string" or #settings.token < 16 then
        log("SA bridge: configure private address/token in the script JSON settings")
        return
    end
    local function number(value) return type(value)=="number" and value==value and value~=math.huge and value~=-math.huge end
    local function integer(value) return number(value) and value%1==0 end
    local app = getApp()
    local socket = "sa_helper_bridge"
    local objects, owned, seen, seenOrder = {}, {}, {}, {}
    local snapshot, effect = nil, nil
    local generationFloor = -1
    local loadSequence = get("sa_load_sequence") or 0
    local elapsed, serverOffset, updateElapsed = 0, 0, 0
    local retryAt, retryDelay, rotation, wasConnected = 0, 1, 0, false
    local address = settings.address or settings.url
    if #address==0 or address:find("%s") then log("SA bridge: invalid connection address"); return end
    settings.url = address:match("^wss?://") and address or ("ws://"..address..(address:match(":%d+$") and "" or ":3000").."/sa/socket")
    local previewHostSet = false
    local function gameBounds()
        local bottom=app.convertPercentToPosition(0,0); local top=app.convertPercentToPosition(1,1)
        if not number(bottom.x) or not number(bottom.y) or not number(top.x) or not number(top.y) then return nil end
        local width, height = top.x-bottom.x, top.y-bottom.y
        if width<HEART_WIDTH or height<HEART_HEIGHT then return nil end
        return {x=bottom.x,y=bottom.y,width=width,height=height}
    end
    local function send(value) app.sendWebsocketMessage(socket, json.serialize(value)) end
    local function diagnostic(code) send({version=2,type="diagnostic",code=code}) end
    local function release(entry)
        local status=get(entry.key)
        if not entry.loaded and status~="failed" and status~="loaded" then
            -- stopAsync cannot cancel the host image callback. Leave its object
            -- alive until it returns, then let the worker discard the image.
            set(entry.key,"cancelled")
        else set(entry.key,nil); pcall(entry.object.destroy) end
    end
    local clearCelebration
    local function clearObjects()
        if clearCelebration then clearCelebration() end
        for _,entry in pairs(objects) do release(entry) end
        objects = {}; effect = nil
    end
    local function reconcileCrowd(ids)
        local desired = {}
        for _,name in ipairs(ids) do
            local index = tonumber(string.match(name, "^sa_integration_(%d+)$"))
            if index and index >= 1 and index <= 100 then desired[900000+index] = name end
        end
        for id,_ in pairs(owned) do if not desired[id] then app.platformServiceSettings.SetUserLeave(id); owned[id]=nil end end
        for id,name in pairs(desired) do if not owned[id] then app.platformServiceSettings.SetUserJoin(id,name); owned[id]=true end end
        local idsToRemember={}; for id,_ in pairs(owned) do idsToRemember[#idsToRemember+1]=id end
        set("sa_owned_ids",idsToRemember)
    end
    local function cleanup()
        clearObjects(); reconcileCrowd({}); snapshot=nil; generationFloor=-1
    end
    local function validCrowd(ids)
        if type(ids)~="table" or #ids>100 then return false end
        for _,name in ipairs(ids) do
            if type(name)~="string" or not string.match(name,"^sa_integration_%d+$") then return false end
            local n=tonumber(string.match(name,"(%d+)$")); if n<1 or n>100 then return false end
        end
        return true
    end
    local function validSnapshot(value)
        return type(value.session)=="table" and number(value.serverNowMs) and type(value.integration)=="table" and
            type(value.integration.active)=="boolean" and validCrowd(value.integration.crowdIds)
    end
    -- Separate registries contain only objects created by this companion.
    local recognition, celebration = nil, nil
    local heartLayer, particleLayer, captionLayer, dancing, jumped, actionAttempts = {}, {}, {}, {}, {}, {}
    local reported = {}; local lastCelebrationIssuedAt=-1
    local function report(code) if not reported[code] then reported[code]=true; diagnostic(code) end end
    local function clearLayer(layer) for _,entry in pairs(layer) do if entry.object then release(entry) end end end
    local function stopDances()
        for _,user in pairs(dancing) do pcall(function()
            if user.getState()=="CustomAnimation" and user.getAnimation()=="dance" then user.exitState() end
        end) end
        dancing={}; set("sa_owned_dances",{})
    end
    clearCelebration=function()
        clearLayer(heartLayer); clearLayer(particleLayer); clearLayer(captionLayer); stopDances()
        heartLayer={}; particleLayer={}; captionLayer={}; jumped={}; actionAttempts={}; recognition=nil; celebration=nil; reported={}; lastCelebrationIssuedAt=-1
    end
    local function imageEntry(layer,id,asset)
        local entry=layer[id]
        if not entry then
            local pending=get("sa_pending_images") or 0
            if pending>=128 then return nil end
            set("sa_pending_images",pending+1); loadSequence=loadSequence+1; set("sa_load_sequence",loadSequence)
            local key="sa_image_"..loadSequence
            entry={object=app.createGameObject(),key=key,deadline=elapsed+2}; layer[id]=entry
            entry.object.setScale(0,0); entry.loader=async("sa_load_heart",entry.object,key,asset)
        end
        if entry.failed then return nil end
        if not entry.loaded then
            if get(entry.key)=="loaded" then entry.loaded=true; set(entry.key,nil)
            elseif get(entry.key)=="failed" or elapsed>=entry.deadline then
                release(entry); entry.failed=true; report(asset=="sa_heart" and "missing-heart-image" or "missing-celebration-image"); return nil
            end
        end
        return entry
    end
    local function place(layer,id,asset,x,y,scale)
        local entry=imageEntry(layer,id,asset)
        if entry then entry.object.setPosition(x,y); if entry.loaded then entry.object.setScale(scale,scale) end end
    end
    local function moneyGlyphs(cents)
        local dollars=tostring(math.floor(cents/100)); local grouped=dollars:reverse():gsub("(%d%d%d)","%1,"):reverse():gsub("^,","")
        return "$"..grouped.."."..string.format("%02d",cents%100)
    end
    local function captionItems()
        if celebration and celebration.kind=="goal" then return {{asset="sa_goal_accent",width=32,height=32},{asset="sa_goal",width=431,height=23}} end
        if celebration then
            local result={}; local text=moneyGlyphs(celebration.liveTotalCents)
            for char in text:gmatch(".") do result[#result+1]={asset=char=="$" and "sa_dollar" or (char=="," and "sa_comma" or (char=="." and "sa_dot" or "sa_digit_"..char)),width=17,height=23} end
            result[#result+1]={asset="sa_raised",width=341,height=23}; return result
        end
        return {{asset="sa_thanks",width=179,height=23}}
    end
    local function validCelebration(value)
        local allowed={version=true,type=true,mode=true,generation=true,sessionId=true,id=true,issuedAtMs=true,expiresAtMs=true,heartsUntilMs=true,partyUntilMs=true,kind=true,liveTotalCents=true,milestoneCents=true}
        for key,_ in pairs(value) do if not allowed[key] then return false end end
        return (value.kind=="donation" or value.kind=="milestone" or value.kind=="goal") and type(value.id)=="string" and #value.id>0 and #value.id<=128 and
            integer(value.issuedAtMs) and integer(value.expiresAtMs) and value.expiresAtMs>value.issuedAtMs and value.expiresAtMs<=value.issuedAtMs+10000 and
            integer(value.heartsUntilMs) and value.heartsUntilMs>=0 and value.heartsUntilMs<=value.issuedAtMs+10000 and
            integer(value.partyUntilMs) and value.partyUntilMs>=0 and value.partyUntilMs<=value.issuedAtMs+38000 and
            integer(value.liveTotalCents) and value.liveTotalCents>=0 and value.liveTotalCents<=9007199254740991 and
            (value.milestoneCents==nil or value.milestoneCents==json.null or (integer(value.milestoneCents) and value.milestoneCents>0 and value.milestoneCents<=value.liveTotalCents))
    end
    local function acceptCelebration(value)
        local serverNow=elapsed*1000+serverOffset
        if not validCelebration(value) or value.expiresAtMs<=serverNow or value.issuedAtMs<lastCelebrationIssuedAt or seen[value.id] then return end
        if effect then for _,entry in pairs(objects) do release(entry) end; objects={}; effect=nil end
        lastCelebrationIssuedAt=value.issuedAtMs
        seen[value.id]=true; seenOrder[#seenOrder+1]=value.id; if #seenOrder>256 then seen[table.remove(seenOrder,1)]=nil end
        if not recognition or recognition.ends<=elapsed or recognition.untilMs<=serverNow then jumped={} end
        recognition={ends=elapsed+math.max(0,(value.heartsUntilMs-serverNow)/1000),untilMs=value.heartsUntilMs}
        local partyActive=celebration and celebration.ends>elapsed and celebration.untilMs>serverNow
        if value.partyUntilMs>serverNow then
            if not partyActive then clearLayer(particleLayer); particleLayer={}; stopDances(); actionAttempts={} end
            if not celebration or celebration.kind~=value.kind or celebration.liveTotalCents~=value.liveTotalCents then clearLayer(captionLayer); captionLayer={} end
            celebration={ends=elapsed+(value.partyUntilMs-serverNow)/1000,untilMs=value.partyUntilMs,kind=value.kind,liveTotalCents=value.liveTotalCents}
        elseif not partyActive then clearLayer(captionLayer); captionLayer={}; celebration=nil end
    end
    local function renderCelebration()
        if not recognition and not celebration then return end
        local serverNow=elapsed*1000+serverOffset
        if recognition and (elapsed>=recognition.ends or serverNow>=recognition.untilMs) then clearLayer(heartLayer); heartLayer={}; recognition=nil end
        if celebration and (elapsed>=celebration.ends or serverNow>=celebration.untilMs) then clearLayer(particleLayer); clearLayer(captionLayer); particleLayer={}; captionLayer={}; stopDances(); celebration=nil end
        if not recognition and not celebration then clearLayer(captionLayer); captionLayer={}; return end
        local bounds=gameBounds(); if not bounds then report("render-error"); return end
        -- Numeric glyphs and fixed captions remain inside the current canvas.
        local items=captionItems(); local width=0; for _,item in ipairs(items) do width=width+item.width+2 end
        local scale=math.min(1,(bounds.width-8)/width,(bounds.height-8)/32)
        local left=bounds.x+(bounds.width-width*scale)/2
        for i,item in ipairs(items) do place(captionLayer,i,item.asset,left+item.width*scale/2,bounds.y+bounds.height-20*scale,scale); left=left+(item.width+2)*scale end
        if celebration then
            for i=1,32 do
                local x=bounds.x+4+((i*31+elapsed*23)%(bounds.width-8))
                local y=bounds.y+4+((i*17-elapsed*45)%(bounds.height-8))
                place(particleLayer,i,"sa_confetti",x,y,1)
            end
        end
        local activeUsers, liveIds, unique = {}, {}, {}
        -- Installed MainGetUsers iterates activeCharacters, including the caster.
        for _,user in ipairs(getUsers()) do local id=tostring(user.id); if user.isActive and not unique[id] then unique[id]=true; activeUsers[#activeUsers+1]=user end end
        if #activeUsers>101 then report("density-limit") end
        for i,user in ipairs(activeUsers) do if i<=101 then
            local id=tostring(user.id); liveIds[id]=true
            if recognition then
                local pos=user.getPosition()
                place(heartLayer,id,"sa_heart",math.max(bounds.x+16,math.min(bounds.x+bounds.width-16,pos.x)),math.max(bounds.y+16,math.min(bounds.y+bounds.height-16,pos.y+AVATAR_TOP+16)),1)
                if not jumped[id] then
                    jumped[id]=true
                    if not celebration then local ok=pcall(function() user.runCommand("!{cmd:jump}",true) end); if not ok then report("action-error") end end
                end
            end
            if celebration and not dancing[id] and (not actionAttempts[id] or elapsed-actionAttempts[id]>=2) then
                actionAttempts[id]=elapsed
                local ok=pcall(function()
                    -- Respect actions already running, including an existing dance.
                    if user.getState()=="Idle" and user.getAnimation()~="dance" then
                        user.runCommand("!{cmd:dance}",true)
                        if user.getState()=="CustomAnimation" and user.getAnimation()=="dance" then dancing[id]=user end
                    end
                end)
                if not ok then report("action-error") end
            elseif celebration and dancing[id] then
                local ok=pcall(function() if user.getState()~="CustomAnimation" or user.getAnimation()~="dance" then dancing[id]=nil end end)
                if not ok then dancing[id]=nil; report("action-error") end
            end
        end end
        local ownedDances={}; for id,_ in pairs(dancing) do ownedDances[#ownedDances+1]=id end; set("sa_owned_dances",ownedDances)
        for id,entry in pairs(heartLayer) do if not liveIds[id] then if entry.object then release(entry) end; heartLayer[id]=nil end end
    end
    local function handleMessage(value)
        if type(value)~="table" or value.version~=2 then diagnostic("unsupported-message"); return end
        if value.type=="heartbeat" and number(value.serverNowMs) then
            serverOffset=value.serverNowMs-elapsed*1000
            send({version=2,type="heartbeat"}); return
        end
        if (value.mode~="production" and value.mode~="integration") or not integer(value.generation) or value.generation<generationFloor or value.generation<0 then return end
        if value.type=="clear" then
            generationFloor=value.generation; clearObjects(); reconcileCrowd({}); snapshot=nil
        elseif value.type=="snapshot" and validSnapshot(value) then
            if not snapshot or snapshot.generation~=value.generation or snapshot.mode~=value.mode or snapshot.session.sessionId~=value.session.sessionId then clearObjects() end
            generationFloor=value.generation; snapshot=value; serverOffset=value.serverNowMs-elapsed*1000; retryDelay=1
            if value.mode=="integration" and not previewHostSet then app.platformServiceSettings.SetStreamer(900000,"sa_integration_host"); previewHostSet=true end
            if value.mode=="production" then previewHostSet=false end
            reconcileCrowd(value.mode=="integration" and value.integration.crowdIds or {})
            local resolution=app.getResolution()
            send({version=2,type="ready",capabilities={"hearts","crowd","session","celebrations"},resolution={width=resolution.x,height=resolution.y}})
        elseif value.type=="crowd" and snapshot and snapshot.mode=="integration" and value.mode==snapshot.mode and value.generation==snapshot.generation and validCrowd(value.crowdIds) then
            reconcileCrowd(value.crowdIds)
        elseif value.type=="celebration" and snapshot and value.mode==snapshot.mode and value.generation==snapshot.generation and value.sessionId==snapshot.session.sessionId then
            acceptCelebration(value)
        elseif value.type=="hearts" and snapshot and value.mode==snapshot.mode and value.generation==snapshot.generation and value.sessionId==snapshot.session.sessionId and
            type(value.id)=="string" and #value.id>0 and #value.id<=128 and number(value.expiresAtMs) and number(value.issuedAtMs) and value.expiresAtMs>value.issuedAtMs and
            value.expiresAtMs-value.issuedAtMs<=10000 and value.expiresAtMs>elapsed*1000+serverOffset and value.durationMs==5000 and not seen[value.id] then
            clearObjects()
            seen[value.id]=true; seenOrder[#seenOrder+1]=value.id
            if #seenOrder>256 then seen[table.remove(seenOrder,1)]=nil end
            effect={ends=elapsed+5,offset=rotation}; rotation=rotation+MAX_HEARTS
        else diagnostic("unsupported-message") end
    end
    local function renderTick()
        renderCelebration()
        if not effect or not snapshot then return end
        if elapsed>=effect.ends then clearObjects(); return end
        local strip=gameBounds(); if not strip then clearObjects(); diagnostic("render-error"); return end
        local users=getUsers(); table.sort(users,function(a,b) return tostring(a.id)<tostring(b.id) end)
        local selected={}; local count=math.min(#users,MAX_HEARTS)
        for i=1,count do local user=users[((i-1+effect.offset)%#users)+1]; selected[tostring(user.id)]=user end
        for id,entry in pairs(objects) do if not selected[id] then
            release(entry); objects[id]=nil
        end end
        for id,user in pairs(selected) do
            local entry=objects[id]
            if not entry then
                local pending=get("sa_pending_images") or 0
                -- A CLR failure may never invoke its callback. Bound retained
                -- pending objects until F5 reload, which the host cleans up.
                if pending>=100 then clearObjects(); diagnostic("missing-heart-image"); return end
                set("sa_pending_images",pending+1)
                loadSequence=loadSequence+1; set("sa_load_sequence",loadSequence)
                local key="sa_image_"..loadSequence
                entry={object=app.createGameObject(),key=key,deadline=elapsed+2}; objects[id]=entry
                -- The host starts animation before resuming the worker. Keep
                -- pending/cancelled images hidden until positioned and active.
                entry.object.setScale(0,0)
                entry.loader=async("sa_load_heart",entry.object,key)
            end
            if not entry.loaded then
                if get(entry.key)=="loaded" then entry.loaded=true; set(entry.key,nil)
                elseif get(entry.key)=="failed" or elapsed>=entry.deadline then clearObjects(); diagnostic("missing-heart-image"); return end
            end
            local pos=user.getPosition()
            local x=math.max(strip.x+HEART_WIDTH/2,math.min(strip.x+strip.width-HEART_WIDTH/2,pos.x))
            local y=math.max(strip.y+HEART_HEIGHT/2,math.min(strip.y+strip.height-HEART_HEIGHT/2,pos.y+AVATAR_TOP+HEART_HEIGHT/2))
            entry.object.setPosition(x,y)
            if entry.loaded then entry.object.setScale(1,1) end
        end
    end
    -- Reload cleanup uses only IDs this companion previously created, never real viewers.
    for _,id in ipairs(get("sa_owned_ids") or {}) do if id>=900001 and id<=900100 then app.platformServiceSettings.SetUserLeave(id) end end
    local previousDances={}; for _,id in ipairs(get("sa_owned_dances") or {}) do previousDances[tostring(id)]=true end
    for _,user in ipairs(getUsers()) do if previousDances[tostring(user.id)] then pcall(function() if user.getState()=="CustomAnimation" and user.getAnimation()=="dance" then user.exitState() end end) end end
    set("sa_owned_dances",{})
    set("sa_pending_images",0)
    set("sa_settings",settings); set("sa_mailbox",{}); set("sa_connected",false); set("sa_disconnect_pending",false)
    app.removeWebSocket(socket); addEvent("websocket","sa_on_socket")
    local bottom=app.convertPercentToPosition(0,0); local top=app.convertPercentToPosition(1,1)
    log("SA game bounds: "..bottom.x..","..bottom.y.." to "..top.x..","..top.y)
    while true do
        local connected=get("sa_connected")
        if get("sa_disconnect_pending") or (not connected and wasConnected) then
            cleanup(); set("sa_disconnect_pending",false)
            if not connected then retryAt=elapsed+retryDelay; retryDelay=math.min(30,retryDelay*2) end
        end
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
