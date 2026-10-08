# Stream Avatars LAN setup

The bot runs on Linux. Stream Avatars runs on the gaming computer and opens an outbound connection to the bot. This integration is optional; ordinary bot services continue if the companion is absent. The moving-heart renderer has automated Lua stub tests, but real Stream Avatars/OBS verification is still required before accepting issue #65.

## Linux bot configuration

Use Node.js 24.15.0 or newer in the 24.x series and `npm ci`. Keep your ordinary bot configuration for integrated Twitch control. Add these settings to your private `.env`:

```dotenv
STREAM_AVATARS_ENABLED=true
STREAM_AVATARS_HOST=0.0.0.0
STREAM_AVATARS_PORT=3001
STREAM_AVATARS_TOKEN=<private-random-token>
STREAM_AVATARS_STATE_DIR=./data/stream-avatars
STREAM_AVATARS_OFFLINE_GRACE_SECONDS=900
STREAM_AVATARS_STRIP_X=<measured-left-game-coordinate>
STREAM_AVATARS_STRIP_Y=<measured-bottom-game-coordinate>
STREAM_AVATARS_STRIP_WIDTH=<measured-safe-width>
STREAM_AVATARS_STRIP_HEIGHT=<measured-safe-height>
STREAM_AVATARS_MAX_HEARTS=50
STREAM_AVATARS_HEART_OFFSET=16
TWITCH_ADMIN_USERS=<your-twitch-login>
```

Generate a token locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; copy it privately to both configurations. Authentication occurs in the first WebSocket frame, never a URL or chat message. Use `ws://<bot-lan-ip>:3001/sa/socket`. Restrict the listener with your LAN firewall to the gaming computer. Plain WebSocket does not encrypt the connection; for an untrusted network use a TLS reverse proxy and a `wss://` companion URL. Keep port 3001 separate from the existing voice overlay's 3000.

Strip coordinates and heart offset accept finite decimal game units. Port, grace seconds, and heart count are integers. Invalid bridge settings disable only this integration. A missing/disconnected companion does not queue effects or stop ordinary bot services.

### Persistent Docker storage

The Compose example mounts `stream-avatars-state` at `/usr/src/app/data/stream-avatars`; uncomment its 3001 port mapping when enabling the bridge. Keep `STREAM_AVATARS_STATE_DIR` at that path (the default relative path resolves there). Restarting or replacing the container retains progress. Do not run `docker compose down -v` when preserving sessions.

For a direct container run, add `-p 3001:3001 -v stream-avatars-state:/usr/src/app/data/stream-avatars` and supply the private `.env`. For bind mounts, create the directory with ownership writable by the image's unprivileged `node` user (UID/GID 1000). Keep the mount private, and do not share it between bot instances.

Production and rehearsal use distinct `production/state.json` and `rehearsal/state.json`. Writes are serialized, fsynced, and atomically renamed; the previous good state remains in `.backup`. Corrupt state is quarantined and requires explicit recovery/reset. State includes reserved donation IDs, integer-cent totals, and checkpoint fields for future integration slices. Session loading and backup recovery send snapshots without replaying transient animations. The session clock uses the original Twitch start and survives changed IDs/start metadata; only a continuous sequence of successful offline samples spanning the grace period ends it. Unknown/error observations and gaps longer than two sampling intervals interrupt offline confirmation.

Each state file has an exclusive `.lock`. After a crash, verify that no process/container still owns the directory before manually removing its stale lock. A second writer or aliased rehearsal path is refused. Keep archives/backups when diagnosing recovery; do not put state in Git.

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

## Twitch command reference

Only logins in `TWITCH_ADMIN_USERS` can operate these commands, in `TWITCH_CHANNEL`. Moderator/broadcaster badges alone do not grant access. Duplicate or old chat messages are refused. Discord controls are unavailable.

