# Stream Avatars setup

The bot runs on Linux, Mac or Windows. Stream Avatars opens an outbound WebSocket connection to it. The voice overlay and this bridge share the `WEB_HOST`/`WEB_PORT` listener, defaulting to port 3000. Either integration can run independently.

## Configure the bot

Use Node.js 24.15.0 or newer in the 24.x series and `npm ci`. Keep ordinary bot credentials for integrated Twitch controls. Add to your private `.env`:

```dotenv
STREAM_AVATARS_ENABLED=true
STREAM_AVATARS_TOKEN=<private-random-token>
STREAM_AVATARS_DONATION_INTERVAL_CENTS=50000
```

Generate a token with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and privately copy it to the companion. Tokens must contain 16–256 characters. Authentication uses the first WebSocket frame, never a URL or chat message.

The existing shared listener settings are `WEB_HOST=0.0.0.0` and `WEB_PORT=3000`. Existing voice-overlay host/port values remain fallback aliases. Permit port 3000 from the gaming computer on your LAN firewall. For an untrusted network, use a TLS reverse proxy and a `wss://` address. Invalid bridge settings disable this integration; ordinary bot services continue. Disconnected companions do not queue animations.

## Generate and import the ZIP

```sh
npm run sa:package
```

The v2 companion must be reimported for donation celebrations; v1 clients receive an import diagnostic. This creates `dist/stream-avatars/sa-helper-bridge.zip`, containing the On Connect Lua command, repository image catalog and saved animation settings. It sets frame sizes, FPS and infinite looping automatically. Packaging requires Node.js alone and works on Mac, Windows and Linux. Generated files are ignored by Git. To choose another location, use `npm run sa:package -- --output "path with spaces/bridge.zip"`.

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

### Renderer behavior

The package includes the looping heart, gold-confetti sheet, goal accent, and bitmap captions/numeric glyphs. `node scripts/sa-assets.js` regenerates the original celebration art deterministically; package all its manifests together. Manual import requires every manifest's geometry and loop settings, so use the ZIP for updates.

Ordinary donations create five-second following hearts above up to 101 active avatars, including the caster, with a quick local jump and Thank you! caption. Nearby gifts share a bounded recognition layer. Crossing a live-money interval starts one 18-second gold confetti/dance party showing the actual cumulative total. A campaign-goal crossing gets a distinct 20-second goal party; it takes priority over milestones. Gifts during a party add short hearts and retain their money without queuing another party. No donor name is linked to a Twitch avatar.

The renderer reads current canvas bounds, including resizing and negative coordinates. Its budgets are 101 hearts, 32 confetti objects, 48 caption objects and 128 pending image loads. Larger crowds report `density-limit`. The supplied art uses 40-unit avatar-top spacing; check other avatar sizes visually. Images stay inside the game canvas; OBS cropping is separate.

Expiry, disconnect, generation/session change, reload and shutdown clear owned effects. Layer failures leave other available visuals and the heartbeat running. A failed host callback can retain an invisible pending object until F5; repair missing assets and reload. Local jump/dance commands are quiet and fixed. Native animation access/cooldowns can affect actions; another active minigame/state is preserved during dance admission and cleanup. Gear and chapter decorations are never modified.

## Temporary development integration test

This replaces interactive rehearsal. Run a temporary instance of only the donation/session/avatar subsystem; fixtures pass through the same source normalization, persistence and composer used in production. It starts no Discord, Twitch, Extra Life network or stream-marker clients, and creates its own removable OS temp directory. `STREAM_AVATARS_STATE_DIR` and production credentials are not used. Physical Hue is opt-in.

On the Linux bot computer (or locally), set the token and listener only. Use another port while production remains running:

```sh
STREAM_AVATARS_TOKEN='<matching-private-token>' WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20
```

The bridge listens on `WEB_HOST` (default `0.0.0.0`) and prints its address. Set the companion's private address to `BOT_LAN_IP:3010` and matching token. Select **Custom Lua** in Stream Avatars' Login Details, spawning **Everyone / In Chat**, and allow **101 avatars** for 100 viewers plus the caster. The runner waits up to 60 seconds for an authenticated ready v2 companion, then plays six independent scenarios at their real durations. Names `sa_integration_1`–`sa_integration_100` and IDs 900001–900100 are reserved; cleanup removes only companion-owned viewers. The Custom Lua caster is restored by returning to your normal streaming service afterwards.

Use `--scenario ordinary|anonymous|batch|milestone|large|goal|all` and `--crowd 0..100`. For physical lights, add `--hue` and supply only `HUE_USERNAME`, `HUE_IPADDRESS`, and `HUE_GROUPID`; the existing Hue donation effect and restoration path run. Without that flag, Hue settings in `.env` never initialize lights. Logs describe expected visuals and successful dispatch, rather than asserting that rendering passed.

For a container, use the feature image with no production-state volume:

```sh
docker run --rm -it -p 3010:3000 -e STREAM_AVATARS_TOKEN='<matching-private-token>' IMAGE_WITH_THIS_CHANGE npm run sa:integration -- --crowd 20
```

