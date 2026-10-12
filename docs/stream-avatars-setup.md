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

Reimport the latest v3 companion for campaign totals and sequential recognition. Readiness requires `campaign`, `celebrations` and `donation-recognition`; older packages are rejected with an import-latest-v3 diagnostic. This creates `dist/stream-avatars/sa-helper-bridge.zip`, containing the On Connect Lua command, repository image catalog and saved animation settings. It sets frame sizes, FPS and infinite looping automatically. Packaging requires Node.js alone and works on Mac, Windows and Linux. Generated files are ignored by Git. To choose another location, use `npm run sa:package -- --output "path with spaces/bridge.zip"`.

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

Every fresh donation, including matching, creates five-second following hearts above up to 101 active avatars, including the caster, with one randomly chosen jump or paired hug. A single gift shows `$25 - THANK YOU!`; nearby gifts combine as `$25 FROM 2 DONATIONS - THANK YOU!`. Whole dollars omit `.00`; nonzero cents remain. A hidden amount uses generic `THANK YOU!`. Nearby gifts share a window capped at ten seconds from its original start, retaining the same action choice.

After that thank-you finishes, crossing a cumulative campaign interval starts one 18-second gold confetti/dance party. It shows the actual total, such as `$2,525 RAISED!` after $2,475 plus a $50 gift. A campaign-goal crossing gets `EXTRA LIFE GOAL REACHED!` and a 20-second party instead of its simultaneous milestone. Multiple crossed thresholds produce one party. New gifts during a party wait in one combined next thank-you, followed by their highest qualifying party; they never interrupt the current party. A delayed total can leave a gap after thanks, and never repeats thanks. A same-batch late goal can upgrade or resume its milestone party only within 38 seconds of the original start, retaining its dance attempts. An upgrade after that bound or while a newer phase owns the display is discarded. No donor name is linked to a Twitch avatar.

The renderer reads current canvas bounds, including resizing and negative coordinates. Its budgets are 101 hearts, 32 confetti objects, 48 caption objects and 128 pending image loads. Larger crowds report `density-limit`. The supplied art uses 40-unit avatar-top spacing; check other avatar sizes visually. Images stay inside the game canvas; OBS cropping is separate.

Expiry, disconnect, generation/campaign change, reload and shutdown clear owned effects. Layer failures leave other available visuals and the heartbeat running. A failed host callback can retain an invisible pending object until F5; repair missing assets and reload. Local jump, hug and dance commands are quiet and fixed. Hug pairs are shuffled among eligible Idle/Wander avatars, including the caster, with one initiator per pair. Unmatched avatars jump; busy avatars are preserved and may participate if they become eligible during the window. Only validated native internal IDs are command targets. Each avatar participates once per recognition window. Hugs finish under native control; clearing visuals never forcibly exits either partner. Native access settings/cooldowns or a target leaving/changing state during travel can prevent a hug. The host command returns no success result, so silent native rejection is not retried. Native animation access/cooldowns can affect actions; another active minigame/state is preserved during dance admission and cleanup. Dancing admits both Idle and ordinary Wander states. Mapped/tween dances follow native animation settings because the API cannot distinguish their sprite from another custom action; configure them to return to idle. A looping mapped dance can outlast the party or clear and needs manual stopping. Gear and chapter decorations are never modified.

Each eligible avatar receives at most one dance request per party, including milestone-to-goal upgrades. The companion remembers its dance/hug requests across clears, reconnects and reloads, using real time independently of game speed. During a hug cooldown, the pair jumps instead; a dance waits until its cooldown expires if the party is still running. Both cooldown guards default to ten seconds. If you customize Stream Avatars' per-user timers, add `"danceCooldownSeconds": 10` and/or `"hugCooldownSeconds": 10` to the companion's private JSON, replacing ten with at least the corresponding native duration. Values must be numbers from 0 to 86400. Allow up to one extra second for clock precision. The Lua API cannot inspect native timers or observe every manual command, so a viewer's recent manual dance/hug can still make the first companion request hit the native cooldown. The companion never retries that rejected request within the same party/window.

