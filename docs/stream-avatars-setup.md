# Stream Avatars setup

The bot runs on Linux, Mac or Windows. Stream Avatars opens an outbound WebSocket connection to it. The voice overlay and this bridge share the `WEB_HOST`/`WEB_PORT` listener, defaulting to port 3000. Either integration can run independently.

## Configure the bot

Use Node.js 24.15.0 or newer in the 24.x series and `npm ci`. Keep ordinary bot credentials for integrated Twitch controls. Add to your private `.env`:

```dotenv
STREAM_AVATARS_ENABLED=true
STREAM_AVATARS_TOKEN=<private-random-token>
```

Generate a token with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and privately copy it to the companion. Tokens must contain 16–256 characters. Authentication uses the first WebSocket frame, never a URL or chat message.

The existing shared listener settings are `WEB_HOST=0.0.0.0` and `WEB_PORT=3000`. Existing voice-overlay host/port values remain fallback aliases. Permit port 3000 from the gaming computer on your LAN firewall. For an untrusted network, use a TLS reverse proxy and a `wss://` address. Invalid bridge settings disable this integration; ordinary bot services continue. Disconnected companions do not queue animations.

## Generate and import the ZIP

```sh
npm run sa:package
```

This creates `dist/stream-avatars/sa-helper-bridge.zip`, containing the On Connect Lua command, repository image catalog and saved animation settings. It sets frame sizes, FPS and infinite looping automatically. Packaging requires Node.js alone and works on Mac, Windows and Linux. Generated files are ignored by Git. To choose another location, use `npm run sa:package -- --output "path with spaces/bridge.zip"`.

1. Back up the destination's Stream Avatars settings. For updates, privately save its existing `sa_helper_bridge_settings.json`.
2. Open **Import & Export → Select Import** and select the ZIP. The command is named **sa_helper_bridge**.
3. Open its script folder through **Create Script** and edit **sa_helper_bridge_settings.json**:

   ```json
   {
     "address": "192.168.1.42",
     "token": "YOUR_PRIVATE_TOKEN"
   }
   ```

4. Replace the address with the bot computer's LAN IP. For testing on the same Mac, use `127.0.0.1`. Connect Stream Avatars.

A bare address uses port 3000 and `/sa/socket`. For another port use `192.168.1.42:4444`; for TLS use the full `wss://bridge.example/sa/socket` URL. IPv6 addresses need brackets, such as `[::1]`. Existing `url` settings remain accepted for migration.

The package contains placeholder address/token values and never reads `.env`, private settings or installed application data. **Reimporting replaces the command, its script folder, images and settings.** Restore saved private address/token values afterwards. General application settings, Twitch login, selected platform, avatar capacity and OBS scenes are separate.

### Image catalog

Add PNG spritesheets and matching JSON manifests under `integrations/stream-avatars/assets/`, following `heart.json`:

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

`frames` is the total count across equal rows. Eight 32×32 frames in two rows need a 128×64 PNG. Names must be unique ignoring case and use letters, numbers, underscores or hyphens; Windows reserved names are refused. Files must be regular PNGs directly inside the assets directory. Packaging validates PNG checksums, decoding, sheet dimensions and animation metadata, with bounded input sizes. Use actual PNG alpha for transparency.

Run `npm run sa:package` again to include new manifests. Unlisted PNGs, SVG sources and private files are excluded. A new effect still needs Lua logic to use its image. The heart's dimensions are generated from `sa_heart` metadata at scale 1; keep the imported image scale at 1.

### Manual alternative

Import `integrations/stream-avatars/companion.lua` as an **On Connect** command and copy `settings.example.json` into its local settings file. Import `assets/heart.png` as **sa_heart**: 32×32 frames, eight frames, 12 FPS, **Loop ∞** using the infinity button. The whole sheet is 256×32. A loop count of 1 plays once and holds the final frame, even though the image editor's preview keeps animating.

The companion obtains the current game canvas bounds directly from Stream Avatars, including window resizing. It clamps the full image inside that canvas, follows active avatars and rotates a maximum of 50 hearts between previews. The supplied art uses fixed 40-unit avatar-top spacing; no geometry settings are needed. Different avatar art may need a future spacing adjustment.

Effects clear on expiry, disconnect, mode/session switch, reload or an explicit clear. Image loads time out after two game seconds and report a sanitized diagnostic. A failed host callback can retain an invisible pending object; outstanding loads are capped at 100. Repair the image import and press F5 to clear retained host objects and retry. The embedded-parser slash compatibility fix remains included.

