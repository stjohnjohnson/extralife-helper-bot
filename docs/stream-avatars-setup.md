# Stream Avatars LAN setup

The bot runs on Linux. Stream Avatars runs on the gaming computer and opens an outbound connection to the bot. This integration is optional; ordinary bot services continue if the companion is absent. The moving-heart renderer has automated Lua stub tests, but real Stream Avatars/OBS verification is still required before accepting issue #65.

## Companion import

1. Back up your Stream Avatars settings and record your current Login Details streaming service.
2. Import `integrations/stream-avatars/companion.lua` as an **On Connect** Lua command. Do not import real credentials into shared script exports.
3. In that script's local JSON settings file, copy `settings.example.json`, replace the bot LAN address and private shared token, and keep `customService: false` for ordinary streaming. Stream Avatars' `load()` reads this local script JSON; the repository example is not the live settings file. Never commit or paste the token into chat.
4. Under Bot Commands > Advanced > Images > Create New, import `assets/heart.png` as **sa_heart**. Set each frame to **32×32**, **8 frames**, **12 FPS**, and **loop**. The whole sheet is 256×32 with transparency. The SVG is the editable source; the PNG is the import asset.
5. Connect Stream Avatars. The Lua log prints the lower-left and upper-right game coordinates. `getResolution()` reports window pixels and must not be substituted for these coordinates.
6. Measure the safe avatar strip in game units before OBS cropping/scaling. Set the Linux environment's `STREAM_AVATARS_STRIP_X`, `Y`, `WIDTH`, and `HEIGHT` to that rectangle. Measure the imported heart's displayed width/height in these same units and set private `worldWidth`/`worldHeight` accordingly; `avatarTopOffset` is the measured distance from user position to avatar top. The supplied 32/32/40 are initial rehearsal values, not verified overlay measurements. The bot's `HEART_OFFSET` is an additional offset in game units.

The companion clamps the whole measured heart rectangle, follows active avatars, rotates a 50-object selection for large crowds, and clears temporary objects on expiry, disconnect, mode switch, reload, or explicit stop. Missing image imports produce a sanitized diagnostic and skip the preview.

## Offline crowd

Select Stream Avatars' **custom Lua streaming service** under Login Details and set private `customService: true` before connecting. The bot's separate Twitch chat connection continues receiving admin controls. Synthetic users have IDs 900001–900100 and names `sa_rehearsal_1`–`sa_rehearsal_100`; reserve these IDs. This companion only removes IDs it created. It does not require viewers or the Twitch extension.

After rehearsal, stop its effects/crowd, restore your normal streaming service and `customService: false`, and reconnect Stream Avatars. A real Twitch live observation automatically stops the integrated rehearsal; restoring the Stream Avatars Login Details service is still a manual step.

Primary API references: [WebSockets](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/events/websockets), [sprite import](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/global-functions/applyimage), [custom Lua service](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/events/servicecontroller), [game coordinates](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/classes/app/convertpercenttoposition), and [coroutine state](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips).