## Temporary development integration test

This replaces interactive rehearsal. Run a temporary instance of only the donation/campaign/avatar subsystem; fixtures pass through the same source normalization, persistence and composer used in production. It starts no Discord, Twitch, Extra Life network or stream-marker clients, and creates its own removable OS temp directory. `STREAM_AVATARS_STATE_DIR` and production credentials are not used. Physical Hue is opt-in.

On the Linux bot computer (or locally), set the token and listener only. Use another port while production remains running:

```sh
STREAM_AVATARS_TOKEN='<matching-private-token>' WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20
```

The bridge listens on `WEB_HOST` (default `0.0.0.0`) and prints its address. Set the companion's private address to `BOT_LAN_IP:3010` and matching token. Select **Custom Lua** in Stream Avatars' Login Details, spawning **Everyone / In Chat**, and allow **101 avatars** for 100 viewers plus the caster. The runner waits up to 60 seconds for an authenticated ready v3 companion, then plays six independent scenarios at their real durations. Names `sa_integration_1`–`sa_integration_100` and IDs 900001–900100 are reserved; cleanup removes only companion-owned viewers. The Custom Lua caster is restored by returning to your normal streaming service afterwards.

Use `--scenario ordinary|anonymous|batch|milestone|large|goal|all`, `--crowd 0..100`, and `--recognition random|jump|hug` (default `random`). The forced action is developer-only; it adds no production setting. For example, `WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20 --recognition hug` forces hugs outside parties. Use `--crowd 0` to check caster-only jump fallback and `--crowd 100` for the 101-avatar budget. Milestone and goal scenarios always retain dancing. For physical lights, add `--hue` and supply only `HUE_USERNAME`, `HUE_IPADDRESS`, and `HUE_GROUPID`; the existing Hue donation effect and restoration path run. Without that flag, Hue settings in `.env` never initialize lights. Logs describe expected visuals and successful dispatch, rather than asserting that rendering passed.

For a container, use the feature image with no production-state volume:

```sh
docker run --rm -it -p 3010:3000 -e STREAM_AVATARS_TOKEN='<matching-private-token>' IMAGE_WITH_THIS_CHANGE npm run sa:integration -- --crowd 20
```

SIGINT/SIGTERM sends a final clear, allows up to two seconds for the socket queue to drain, stops optional Hue, and removes only its owned temporary directory. An occupied port fails without stopping the existing bot. Restore the companion address/normal streaming service and reconnect when done.

## Production admin controls

Only configured Twitch admin logins in `TWITCH_CHANNEL` can use these controls. Moderator/broadcaster badges alone do not grant access; forwarded, duplicate or expired chat messages are refused. The `sa` namespace remains reserved.

| Command | Behavior |
| --- | --- |
| `!sa status` | Campaign total/goal, next milestone, companion connectivity and state health |
| `!sa campaign recover confirm` | Restore the validated production backup and silently rebaseline current donations/totals |
| `!sa campaign reset confirm` | Archive/reset campaign progress and silently establish new baselines |

Recovery/reset needs explicit confirmation and admin authorization, with no Twitch offline requirement.

Rehearsal, crowd, hearts and clear controls now direct developers to `npm run sa:integration`.

## Production persistence

Production campaign progress is in `./data/stream-avatars/production/campaign.json`. The Compose example mounts `stream-avatars-state` at `/usr/src/app/data/stream-avatars`; uncomment its port 3000 mapping when enabling the bridge. A direct container run needs `-p 3000:3000 -v stream-avatars-state:/usr/src/app/data/stream-avatars`. Bind mounts must be writable by the unprivileged `node` user (UID/GID 1000). Do not share a state directory between instances or use `docker compose down -v` when preserving progress.

`STREAM_AVATARS_STATE_DIR` defaults to `./data/stream-avatars`. `STREAM_AVATARS_DONATION_INTERVAL_CENTS` defaults to 50000 ($500) and accepts integer cents from 1 to 100000000; changing it establishes a silent milestone baseline. The retired offline-grace variable is ignored.

