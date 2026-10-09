# Stream Avatars LAN setup

The bot runs on Linux. Stream Avatars runs on the gaming computer and opens an outbound connection to the bot. This integration is optional; ordinary bot services continue if the companion is absent. The moving-heart renderer has automated Lua stub tests, but real Stream Avatars/OBS verification is still required before accepting issue #65.

## Linux bot configuration

Use Node.js 24.15.0 or newer in the 24.x series and `npm ci`. Keep your ordinary bot configuration for integrated Twitch control. Add these settings to your private `.env`:

```dotenv
STREAM_AVATARS_ENABLED=true
WEB_HOST=0.0.0.0
WEB_PORT=3000
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

Generate a token locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; copy it privately to both configurations. Authentication occurs in the first WebSocket frame, never a URL or chat message. Use `ws://<bot-lan-ip>:3000/sa/socket`. Restrict the listener with your LAN firewall to the gaming computer. Plain WebSocket does not encrypt the connection; for an untrusted network use a TLS reverse proxy and a `wss://` companion URL.

The voice overlay's HTTP/SSE routes and this WebSocket route share one listener and port. Publish port 3000 once, even when both integrations are enabled. Set `WEB_HOST`/`WEB_PORT` for both integrations. Existing `VOICE_OVERLAY_HOST`/`VOICE_OVERLAY_PORT` values remain fallback aliases when the corresponding shared setting is absent; explicit shared settings take precedence. Remove the earlier proposed `STREAM_AVATARS_HOST`/`STREAM_AVATARS_PORT` settings and change the companion URL from port 3001 to the shared port.

Each integration can run independently; stopping one removes only its routes and connections. Listener startup does not wait for Discord readiness. A listener bind failure disables both web integrations while the remaining bot services continue.

Strip coordinates and heart offset accept finite decimal game units. Port, grace seconds, and heart count are integers. Invalid bridge settings disable only this integration. A missing/disconnected companion does not queue effects or stop ordinary bot services.

### Persistent Docker storage

The Compose example mounts `stream-avatars-state` at `/usr/src/app/data/stream-avatars`; uncomment its 3000 port mapping when enabling the bridge. Keep `STREAM_AVATARS_STATE_DIR` at that path (the default relative path resolves there). Restarting or replacing the container retains progress. Do not run `docker compose down -v` when preserving sessions.

For a direct container run, add `-p 3000:3000 -v stream-avatars-state:/usr/src/app/data/stream-avatars` and supply the private `.env`. For bind mounts, create the directory with ownership writable by the image's unprivileged `node` user (UID/GID 1000). Keep the mount private, and do not share it between bot instances.

Production and rehearsal use distinct `production/state.json` and `rehearsal/state.json`. Writes are serialized, fsynced, and atomically renamed; the previous good state remains in `.backup`. Corrupt state is quarantined behind a durable `.recovery-required` gate that survives restarts and requires explicit recovery/reset; do not remove that marker manually. State includes reserved donation IDs, integer-cent totals, and checkpoint fields for future integration slices. Session loading and backup recovery send snapshots without replaying transient animations. The session clock uses the original Twitch start and survives changed IDs/start metadata; only a continuous sequence of successful offline samples spanning the grace period ends it. Unknown/error observations and gaps longer than two sampling intervals interrupt offline confirmation.

Each state file has an exclusive `.lock`. After a crash, verify that no process/container still owns the directory before manually removing its stale lock. A second writer or aliased rehearsal path is refused. Keep archives/backups when diagnosing recovery; do not put state in Git.

## Windows gaming computer

The same companion runs in Stream Avatars on Windows; no separate system Lua installation is needed for the application. Import the generated package below, or use Stream Avatars' **Create Script** action for the manual setup. Do not hard-code Windows paths into the script. The WebSocket URL names the Linux bot's LAN address, not `localhost` on the gaming computer. Allow Stream Avatars' outbound connection through Windows Defender Firewall, and permit the incoming bridge port on the Linux LAN firewall. Do not publish the bridge to the public internet.