SIGINT/SIGTERM sends a final clear, allows up to two seconds for the socket queue to drain, stops optional Hue, and removes only its owned temporary directory. An occupied port fails without stopping the existing bot. Restore the companion address/normal streaming service and reconnect when done.

## Production admin controls

Only configured Twitch admin logins in `TWITCH_CHANNEL` can use these controls. Moderator/broadcaster badges alone do not grant access; forwarded, duplicate or expired chat messages are refused. The `sa` namespace remains reserved.

| Command | Behavior |
| --- | --- |
| `!sa status` | Known live total, elapsed time, companion and reconciliation/recovery diagnostics |
| `!sa session recover confirm` | Restore validated production backup while recently confirmed offline |
| `!sa session reset confirm` | Archive and reset production state while recently confirmed offline |

Rehearsal, crowd, hearts and clear controls now direct developers to `npm run sa:integration`.

## Production persistence

Production progress remains in `./data/stream-avatars/production/state.json`. The Compose example mounts `stream-avatars-state` at `/usr/src/app/data/stream-avatars`; uncomment its port 3000 mapping when enabling the bridge. A direct container run needs `-p 3000:3000 -v stream-avatars-state:/usr/src/app/data/stream-avatars`. Bind mounts must be writable by the unprivileged `node` user (UID/GID 1000). Do not share a state directory between instances or use `docker compose down -v` when preserving progress.

Optional deployment overrides remain `STREAM_AVATARS_STATE_DIR` and `STREAM_AVATARS_OFFLINE_GRACE_SECONDS` (defaults `./data/stream-avatars` and 900). Normal setup needs neither. `STREAM_AVATARS_DONATION_INTERVAL_CENTS` defaults to 50000 ($500) and accepts integer cents from 1 to 100000000; changing it establishes a silent milestone baseline.

Writes are serialized, fsynced and atomically renamed, with a previous good `.backup`. Corrupt state creates a durable `.recovery-required` gate; recover or reset explicitly while offline. Reconnect/restart sends current state without replaying animations. The session retains the original Twitch start across metadata changes and ends only after continuous successful offline samples spanning the grace period. API errors and long sampling gaps interrupt offline confirmation.

Donation state is schema v2, bound to participant ID and USD. Valid v1 files migrate without replaying stored progress. If the participant changes, archive/reset explicitly while offline instead of mixing fundraising identities. Persist IDs, exact cents, hidden-amount count, milestone high-water history and the campaign baseline. Unknown amounts receive recognition but are never invented as zero; no incomplete-total caption is shown.

Eligibility uses the published donation's explicitly zoned creation timestamp and the persistent session start/end. Pre-stream gifts and post-session matching are excluded from live money. Gifts during interruptions/offline grace count without a fresh-online gate per effect. Startup/restart scans reconcile silently before accepting new celebrations. Donations remain newest first: normal short pages make one request; conditional catch-up follows further pages only when needed to cover the session window. Catch-up requests are paced, with complete scans required before accounting. Newest-page chat/marker/Hue notifications proceed promptly; longer catch-up parties follow accounting completion without a second Hue call. Campaign observations confirm only a live rising crossing, once per session; an already met or lowered goal does not trigger a party.

Each state file has an exclusive `.lock`. After a crash, confirm that no process/container owns the directory before removing a stale lock. Keep backups private and outside Git. Old rehearsal state files are no longer read and can be archived separately.

## Real LAN and OBS acceptance run

1. Import the latest v2 ZIP and restore private address/token. Launch the temporary runner on a distinct test port; select Custom Lua on the gaming computer. Windows needs no system Lua installation.
2. Run all six scenarios: ordinary $25 and anonymous $25 show five-second hearts/jump/Thank you!; a $10+$15 batch shares that animation. A silent $490 seed plus $10 shows $500.00 for 18 seconds. A $1,060 gift after the same seed shows $1,550.00 in one party, handling $500/$1,000/$1,500 together. The $900/$1,000 campaign baseline plus a $100 live gift shows the distinct 20-second goal party.
3. Repeat with `--crowd 100`. Check all 101 avatars including the moving caster, late joins/leaves, heart following and dense-scene frame rate. Verify jump/dance access for your actual avatar animations.
4. Keep existing gear and decorations visible. Resize the game window and check full-image clamping, transparent alpha, OBS crop and caption readability.
5. Disconnect/reconnect, clear with SIGINT, and press F5. Confirm owned cleanup and snapshots without transient replay. Test a missing image, repair it and reload; other layers/transport should survive.
6. Confirm no chat messages, markers or production-state writes. Default runs leave lights alone; optionally repeat with `--hue` and verify restoration. Restore the normal streaming service, address and connection afterwards.

Record observations separately from automated passes in [verification](stream-avatars-verification.md). Linux-to-gaming-computer LAN/OBS acceptance and the previously reported avatar teleporting remain to be checked. The test-only JSON codec is absent from the import ZIP and container; the single shipped development fixture contains synthetic values only.