Writes are serialized, fsynced and atomically renamed, with a previous good `.backup`. Corrupt state creates a durable `.recovery-required` gate: use confirmed recovery/reset explicitly. Ordinary bot notifications continue if campaign accounting is unavailable. The new schema is participant-bound; changing participant archives old progress and starts independent baselines. Existing `state.json` files and their backups are untouched, so the previous bot/companion pair can be restored for rollback. Never rename legacy state to `campaign.json` or treat its stream money as campaign totals. Upgrade bot and v3 companion together; no private settings are included in the package.

Fresh participant API `sumDonations` and `fundraisingGoal` supply authoritative totals, never a sum of acknowledged gifts. Donation IDs and handled thresholds persist. Startup/restart/reset independently baseline current donations and the first successful total without historical animation. Until a total is available, new gifts can still receive thanks. Crossing confirmation requires a fresh accepted gift within 120 seconds; old amount revelations and unexplained historical corrections advance accounting silently. Decreases never rearm handled thresholds; goal edits silently rebase and never rearm a handled goal.

Eligibility uses explicitly zoned donation timestamps and the monitoring checkpoint, with no Twitch online/offline or broadcast-window requirement. Donations remain newest first: ordinary discovery uses one page; bounded catch-up follows additional pages only when count growth or missing metadata requires it. Normal notifications and recognition proceed before the separately paced total refresh. Partial accepted gift IDs are persisted for retry, while census/count checkpoints advance only on a completed scan. Matching donation records follow exactly the ordinary path.

When the last ready companion disconnects, active effects, pending batches, phase timers and delayed correlations are discarded. Accounting continues; reconnect shows current totals without replay. No extra Hue call is made for the party. Viewer monitoring, markers and their own live-stream requirements remain independent.

Each state file has an exclusive `.lock`. After a crash, confirm that no process/container owns the directory before removing a stale lock. Keep backups private and outside Git. Old rehearsal state files are no longer read and can be archived separately.

## Real LAN and OBS acceptance run

1. Import the latest v3 ZIP and restore private address/token. Launch the temporary runner on port 3010; select Custom Lua on the gaming computer.
2. Run the commands below. Ordinary/anonymous gifts show `$25 - THANK YOU!`; a $10+$15 batch shows `$25 FROM 2 DONATIONS - THANK YOU!`. Milestone: a $10 thank-you first, then `$2,500 RAISED!` for 18 seconds. Large: a $1,060 thank-you, then one `$3,550 RAISED!` party. Goal: a $10 thank-you, then `EXTRA LIFE GOAL REACHED!` for 20 seconds, winning its simultaneous milestone. Whole dollars have no `.00`. Matching-equivalent gifts use this same input path.
3. Repeat solo and with 100 viewers. Check the moving caster, heart following, hug pairs/odd-avatar jumps, late joins/leaves, native partner release and dense frame rate. A late eligible avatar participates once per phase.
4. Keep gear and decorations visible. Resize the window and check full-image clamping, transparent alpha, OBS crop and readable captions.
5. Check no repeated cooldown clocks or `dance is on UserCD` warnings for companion requests across nearby parties, reconnects and F5. Mirror customized native Dance/Hug timers in private companion settings. Recent manual commands remain outside the API's timer visibility. Busy states must be preserved.
6. Disconnect/reconnect and stop with SIGINT. Confirm owned cleanup and no transient replay. Default tests leave lights alone; optional `--hue` must restore them. Confirm no real chat, markers or production-state writes. Restore production address/token and normal streaming service afterwards.

With your private token already set and companion address pointing to `BOT_LAN_IP:3010`:

```sh
WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20 --recognition hug
WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20 --recognition jump
WEB_PORT=3010 npm run sa:integration -- --scenario ordinary --crowd 0 --recognition hug
WEB_PORT=3010 npm run sa:integration -- --scenario ordinary --crowd 100 --recognition hug
```

The ordinary poll cadence is 30 seconds. Automated clock-injected tests exercise API lag and overlapping batches even when normal deployment polls keep parties apart. Dispatch logs do not establish native visual acceptance; record LAN/OBS, platform, capacity and optional Hue results separately.