Native Windows/Linux Lua 5.2 and 5.4 CI, plus CRLF/path-with-spaces tests, check portability without installing Stream Avatars. They do not reproduce the application's graphics engine. See [Lua confidence and remaining visual checks](stream-avatars-verification.md#lua-confidence-and-windows-portability).

## Companion import

### Generate and import a package

After `npm ci`, run:

```sh
npm run sa:package
```

This creates **`dist/stream-avatars/sa-helper-bridge.zip`**, containing the current Lua companion, every image described by `integrations/stream-avatars/assets/*.json`, and the saved image animation settings. The ZIP uses Stream Avatars' private-content import layout (`data.txt` and `scripts/sa_helper_bridge/`). It includes the On Connect command and sets looping animations to the native infinity value, so frame sizes, FPS and looping do not need to be entered manually. Packaging works on Mac, Windows and Linux with Node.js alone; it does not require Stream Avatars, system Lua, or a platform-specific ZIP utility. The generated `dist/` directory is ignored by Git.

To choose another output location, run `npm run sa:package -- --output "path with spaces/bridge.zip"`. Identical inputs produce byte-identical ZIPs.

1. Back up the destination's Stream Avatars settings. For updates, privately copy its existing `sa_helper_bridge_settings.json` before importing.
2. On the destination computer, open **Import & Export → Select Import** and select the ZIP. The command is named **sa_helper_bridge**.
3. Open that command's script folder through **Create Script** and edit **sa_helper_bridge_settings.json**. Set the actual bot URL and matching private token, or restore the saved private settings when updating. The package always uses placeholder URL/token values and `customService: false`; it never reads `.env`, local credentials, or the installed application's data.
4. Connect Stream Avatars and run `hearts` in rehearsal. See the measured bounds and offline crowd instructions below.

**Reimporting replaces this command, its script folder, images and settings.** Preserve private settings and any custom edits first. General application settings, Twitch login, selected platform, avatar capacity and OBS scenes are not part of the package. Select the Custom Lua service and `customService: true` separately for offline crowds; keep your ordinary streaming service and `customService: false` for production.

### Add images to future packages

Add a PNG spritesheet and a matching JSON manifest to `integrations/stream-avatars/assets/`, following `heart.json`:

```json
{
  "name": "sa_heart",
  "file": "heart.png",
  "frameWidth": 32,
  "frameHeight": 32,
  "frames": 8,
  "rows": 1,
  "framesPerSecond": 12,
  "loop": true,
  "transparent": true
}
```

`frames` is the total frame count, laid out in `rows` equal rows. For example, eight 32×32 frames in two rows require a 128×64 PNG. Names must be unique even when compared without case, and use letters, numbers, underscores or hyphens; Windows reserved filenames are refused. `file` must name a PNG directly inside the assets directory. Packaging checks PNG chunk checksums, sheet dimensions, positive integer frame geometry, FPS (greater than zero and at most 240), and boolean `loop`/`transparent` fields. Use actual PNG alpha for transparent images; this flag describes the asset and does not remove a background. Files must be regular files, not symlinks. Frame dimensions/count/rows are limited to 4096, PNGs to 16 megapixels and 32 MiB each, and the complete package input to 128 MiB.

Run `npm run sa:package` again to include new manifests automatically. Unlisted PNGs, editable SVGs and private files are not bundled. Importing an image makes it available to Lua; a new effect still needs renderer logic to select and use it.

### Manual setup