## Minimal offline preview

For synthetic viewers, select **Custom Lua** under Stream Avatars' Login Details. Allow **101 avatars** for 100 viewers plus the caster, with spawning set to **Everyone / In Chat**. No extra JSON flag is needed. The bot's separate Twitch chat connection still receives admin commands. Synthetic IDs 900001–900100 and names `sa_rehearsal_1`–`sa_rehearsal_100` are reserved; cleanup removes only companion-owned viewers.

In Twitch, only logins in `TWITCH_ADMIN_USERS` can control this feature in `TWITCH_CHANNEL`. Moderator/broadcaster badges alone do not grant access; duplicate/old chat messages are refused.

| Command | Behavior |
| --- | --- |
| `!sa status` | Mode, crowd count, elapsed time, connection and recovery status |
| `!sa rehearsal start` | Start temporary preview after a fresh confirmed offline Twitch sample |
| `!sa crowd 0` through `!sa crowd 100` | Set synthetic crowd count |
| `!sa hearts` | Five-second animated heart preview; needs rehearsal or fresh confirmed live production |
| `!sa clear` | Clear effects and synthetic viewers while keeping preview mode |
| `!sa rehearsal stop` | Clear preview and return to production rendering |
| `!sa session recover confirm` | Restore validated production backup while offline |
| `!sa session reset confirm` | Archive and reset production state while offline |

Preview state exists only in memory. It uses real elapsed time and starts fresh after restart. Real live status automatically stops integrated rehearsal. Afterwards, restore your normal Stream Avatars streaming service and reconnect. Production donation and Hue services remain independently active.

For a local preview without Twitch, Discord or Extra Life credentials, set only the private bridge token and run:

```sh
npm run sa:rehearse
```

It automatically enters rehearsal and writes no state files. Enter `crowd 20`, `hearts`, `clear`, `status`, and `quit`. SIGINT/SIGTERM also clean up. Avoid running it alongside the integrated bot on the same port. There are no scenario, clock or Hue preview controls.

## Production persistence

Production progress remains in `./data/stream-avatars/production/state.json`. The Compose example mounts `stream-avatars-state` at `/usr/src/app/data/stream-avatars`; uncomment its port 3000 mapping when enabling the bridge. A direct container run needs `-p 3000:3000 -v stream-avatars-state:/usr/src/app/data/stream-avatars`. Bind mounts must be writable by the unprivileged `node` user (UID/GID 1000). Do not share a state directory between instances or use `docker compose down -v` when preserving progress.

Optional deployment overrides remain `STREAM_AVATARS_STATE_DIR` and `STREAM_AVATARS_OFFLINE_GRACE_SECONDS` (defaults `./data/stream-avatars` and 900). Normal setup needs neither.

Writes are serialized, fsynced and atomically renamed, with a previous good `.backup`. Corrupt state creates a durable `.recovery-required` gate; recover or reset explicitly while offline. Reconnect/restart sends current state without replaying animations. The session retains the original Twitch start across metadata changes and ends only after continuous successful offline samples spanning the grace period. API errors and long sampling gaps interrupt offline confirmation.

Each state file has an exclusive `.lock`. After a crash, confirm that no process/container owns the directory before removing a stale lock. Keep backups private and outside Git. Old rehearsal state files are no longer read and can be archived separately.

## Real LAN and OBS acceptance run

1. Generate/import the latest package and privately set the address/token on the gaming computer. Windows needs no system Lua installation; allow Stream Avatars' outbound connection through its firewall.
2. Run the local preview server or start integrated rehearsal while Twitch is confirmed offline.
3. Preview crowds of 0, 1, 20 and 100. Run several `hearts` previews, check animation/following, full-image clamping, window resizing and dense-crowd frame rate.
4. Disconnect/reconnect and press F5. Confirm cleanup, current crowd restoration and no replay of expired effects. Test a missing image, repair it and reload.
5. Capture the transparent scene in OBS, checking the chosen crop, image spacing and performance. Game canvas bounds do not account for an OBS crop.
6. Clear/stop, restore the normal streaming service and reconnect. Keep credentials out of screenshots.

Automated tests execute shipped Lua and real protocol JSON on Linux, with Lua 5.2 compatibility, CRLF and paths with spaces. The test-only JSON library is absent from the import ZIP and Docker runtime. Windows CI has been removed: stock Lua on Windows does not reproduce Stream Avatars' embedded runtime or graphics. See [verification evidence and outstanding checks](stream-avatars-verification.md).