| Command | Behavior |
| --- | --- |
| `!sa status` | Mode, crowd count, elapsed hours, connection and recovery status |
| `!sa rehearsal start` | Start/resume isolated rehearsal after a fresh offline sample |
| `!sa rehearsal stop` | Clear synthetic crowd/effects, revoke rehearsal Hue permission |
| `!sa rehearsal reset` | Reset only rehearsal state; restart it if currently active |
| `!sa crowd 0` through `!sa crowd 100` | Set desired synthetic crowd |
| `!sa crowd join 21` / `!sa crowd leave 21` | Add/remove that numbered synthetic user |
| `!sa hearts` | Five-second moving-heart preview; requires rehearsal or fresh confirmed live production |
| `!sa clock advance 1h` / `!sa clock seek 5m` | Change rehearsal time; retain session identity and ledger |
| `!sa scenario reconnect` | Brief offline/reconnect with changed metadata; reconnect companion |
| `!sa scenario changed-stream` | Change simulated Twitch ID/start metadata |
| `!sa scenario api-error` | Simulate an unknown API observation |
| `!sa scenario sustained-offline` | Confirm grace-period end and start a fresh simulated session |
| `!sa scenario restart` | Reload saved rehearsal state without replaying effects |
| `!sa hue on` / `!sa hue off` | Explicit physical Hue opt-in/out for rehearsal previews |
| `!sa session recover confirm` | Restore validated production backup with a new recovery baseline |
| `!sa session reset confirm` | Archive and reset production state |

Durations use integer `s`, `m`, or `h` units and are limited to 48 hours per command. Synthetic crowd IDs are limited to 1–100. Production recovery/reset requires a fresh successful offline observation; it cannot alter an active live session. Rehearsal cannot generate fake donation announcements or stream markers. Short acknowledgements of admin commands are sent to Twitch. Ordinary real donation/Hue services remain independently active; rehearse offline to avoid mixing real effects with previews.

The scenario registry accepts only trusted locally registered handlers. Future features can add scenarios for games, donations, milestones, chapters and the finale; these are not shipped by this foundation. Payloads cannot select arbitrary script names or image paths.

## Standalone rehearsal

On the Linux server, configure only the bridge token, port, writable state directory, and measured strip bounds, then run `npm run sa:rehearse`. It automatically enters rehearsal and never opens production state or external Twitch/Discord/Extra Life clients. Enter the commands above without `!sa`, such as `crowd 20`, `hearts`, `clock advance 7h`, and `scenario restart`. Type `quit`, or use SIGINT/SIGTERM to stop and clean up. Do not run it alongside an integrated bot on the same port/state directory.

Physical Hue remains off unless `SA_REHEARSAL_HUE_ENABLED=true` and valid private `HUE_USERNAME`, `HUE_IPADDRESS`, and `HUE_GROUPID` are supplied. The CLI then explicitly enables rehearsal Hue. Do not enable that option for ordinary visual verification.

## Real LAN and OBS acceptance run

1. Record the Linux host/runtime, Stream Avatars version, OBS source dimensions, measured game bounds, sprite dimensions and avatar offset. Back up the gaming computer's settings. Use OBS preview or a local recording; Twitch may remain offline.
2. Import the image and On Connect companion, set the custom Lua service/private settings, and connect through the actual authenticated LAN endpoint. Verify `!sa status` reports connected (or `status` in the CLI). Verify a deliberately wrong test token receives no snapshot, then restore the private correct token.
3. Run crowds of **1, 10, 50, and 100** and trigger hearts for each. Capture OBS screenshots or a local recording showing transparency, hearts following moving avatars and the full effect rectangle staying inside the measured bottom strip. The default dense-crowd cap is 50 concurrent hearts with rotation across eligible avatars.
4. While a preview is active, join/leave users and move avatars to the strip edges. Confirm late joins receive effects, disappearing users lose their objects, and all hearts disappear after five seconds. Confirm disconnect/reconnect, rehearsal stop/reset, and companion reload remove temporary objects and owned synthetic users.
5. Advance/seek time and run all five built-in scenarios. Record original session ID/start before brief reconnect, changed-stream, API error, and restart; verify identity/progress remain and no old hearts replay. Sustained offline creates a fresh ID. Test automatic real-live preemption with the automated integration test rather than starting a public broadcast solely for verification.
6. Stop rehearsal, restore normal Stream Avatars Login Details service and `customService: false`, reconnect, and confirm the ordinary overlay layout is intact. Keep private tokens and credentials out of screenshots and logs.

Attach the measured values and real preview evidence to the implementation PR. Automated Lua/API tests do not satisfy this visual acceptance gate; its current status is recorded in [verification evidence](stream-avatars-verification.md).