1. Back up your Stream Avatars settings and record your current Login Details streaming service.
2. Import `integrations/stream-avatars/companion.lua` as an **On Connect** Lua command. Do not import real credentials into shared script exports.
3. In that script's local JSON settings file, copy `settings.example.json`, replace the bot LAN address and private shared token, and keep `customService: false` for ordinary streaming. The companion includes compatibility for embedded parsers that reject their own escaped slashes during `get()` calls. Stream Avatars' `load()` reads this local script JSON; the repository example is not the live settings file. Never commit or paste the token into chat.
4. Under Bot Commands > Advanced > Images > Create New, import `assets/heart.png` as **sa_heart**. Set each frame to **32×32**, **8 frames**, and **12 FPS**. Set **Loop to ∞** using the infinity button beside the Loop field; the default value `1` plays the sheet once, then holds its last frame. The whole sheet is 256×32 with transparency. The SVG is the editable source; the PNG is the import asset.
5. Connect Stream Avatars. The Lua log prints the lower-left and upper-right game coordinates. `getResolution()` reports window pixels and must not be substituted for these coordinates.
6. Measure the safe avatar strip in game units before OBS cropping/scaling. Set the Linux environment's `STREAM_AVATARS_STRIP_X`, `Y`, `WIDTH`, and `HEIGHT` to that rectangle. Measure the imported heart's displayed width/height in these same units and set private `worldWidth`/`worldHeight` accordingly; `avatarTopOffset` is the measured distance from user position to avatar top. The supplied 32/32/40 are initial rehearsal values, not verified overlay measurements. The bot's `HEART_OFFSET` is an additional offset in game units.

The companion clamps the whole measured heart rectangle, follows active avatars, rotates a 50-object selection for large crowds, and clears temporary objects on expiry, disconnect, mode switch, reload, or explicit stop. Missing or stalled image loads time out after two game seconds, produce a sanitized diagnostic, and leave the connection responsive. The host may retain a blank pending object when its callback fails; pending loads are capped at 100. Repair the image import and press F5 to clear retained host objects and retry.

