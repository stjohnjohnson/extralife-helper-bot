-- Import as an On Connect script. Private settings belong in this script's JSON file.
script_trigger_type = "On Connect"

-- The package generator updates these dimensions from the sa_heart manifest.
local HEART_WIDTH, HEART_HEIGHT = 32, 32
local RAISED_WIDTH = 143
local MAX_HEARTS, AVATAR_TOP = 50, 40
local STATUS_SIZE, STATUS_TIMEOUT = 64, 30
-- Only the portable package builder may embed trusted image IDs and geometry.
-- Empty until explicit candidate packaging or separately gated production promotion.
local THEME_CATALOG_JSON = nil
local REFERENCE_WIDTH, BAND_HEIGHT, BASELINE_OFFSET = 1920, 120, 4

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

function sa_load_theme(object, key, image)
    local ok=pcall(function() applyImage(object,image) end)
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
        app.sendWebsocketMessage(title, json.serialize({ version=3, type="auth", token=settings.token }))
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
    local actionCooldowns={dance=settings.danceCooldownSeconds,hug=settings.hugCooldownSeconds}
    if actionCooldowns.dance==nil then actionCooldowns.dance=10 end
    if actionCooldowns.hug==nil then actionCooldowns.hug=10 end
    for _,seconds in pairs(actionCooldowns) do
        if not number(seconds) or seconds<0 or seconds>86400 then log("SA bridge: action cooldown seconds must be numbers from 0 to 86400"); return end
    end
    -- Native timers use real time, while yield() returns scaled game time.
    -- os.time() is also used by the host's Lua cooldown helper. Persist only
    -- our requests; clears/reconnects/reloads must not reset their timers.
    local actionRequests=get("sa_action_requests") or {}
    local pruneActionsAt=os.time()
    local function claimAction(action,user)
        local id=tostring(user.id)
        local request=actionRequests[id] or {}
        local now=os.time()
        if request[action] and now<request[action] then return false end
        -- Whole-second clock: one extra second covers timestamp truncation.
        request[action]=now+actionCooldowns[action]+1
        actionRequests[id]=request; set("sa_action_requests",actionRequests)
        return true
    end
    local app = getApp()
    local socket = "sa_helper_bridge"
    local objects, owned, seen, seenOrder = {}, {}, {}, {}
    local snapshot, effect = nil, nil
    local themeObjects, chapterObjects = {}, {} -- Chapter owner reserved; no chapter art.
    local themeLoadToken, themeKey, themeLayout, entrance = 0, nil, nil, nil
    local themeDiagnosticAt, themeRenderDiagnosticAt = 0, 0
    local catalog = THEME_CATALOG_JSON and json.parse(THEME_CATALOG_JSON) or {themes={}}
    local generationFloor = -1
    local loadSequence = get("sa_load_sequence") or 0
    local elapsed, serverOffset, updateElapsed = 0, 0, 0
    local retryAt, retryDelay, rotation, wasConnected = 0, 1, 0, false
    local statusImages, lastBridgeAt, statusWarning, statusDisabled = {}, nil, false, false
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
    local function diagnostic(code) send({version=3,type="diagnostic",code=code}) end
    local function themeDiagnostic()
        -- Coalesce repeated tiles and rapid theme reloads across world owners.
        if elapsed>=themeDiagnosticAt then diagnostic("missing-theme-image"); themeDiagnosticAt=elapsed+30 end
    end
    local function themeRenderDiagnostic()
        if elapsed>=themeRenderDiagnosticAt then diagnostic("theme-render-error"); themeRenderDiagnosticAt=elapsed+30 end
    end
    local function release(entry)
        local status=get(entry.key)
        if not entry.loaded and status~="failed" and status~="loaded" then
            -- stopAsync cannot cancel the host image callback. Leave its object
            -- alive until it returns, then let the worker discard the image.
            set(entry.key,"cancelled")
        else set(entry.key,nil); pcall(entry.object.destroy) end
    end
    local function hideStatus()
        for _,entry in pairs(statusImages) do if not entry.failed then pcall(entry.object.setScale,0,0) end end
    end
    local function warnStatus()
        if not statusWarning then
            statusWarning=true
            log("SA bridge: connection indicator unavailable; reimport the latest ZIP and reload")
        end
    end
    local function statusImage(asset, now)
        local entry=statusImages[asset]
        if not entry then
            local pending=get("sa_pending_images") or 0
            if pending>=128 then return nil end
            loadSequence=loadSequence+1; set("sa_load_sequence",loadSequence)
            local key="sa_image_"..loadSequence
            entry={object=app.createGameObject(),key=key,deadline=now+2}; statusImages[asset]=entry
            entry.object.setScale(0,0)
            set("sa_pending_images",pending+1); entry.pending=true
            entry.loader=async("sa_load_heart",entry.object,key,asset)
        end
        if entry.failed then return nil end
        if not entry.loaded then
            if get(entry.key)=="loaded" then
                entry.loaded=true; set(entry.key,nil)
                entry.object.image.sorting(0,"afterForeground")
            elseif get(entry.key)=="failed" or now>=entry.deadline then
                release(entry); entry.failed=true; warnStatus(); return nil
            end
        end
        return entry.loaded and entry or nil
    end
    local function renderStatus()
        hideStatus()
        if statusDisabled then return end
        local host=app.getStreamerUser()
        if not host or not host.isActive then return end
        local now=os.time()
        if not number(now) then return end
        local bounds=gameBounds()
        if not bounds or bounds.width<STATUS_SIZE or bounds.height<STATUS_SIZE then return end
        local pos=host.getPosition()
        if not number(pos.x) or not number(pos.y) then return end
        local unknown=statusImage("sa_bridge_unknown",now)
        local logo=statusImage("sa_bridge_healthy",now)
        local healthy=snapshot and get("sa_connected") and lastBridgeAt and now>=lastBridgeAt and now-lastBridgeAt<STATUS_TIMEOUT
        local entry=healthy and logo or unknown
        if not entry then return end
        local half=STATUS_SIZE/2
        local x=math.max(bounds.x+half,math.min(bounds.x+bounds.width-half,pos.x))
        local y=math.max(bounds.y+half,math.min(bounds.y+bounds.height-half,pos.y+AVATAR_TOP+HEART_HEIGHT+half+8))
        entry.object.setPosition(x,y); entry.object.setScale(1,1)
    end
    local clearCelebration
    local function clearObjects()
        if clearCelebration then clearCelebration() end
        for _,entry in pairs(objects) do release(entry) end
        objects = {}; effect = nil
    end
    local function clearEntrance()
        entrance=nil
    end
    local function clearTheme()
        themeLoadToken=themeLoadToken+1
        for _,entry in pairs(themeObjects) do if not entry.skipped then release(entry) end end
        themeObjects={}; themeLayout=nil; themeKey=nil
    end
    local function clearAll()
        clearObjects(); clearTheme(); clearEntrance()
        for _,entry in pairs(chapterObjects) do release(entry) end; chapterObjects={}
    end
    local function reconcileTheme()
        local theme=snapshot and snapshot.theme
        local allowed=not catalog.previewOnly or (snapshot and snapshot.mode=="integration" and snapshot.integration.active)
        local layout=allowed and theme and theme.packRevision==catalog.packRevision and catalog.themes[theme.themeId] or nil
        local key=layout and (theme.themeId..":"..theme.packRevision) or nil
        if key==themeKey then return end
        clearTheme(); themeKey=key; themeLayout=layout
    end
    local function validIdentity(value) return type(value)=="string" and #value==64 and not value:find("[^a-f0-9]") end
    local function validTheme(theme)
        if theme==nil or (type(json.isnull)=="function" and json.isnull(theme)) or (type(json.null)~="function" and theme==json.null) then return true end
        if type(theme)~="table" or not validIdentity(theme.gameIdentity) or not validIdentity(theme.packRevision) or type(theme.gameName)~="string" or #theme.gameName==0 or #theme.gameName>800 then return false end
        local allowed={ ["block-world"]=true,kitchen=true,outdoor=true,puzzle=true,["space-salvage"]=true,party=true }
        return theme.themeId==nil or (type(json.isnull)=="function" and json.isnull(theme.themeId)) or (type(json.null)~="function" and theme.themeId==json.null) or allowed[theme.themeId]==true
    end
    local function startEntrance()
        clearEntrance()
        entrance={ends=elapsed+6}
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
        clearAll(); reconcileCrowd({}); snapshot=nil; generationFloor=-1; lastBridgeAt=nil
    end
    local function validCrowd(ids)
        if type(ids)~="table" or #ids>100 then return false end
        for _,name in ipairs(ids) do
            if type(name)~="string" or not string.match(name,"^sa_integration_%d+$") then return false end
            local n=tonumber(string.match(name,"(%d+)$")); if n<1 or n>100 then return false end
        end
        return true
    end
    local function jsonNull(value)
        if value==nil then return true end
        -- Native MoonSharp represents null as userdata and exposes null() / isnull().
        if type(json.isnull)=="function" then return json.isnull(value) end
        return type(json.null)~="function" and value==json.null
    end
    local function exact(value,allowed)
        if type(value)~="table" then return false end
        for key,_ in pairs(value) do if not allowed[key] then return false end end
        for key,_ in pairs(allowed) do if value[key]==nil then return false end end
        return true
    end
    local function validSnapshot(value)
        local c=value.campaign
        local keys={version=true,type=true,mode=true,generation=true,serverNowMs=true,campaign=true,integration=true,features=true}
        if value.theme~=nil then keys.theme=true end
        if not validTheme(value.theme) or not exact(value,keys) or
            not exact(c,{campaignId=true,initialized=true,totalCents=true,goalCents=true,nextMilestoneCents=true,goalHandled=true}) or
            type(c.campaignId)~="string" or #c.campaignId==0 or #c.campaignId>128 or type(c.initialized)~="boolean" or type(c.goalHandled)~="boolean" then return false end
        if c.initialized then
            if not integer(c.totalCents) or c.totalCents<0 or c.totalCents>9007199254740991 or not integer(c.goalCents) or c.goalCents<=0 or c.goalCents>9007199254740991 or
                not (jsonNull(c.nextMilestoneCents) or (integer(c.nextMilestoneCents) and c.nextMilestoneCents>c.totalCents and c.nextMilestoneCents<=9007199254740991)) then return false end
        elseif not jsonNull(c.totalCents) or not jsonNull(c.goalCents) or not jsonNull(c.nextMilestoneCents) then return false end
        return number(value.serverNowMs) and type(value.features)=="table" and #value.features<=6 and type(value.integration)=="table" and
            type(value.integration.active)=="boolean" and validCrowd(value.integration.crowdIds)
    end
    -- Separate registries contain only objects created by this companion.
    local recognition, celebration = nil, nil
    local recognitionWindowStartedAt, recognitionSequenceId = nil, nil
    local partyWindowStartedAt, partySequenceId = nil, nil
    local partySequences, partySequenceOrder = {}, {}
    local heartLayer, particleLayer, captionLayer, dancing, handled, actionAttempts = {}, {}, {}, {}, {}, {}
    local pendingDances = {}
    local reported = {}; local lastCelebrationIssuedAt=-1
    local function report(code) if not reported[code] then reported[code]=true; diagnostic(code) end end
    local function clearLayer(layer) for _,entry in pairs(layer) do if entry.object then release(entry) end end end
    local function ordinaryState(state) return state=="Idle" or state=="Wander" end
    local function matchingDance(entry)
        return entry.user.avatar==entry.avatar and entry.user.getState()=="CustomAnimation" and entry.user.getAnimation()==entry.animation
    end
    local function saveDances()
        local ids,signatures={},{}; for id,entry in pairs(dancing) do ids[#ids+1]=id;signatures[id]={avatar=entry.avatar,animation=entry.animation} end
        local pendingIds,pendingSignatures={},{}; for id,request in pairs(pendingDances) do pendingIds[#pendingIds+1]=id;pendingSignatures[id]={avatar=request.avatar} end
        set("sa_owned_dances",ids); set("sa_owned_dance_signatures",signatures); set("sa_pending_dance_ids",pendingIds); set("sa_pending_dance_signatures",pendingSignatures)
    end
    local function reconcileDances()
        for id,request in pairs(pendingDances) do
            local ok=pcall(function()
                local state,animation=request.user.getState(),request.user.getAnimation()
                if request.user.avatar~=request.avatar then pendingDances[id]=nil; return end
                -- getAnimation reports a sprite name, not the command/action.
                -- A custom2 or idle sprite may be a mapped/tween dance OR an
                -- unrelated action. Never claim or force-exit those variants.
                if elapsed>=request.untilTime then pendingDances[id]=nil
                elseif state=="CustomAnimation" and animation=="dance" then
                    local entry={user=request.user,avatar=request.avatar,animation=animation}
                    if request.cancelled then request.user.exitState() else dancing[id]=entry end
                    pendingDances[id]=nil
                elseif not ordinaryState(state) then pendingDances[id]=nil end
            end)
            if not ok then pendingDances[id]=nil; report("action-error") end
        end
        saveDances()
    end
    local function stopDances()
        for _,request in pairs(pendingDances) do request.cancelled=true end
        reconcileDances()
        for _,entry in pairs(dancing) do pcall(function()
            local user=entry.user
            if matchingDance(entry) then user.exitState() end
        end) end
        dancing={}; saveDances()
    end
    clearCelebration=function()
        clearLayer(heartLayer); clearLayer(particleLayer); clearLayer(captionLayer); stopDances()
        heartLayer={}; particleLayer={}; captionLayer={}; handled={}; actionAttempts={}; recognition=nil; celebration=nil; recognitionWindowStartedAt=nil; recognitionSequenceId=nil; partyWindowStartedAt=nil; partySequenceId=nil; partySequences={}; partySequenceOrder={}; reported={}; lastCelebrationIssuedAt=-1
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
        local dollars=string.format("%.0f",math.floor(cents/100)); local grouped=dollars:reverse():gsub("(%d%d%d)","%1,"):reverse():gsub("^,","")
        return "$"..grouped..(cents%100==0 and "" or "."..string.format("%02d",cents%100))
    end
    local function numericItems(text)
        local result={}
        for char in text:gmatch(".") do result[#result+1]={asset=char=="$" and "sa_dollar" or (char=="," and "sa_comma" or (char=="." and "sa_dot" or "sa_digit_"..char)),width=17,height=23} end
        return result
    end
    local function captionItems()
        if celebration and celebration.kind=="goal" then return {{asset="sa_goal_accent",width=32,height=32},{asset="sa_goal",width=431,height=23}} end
        if celebration then
            local result=numericItems(moneyGlyphs(celebration.campaignTotalCents))
            result[#result+1]={asset="sa_raised",width=RAISED_WIDTH,height=23}; return result
        end
        if not recognition then return {} end
        if not recognition.amountKnown then return {{asset="sa_thanks",width=179,height=23}} end
        local result=numericItems(moneyGlyphs(recognition.amount))
        if recognition.count>1 then
            result[#result+1]={asset="sa_from",width=107,height=23}
            for _,item in ipairs(numericItems(string.format("%.0f",recognition.count))) do result[#result+1]=item end
            result[#result+1]={asset="sa_donations",width=233,height=23}
        else result[#result+1]={asset="sa_separator",width=53,height=23} end
        result[#result+1]={asset="sa_thanks",width=179,height=23}; return result
    end
    local function validCelebration(value)
        local allowed={version=true,type=true,mode=true,generation=true,campaignId=true,id=true,sequenceId=true,issuedAtMs=true,expiresAtMs=true,phase=true,kind=true,campaignTotalCents=true,milestoneCents=true,donationCount=true,donationTotalCents=true,recognitionStartedAtMs=true,recognitionAction=true,heartsUntilMs=true,partyStartedAtMs=true,partyUntilMs=true}
        if not exact(value,allowed) or type(value.sequenceId)~="string" or #value.sequenceId==0 or #value.sequenceId>128 or type(value.id)~="string" or #value.id==0 or #value.id>128 or
            not integer(value.issuedAtMs) or value.issuedAtMs<0 or not integer(value.expiresAtMs) or value.expiresAtMs<=value.issuedAtMs or value.expiresAtMs>value.issuedAtMs+10000 or
            not integer(value.heartsUntilMs) or value.heartsUntilMs<0 or not integer(value.partyUntilMs) or value.partyUntilMs<0 or
            not (jsonNull(value.campaignTotalCents) or (integer(value.campaignTotalCents) and value.campaignTotalCents>=0 and value.campaignTotalCents<=9007199254740991)) or
            not (jsonNull(value.milestoneCents) or (integer(value.milestoneCents) and value.milestoneCents>0 and not jsonNull(value.campaignTotalCents) and value.milestoneCents<=value.campaignTotalCents)) then return false end
        if value.phase=="recognition" then
            return value.kind=="donation" and jsonNull(value.milestoneCents) and jsonNull(value.partyStartedAtMs) and value.partyUntilMs==0 and
                integer(value.donationCount) and value.donationCount>0 and value.donationCount<=9007199254740991 and
                (jsonNull(value.donationTotalCents) or (integer(value.donationTotalCents) and value.donationTotalCents>=0 and value.donationTotalCents<=9007199254740991)) and
                integer(value.recognitionStartedAtMs) and value.recognitionStartedAtMs>=0 and value.recognitionStartedAtMs<=value.issuedAtMs and
                value.heartsUntilMs>value.issuedAtMs and value.heartsUntilMs<=value.recognitionStartedAtMs+10000 and
                (value.recognitionAction=="jump" or value.recognitionAction=="hug")
        elseif value.phase=="party" then
            return (value.kind=="goal" or (value.kind=="milestone" and not jsonNull(value.milestoneCents))) and not jsonNull(value.campaignTotalCents) and
                value.donationCount==0 and value.donationTotalCents==0 and jsonNull(value.recognitionStartedAtMs) and jsonNull(value.recognitionAction) and value.heartsUntilMs==0 and
                integer(value.partyStartedAtMs) and value.partyStartedAtMs>=0 and value.partyStartedAtMs<=value.issuedAtMs and
                value.partyUntilMs>value.issuedAtMs and value.partyUntilMs<=value.partyStartedAtMs+38000
        end
        return false
    end
    local function acceptCelebration(value)
        local serverNow=elapsed*1000+serverOffset
        if not validCelebration(value) or value.expiresAtMs<=serverNow or value.issuedAtMs<lastCelebrationIssuedAt or seen[value.id] then return end
        -- A late/reordered recognition update may not undo its party phase.
        if value.phase=="recognition" and partySequences[value.sequenceId] then return end
        if effect then for _,entry in pairs(objects) do release(entry) end; objects={}; effect=nil end
        lastCelebrationIssuedAt=value.issuedAtMs
        seen[value.id]=true; seenOrder[#seenOrder+1]=value.id; if #seenOrder>256 then seen[table.remove(seenOrder,1)]=nil end
        if value.phase=="recognition" then
            if celebration then clearLayer(particleLayer); particleLayer={}; stopDances(); celebration=nil end
            local sameWindow=recognitionSequenceId==value.sequenceId and recognitionWindowStartedAt==value.recognitionStartedAtMs
            if not sameWindow then clearLayer(heartLayer); heartLayer={}; handled={} end
            if not recognition or not sameWindow or recognition.amount~=value.donationTotalCents or recognition.count~=value.donationCount then clearLayer(captionLayer); captionLayer={} end
            recognitionWindowStartedAt=value.recognitionStartedAtMs; recognitionSequenceId=value.sequenceId
            recognition=value.heartsUntilMs>serverNow and {ends=elapsed+(value.heartsUntilMs-serverNow)/1000,untilMs=value.heartsUntilMs,
                startedAtMs=value.recognitionStartedAtMs,count=value.donationCount,amount=value.donationTotalCents,amountKnown=not jsonNull(value.donationTotalCents),action=value.recognitionAction} or nil
        else
            clearLayer(heartLayer); heartLayer={}; recognition=nil
            if not partySequences[value.sequenceId] then
                partySequences[value.sequenceId]=true; partySequenceOrder[#partySequenceOrder+1]=value.sequenceId
                if #partySequenceOrder>256 then partySequences[table.remove(partySequenceOrder,1)]=nil end
            end
            local sameParty=partySequenceId==value.sequenceId and partyWindowStartedAt==value.partyStartedAtMs
            partySequenceId=value.sequenceId; partyWindowStartedAt=value.partyStartedAtMs
            if not sameParty then clearLayer(particleLayer); particleLayer={}; stopDances(); actionAttempts={} end
            if not celebration or celebration.kind~=value.kind or celebration.campaignTotalCents~=value.campaignTotalCents then clearLayer(captionLayer); captionLayer={} end
            celebration=value.partyUntilMs>serverNow and {ends=elapsed+(value.partyUntilMs-serverNow)/1000,untilMs=value.partyUntilMs,kind=value.kind,
                campaignTotalCents=value.campaignTotalCents,sequenceId=value.sequenceId,startedAtMs=value.partyStartedAtMs} or nil
        end
    end
    local function eligible(user)
        local ok,result=pcall(function() return user.isActive and ordinaryState(user.getState()) end)
        if not ok then report("action-error") end
        return ok and result
    end
    local function jump(user)
        if not eligible(user) then return end
        handled[tostring(user.id)]=true
        local ok=pcall(function() user.runCommand("!{cmd:jump}",true) end)
        if not ok then report("action-error") end
    end
    local function recognize(users)
        if not recognition or celebration then return end
        local candidates={}
        for i=1,math.min(101,#users) do local user=users[i]
            if not handled[tostring(user.id)] and eligible(user) then candidates[#candidates+1]=user end
        end
        if recognition.action=="jump" then for _,user in ipairs(candidates) do jump(user) end; return end
        for i=#candidates,2,-1 do local j=math.random(i); candidates[i],candidates[j]=candidates[j],candidates[i] end
        for i=1,#candidates,2 do
            local initiator,partner=candidates[i],candidates[i+1]
            if not partner then jump(initiator)
            else
                local a,b=eligible(initiator),eligible(partner)
                local target=tostring(partner.id)
                if a and b and target:match("^[A-Za-z0-9_:%-]+$") and claimAction("hug",initiator) then
                    -- The native hug travels to and temporarily controls its partner.
                    -- One initiating request; let the host finish both sides itself.
                    handled[tostring(initiator.id)]=true; handled[target]=true
                    local ok=pcall(function() initiator.runCommand("!{cmd:hug} "..target,true) end)
                    if not ok then report("action-error"); jump(initiator); jump(partner) end
                else
                    if a then jump(initiator) end
                    if b then jump(partner) end
                end
            end
        end
    end
    local function renderCelebration()
        reconcileDances()
        if not recognition and not celebration then return end
        local serverNow=elapsed*1000+serverOffset
        if recognition and (elapsed>=recognition.ends or serverNow>=recognition.untilMs) then clearLayer(heartLayer); heartLayer={}; recognition=nil end
        if celebration and (elapsed>=celebration.ends or serverNow>=celebration.untilMs) then clearLayer(particleLayer); clearLayer(captionLayer); particleLayer={}; captionLayer={}; stopDances(); celebration=nil end
        if not recognition and not celebration then clearLayer(captionLayer); captionLayer={}; return end
        local bounds=gameBounds(); if not bounds then report("render-error"); return end
        -- Numeric glyphs and fixed captions remain inside the current canvas.
        local items=captionItems(); local width=0; for _,item in ipairs(items) do width=width+item.width+2 end
        local scale=math.min(1,(bounds.width-8)/math.max(1,width),(bounds.height-8)/32)
        local left=bounds.x+(bounds.width-width*scale)/2
        for i,item in ipairs(items) do place(captionLayer,i,item.asset,left+item.width*scale/2,bounds.y+bounds.height-20*scale,scale); left=left+(item.width+2)*scale end
        if celebration then
            for i=1,32 do
                -- Independent deterministic phases avoid rows of synchronized falling sticks.
                local phase=(i*0.61803398875)%1
                local fallPhase=(i*0.41421356237+0.37)%1
                local speed=44+(i%9)*5
                local sway=math.sin(elapsed*(0.7+(i%5)*0.13)+i)*18
                local x=bounds.x+10+((phase*(bounds.width-20)+sway)%(bounds.width-20))
                local y=bounds.y+10+((fallPhase*(bounds.height-20)-elapsed*speed)%(bounds.height-20))
                place(particleLayer,i,"sa_confetti",x,y,1.2+(i%7)*0.15)
            end
        end
        local activeUsers, liveIds, unique = {}, {}, {}
        -- Installed MainGetUsers iterates activeCharacters, including the caster.
        for _,user in ipairs(getUsers()) do local id=tostring(user.id); if user.isActive and not unique[id] then unique[id]=true; activeUsers[#activeUsers+1]=user end end
        table.sort(activeUsers,function(a,b) return tostring(a.id)<tostring(b.id) end)
        if #activeUsers>101 then report("density-limit") end
        for i,user in ipairs(activeUsers) do if i<=101 then
            local id=tostring(user.id); liveIds[id]=true
            if recognition then
                local pos=user.getPosition()
                place(heartLayer,id,"sa_heart",math.max(bounds.x+16,math.min(bounds.x+bounds.width-16,pos.x)),math.max(bounds.y+16,math.min(bounds.y+bounds.height-16,pos.y+AVATAR_TOP+16)),1)
            end
            if celebration and not dancing[id] and not pendingDances[id] and not actionAttempts[id] then
                local ok=pcall(function()
                    -- Respect actions already running, including an existing dance.
                    if ordinaryState(user.getState()) and claimAction("dance",user) then
                        -- One request per party, including goal upgrades. A
                        -- finished/rejected animation is not permission to retry.
                        actionAttempts[id]=true
                        -- Native state changes complete on a later frame. Track
                        -- only this bounded request, never an existing dance.
                        pendingDances[id]={user=user,avatar=user.avatar,untilTime=elapsed+2}
                        user.runCommand("!{cmd:dance}",true)
                        reconcileDances()
                    end
                end)
                if not ok then pendingDances[id]=nil; report("action-error") end
            elseif celebration and dancing[id] then
                local ok=pcall(function() if not matchingDance(dancing[id]) then dancing[id]=nil end end)
                if not ok then dancing[id]=nil; report("action-error") end
            end
        end end
        recognize(activeUsers)
        saveDances()
        for id,entry in pairs(heartLayer) do if not liveIds[id] then if entry.object then release(entry) end; heartLayer[id]=nil end end
    end
    local function renderEntranceActions()
        if not entrance then return end
        local deadline=entrance.ends
        clearEntrance()
        if elapsed>=deadline then return end
        -- Donation recognition/parties own native actions for this frame, including
        -- hug requests whose host state transition has not completed yet.
        if recognition or celebration then return end
        for _,user in ipairs(getUsers()) do if eligible(user) then
            local ok=pcall(function() user.runCommand("!{cmd:jump}",true) end)
            if not ok then report("action-error") end
        end end
    end
    local function handleMessage(value)
        if type(value)~="table" or value.version~=3 then diagnostic("unsupported-message"); return end
        if value.type=="game-entrance" and jsonNull(value.themeId) then value.themeId=nil end
        if value.type=="heartbeat" and number(value.serverNowMs) then
            serverOffset=value.serverNowMs-elapsed*1000
            if snapshot then lastBridgeAt=os.time() end
            send({version=3,type="heartbeat"}); return
        end
        if (value.mode~="production" and value.mode~="integration") or not integer(value.generation) or value.generation<generationFloor or value.generation<0 then return end
        if value.type=="clear" then
            generationFloor=value.generation; clearAll(); reconcileCrowd({}); snapshot=nil
        elseif value.type=="snapshot" and validSnapshot(value) then
            if jsonNull(value.theme) then value.theme=nil elseif jsonNull(value.theme.themeId) then value.theme.themeId=nil end
            if not snapshot or snapshot.generation~=value.generation or snapshot.mode~=value.mode or snapshot.campaign.campaignId~=value.campaign.campaignId then clearAll()
            elseif (snapshot.theme and snapshot.theme.gameIdentity)~=(value.theme and value.theme.gameIdentity) or
                (snapshot.theme and snapshot.theme.themeId)~=(value.theme and value.theme.themeId) or
                (snapshot.theme and snapshot.theme.packRevision)~=(value.theme and value.theme.packRevision) then clearEntrance() end
            generationFloor=value.generation; snapshot=value; serverOffset=value.serverNowMs-elapsed*1000; retryDelay=1; lastBridgeAt=os.time()
            if value.mode=="integration" and not previewHostSet then app.platformServiceSettings.SetStreamer(900000,"sa_integration_host"); previewHostSet=true end
            if value.mode=="production" then previewHostSet=false end
            reconcileCrowd(value.mode=="integration" and value.integration.crowdIds or {}); reconcileTheme()
            local resolution=app.getResolution()
            send({version=3,type="ready",capabilities={"hearts","crowd","campaign","celebrations","donation-recognition","themes"},resolution={width=resolution.x,height=resolution.y}})
        elseif value.type=="crowd" and snapshot and snapshot.mode=="integration" and value.mode==snapshot.mode and value.generation==snapshot.generation and validCrowd(value.crowdIds) then
            reconcileCrowd(value.crowdIds)
        elseif value.type=="celebration" and snapshot and value.mode==snapshot.mode and value.generation==snapshot.generation and value.campaignId==snapshot.campaign.campaignId then
            acceptCelebration(value)
        elseif value.type=="game-entrance" and snapshot and snapshot.theme and value.mode==snapshot.mode and value.generation==snapshot.generation and value.campaignId==snapshot.campaign.campaignId and
            value.gameIdentity==snapshot.theme.gameIdentity and value.themeId==snapshot.theme.themeId and type(value.id)=="string" and #value.id>0 and #value.id<=128 and not seen[value.id] and
            number(value.issuedAtMs) and value.issuedAtMs>=0 and number(value.expiresAtMs) and value.expiresAtMs-value.issuedAtMs==10000 and value.expiresAtMs>elapsed*1000+serverOffset and value.durationMs==6000 then
            seen[value.id]=true; seenOrder[#seenOrder+1]=value.id
            if #seenOrder>256 then seen[table.remove(seenOrder,1)]=nil end
            startEntrance()
        elseif value.type=="hearts" and snapshot and value.mode==snapshot.mode and value.generation==snapshot.generation and value.campaignId==snapshot.campaign.campaignId and
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
    local function renderWorld()
        local bottom=app.convertPercentToPosition(0,0); local top=app.convertPercentToPosition(1,1)
        local width,height=top.x-bottom.x,top.y-bottom.y
        local scale=width/REFERENCE_WIDTH
        local fits=number(scale) and number(height) and scale>0 and height>=(BAND_HEIGHT+BASELINE_OFFSET)*scale
        if not themeLayout then return end
        local components={}
        -- Native background/0 must not occlude the continuous overlay. Both
        -- component orders remain below the installed Characters sorting layer.
        for _,asset in ipairs(themeLayout.tiles) do components[#components+1]={asset=asset,layer="background",order=1} end
        for _,asset in ipairs(themeLayout.props) do components[#components+1]={asset=asset,layer="background",order=2} end
        for index,component in ipairs(components) do
            local entry=themeObjects[index]
            if not entry and fits then
                local pending=get("sa_pending_images") or 0
                if pending<100 then
                    loadSequence=loadSequence+1; set("sa_load_sequence",loadSequence)
                    local key="sa_image_"..loadSequence
                    entry={key=key,deadline=elapsed+2,token=themeLoadToken}; themeObjects[index]=entry
                    local created=pcall(function()
                        entry.object=app.createGameObject(); entry.object.setScale(0,0)
                    end)
                    if not created then
                        if entry.object then pcall(entry.object.destroy) end
                        entry.skipped=true; themeRenderDiagnostic()
                    else
                        -- Count only workers that can start after hidden-object setup.
                        set("sa_pending_images",pending+1)
                        entry.loader=async("sa_load_theme",entry.object,key,component.asset.image)
                    end
                end
            end
            if entry and not entry.skipped and entry.token==themeLoadToken then
                if not entry.loaded then
                    if get(entry.key)=="loaded" then entry.loaded=true; set(entry.key,nil)
                    elseif get(entry.key)=="failed" or elapsed>=entry.deadline then release(entry); entry.skipped=true; themeDiagnostic() end
                end
                if not entry.skipped then
                    local rendered=pcall(function()
                        if fits and entry.loaded then
                            local asset=component.asset
                            -- Package sprites have center pivot. Image-space anchor Y points down.
                            entry.object.setPosition(bottom.x+(asset.x+asset.width/2)*scale,bottom.y+(BASELINE_OFFSET+asset.anchorY-asset.height/2)*scale)
                            entry.object.image.sorting(component.order,component.layer)
                            entry.object.setScale(scale,scale)
                        else entry.object.setScale(0,0) end
                    end)
                    if not rendered then
                        -- Discard only this component; hearts and the rest of
                        -- the world keep their independent lifetimes and ownership.
                        pcall(release,entry); entry.skipped=true; themeRenderDiagnostic()
                    end
                end
            end
        end
    end
    -- Reload cleanup uses only IDs this companion previously created, never real viewers.
    for _,id in ipairs(get("sa_owned_ids") or {}) do if id>=900001 and id<=900100 then app.platformServiceSettings.SetUserLeave(id) end end
    local previousDances={}; for _,id in ipairs(get("sa_owned_dances") or {}) do previousDances[tostring(id)]=true end
    local previousSignatures=get("sa_owned_dance_signatures") or {}
    local previousPending=get("sa_pending_dance_signatures") or {}
    for _,user in ipairs(getUsers()) do
        local id=tostring(user.id)
        if previousDances[id] then pcall(function() local signature=previousSignatures[id] or {avatar=user.avatar,animation="dance"}; if matchingDance({user=user,avatar=signature.avatar,animation=signature.animation}) then user.exitState() end end) end
        if previousPending[id] and user.avatar==previousPending[id].avatar then pendingDances[id]={user=user,avatar=previousPending[id].avatar,untilTime=elapsed+2,cancelled=true} end
    end
    set("sa_owned_dances",{}); reconcileDances()
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
            if ok then local handled=pcall(handleMessage,value); if not handled then clearAll(); diagnostic("render-error") end
            else diagnostic("unsupported-message") end
        end
        -- Bridge health follows wall time even when Unity's game time is paused.
        local statusOk=pcall(renderStatus)
        if not statusOk then
            hideStatus(); warnStatus(); statusDisabled=true
            for _,entry in pairs(statusImages) do if not entry.failed then
                if entry.loader then release(entry)
                else
                    pcall(entry.object.destroy); set(entry.key,nil)
                    if entry.pending then set("sa_pending_images",math.max(0,(get("sa_pending_images") or 1)-1)) end
                end
                entry.failed=true
            end end
        end
        if updateElapsed>=0.05 then
            renderEntranceActions()
            local worldOk=pcall(renderWorld); if not worldOk then clearTheme(); themeRenderDiagnostic() end
            local ok=pcall(renderTick); if not ok then clearObjects(); diagnostic("render-error") end
            updateElapsed=0
        end
        local delta=yield()
        if number(delta) and delta>0 then
            elapsed=elapsed+delta; updateElapsed=updateElapsed+delta
            local now=os.time()
            if number(now) and now>=pruneActionsAt then
                local changed=false
                for id,request in pairs(actionRequests) do
                    for action,untilTime in pairs(request) do if now>=untilTime then request[action]=nil; changed=true end end
                    if not request.dance and not request.hug then actionRequests[id]=nil end
                end
                if changed then set("sa_action_requests",actionRequests) end
                pruneActionsAt=now+1
            end
        end
    end
end