**`worldWidth` and `worldHeight` mean the displayed heart's dimensions in game coordinates, not the whole screen or game area.** The current 32×32 frame at image scale `1` occupies 32×32 game units, so use `32` for both. The 256×32 spritesheet width is not the displayed frame width. In the installed application, displayed frame dimensions equal frame pixels multiplied by the image's scale (with the companion's object scale at `1`). If you change the image scale to `2`, use `64` for both. These values give the renderer a half-width/half-height margin at strip edges so the complete image stays inside. The overall allowed area is configured separately on the bot with `STREAM_AVATARS_STRIP_X`, `Y`, `WIDTH`, and `HEIGHT`; screen/OBS pixels can differ from game coordinates. `avatarTopOffset` is separate again: the distance from the avatar position to its top.

**`STREAM_AVATARS_HEART_OFFSET` adds the distance from the avatar's top to the heart's center.** Before strip-edge clamping, `heartCenterY = avatarPositionY + avatarTopOffset + HEART_OFFSET`. With `avatarTopOffset: 40`, a 32-unit-tall heart and `HEART_OFFSET=16`, the heart's bottom meets the avatar's top. To leave an 8-unit gap, use `HEART_OFFSET=24` (half the displayed heart height plus the desired gap). Measure `avatarTopOffset` for your avatar geometry; use `HEART_OFFSET` to adjust the visual spacing above it.

If a heart follows the avatar but looks static, check the imported image's **Loop** field first. Eight frames at 12 FPS finish one cycle in about 0.67 seconds; with Loop `1`, the remaining preview shows a still image. The image editor's own preview loops independently, so an animated editor preview does not prove the saved image is configured to loop during Lua playback. Set Loop to **∞**, save, and run another `hearts` preview.

## Offline crowd

Select Stream Avatars' **custom Lua streaming service** under Login Details and set private `customService: true` before connecting. Allow at least **101 avatars** for 100 synthetic viewers plus the caster, with spawning set to **Everyone / In Chat**. The bot's separate Twitch chat connection continues receiving admin controls. Synthetic users have IDs 900001–900100 and names `sa_rehearsal_1`–`sa_rehearsal_100`; reserve these IDs. This companion only removes IDs it created. It does not require viewers or the Twitch extension.

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
| `!sa hue on` / `!sa hue off` | Explicit physical Hue opt-in/out for rehearsal previews; off cancels owned effects |
| `!sa session recover confirm` | Restore validated production backup with a new recovery baseline |
| `!sa session reset confirm` | Archive and reset production state |

Durations use integer `s`, `m`, or `h` units and are limited to 48 hours per command. Synthetic crowd IDs are limited to 1–100. Production recovery/reset requires a fresh successful offline observation; it cannot alter an active live session. Rehearsal cannot generate fake donation announcements or stream markers. Rehearsal stop/reset, Hue-off and real-live preemption cancel only rehearsal-owned Hue effects and restore any changed lights; ordinary production Hue remains available. Short acknowledgements of admin commands are sent to Twitch. Ordinary real donation/Hue services remain independently active; rehearse offline to avoid mixing real effects with previews.

The scenario registry accepts only trusted locally registered handlers. Future features can add scenarios for games, donations, milestones, chapters and the finale; these are not shipped by this foundation. Payloads cannot select arbitrary script names or image paths.

## Standalone rehearsal

On the Linux server, configure only the bridge token, port, writable state directory, and measured strip bounds, then run `npm run sa:rehearse`. It automatically enters rehearsal and never opens production state or external Twitch/Discord/Extra Life clients. Enter the commands above without `!sa`, such as `crowd 20`, `hearts`, `clock advance 7h`, and `scenario restart`. Type `quit`, or use SIGINT/SIGTERM to stop and clean up. Do not run it alongside an integrated bot on the same port/state directory.

Physical Hue remains off unless `SA_REHEARSAL_HUE_ENABLED=true` and valid private `HUE_USERNAME`, `HUE_IPADDRESS`, and `HUE_GROUPID` are supplied. The CLI then explicitly enables rehearsal Hue. Do not enable that option for ordinary visual verification.

## Real LAN and OBS acceptance run

1. Record the Linux host/runtime, Stream Avatars version, OBS source dimensions, measured game bounds, sprite dimensions and avatar offset. Back up the gaming computer's settings. Use OBS preview or a local recording; Twitch may remain offline.
2. Import the image and On Connect companion, set the custom Lua service/private settings, and connect through the actual authenticated LAN endpoint. With the full bot, verify `!sa status` reports connected. In the standalone CLI, `status` reports rehearsal state; use `hearts` to verify an authenticated companion receives the preview, then check its console and appearance. Verify a deliberately wrong test token receives no snapshot, then restore the private correct token.
3. Run crowds of **1, 10, 50, and 100** and trigger hearts for each. Capture OBS screenshots or a local recording showing transparency, hearts following moving avatars and the full effect rectangle staying inside the measured bottom strip. The default dense-crowd cap is 50 concurrent hearts with rotation across eligible avatars.
4. While a preview is active, join/leave users and move avatars to the strip edges. Confirm late joins receive effects, disappearing users lose their objects, and all hearts disappear after five seconds. Confirm disconnect/reconnect, rehearsal stop/reset, and companion reload remove temporary objects and owned synthetic users.
5. Advance/seek time and run all five built-in scenarios. Record original session ID/start before brief reconnect, changed-stream, API error, and restart; verify identity/progress remain and no old hearts replay. Sustained offline creates a fresh ID. Test automatic real-live preemption with the automated integration test rather than starting a public broadcast solely for verification.
6. Stop rehearsal, restore normal Stream Avatars Login Details service and `customService: false`, reconnect, and confirm the ordinary overlay layout is intact. Keep private tokens and credentials out of screenshots and logs.

Attach the measured values and real preview evidence to the implementation PR. Automated Lua/API tests do not satisfy this visual acceptance gate; its current status is recorded in [verification evidence](stream-avatars-verification.md).
