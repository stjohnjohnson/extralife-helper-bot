# Stream Avatars technical reference

[README](../README.md) · [Operator setup](stream-avatars-setup.md) · [Artwork workflow](stream-avatars-artwork.md)

This reference covers custom images, renderer limits, development previews, persistence, and native acceptance.
For ordinary installation, use the operator setup guide.
Historical native probes remain in the [renderer contract](stream-avatars-native-contract.md).

## Image catalog

Add PNG sprite sheets and matching JSON manifests under `integrations/stream-avatars/assets/`.
Use `heart.json` as a reference:

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

`frames` is the total frame count across equal rows.
Eight 32 × 32 frames in two rows need a 128 × 64 PNG.
Names must be unique regardless of case and use letters, numbers, underscores, or hyphens.
Windows reserved names are rejected.
Files must be regular PNGs directly inside the assets directory.
Packaging checks PNG checksums, decoding, dimensions, animation metadata, and input-size limits.
Transparency requires actual PNG alpha.

Run `npm run sa:package` after adding manifests.
Unlisted PNGs, SVG sources, and private files are excluded.
A new effect also needs Lua logic to use its image.
The heart uses `sa_heart` metadata at scale 1; retain imported image scale 1.
Run `node scripts/sa-assets.js` to regenerate the original celebration art deterministically.
Package its manifests together.
The ZIP supplies geometry, frame rate, and loop settings for every image.

## Renderer behavior

### Recognition and parties

Fresh donations create following hearts for five seconds above up to 101 active avatars, including the caster.
Recognition selects one random jump or paired hug.
A donation shows `$25 - THANK YOU!`.
Combined donations show `$25 FROM 2 DONATIONS - THANK YOU!`.
Whole dollars omit `.00`; nonzero cents remain.
Hidden amounts use `THANK YOU!`.
Nearby donations share a window capped at ten seconds from its original start, retaining the same action choice.

An interval crossing starts an 18-second confetti and dance party after recognition.
Its caption shows the actual total, such as `$2,525 RAISED!` after $2,475 plus a $50 donation.
A goal crossing uses `EXTRA LIFE GOAL REACHED!` and a 20-second party instead of a simultaneous milestone.
Multiple crossed thresholds produce one party.
New donations during a party wait in one combined recognition, followed by their highest qualifying party.
They do not interrupt the current party.
Delayed totals can leave a gap after recognition without repeating it.

A late goal from the same batch can upgrade or resume its milestone party within 38 seconds of the original start.
It retains existing dance attempts.
An upgrade outside that limit, or while a newer phase owns the display, is discarded.
Donor names are not linked to Twitch avatars.

### Capacity and cleanup

The renderer reads current canvas bounds, including resizing and negative coordinates.
Its limits are 101 hearts, 32 confetti objects, 48 caption objects, and 128 pending image loads.
Larger crowds report `density-limit`.
The supplied art uses 40-unit spacing above avatars; check other avatar sizes visually.
Images remain inside the game canvas; OBS cropping is separate.

Expiry, disconnect, generation or campaign changes, reload, and shutdown clear owned effects.
Layer failures preserve other available visuals and the heartbeat.
A failed host callback can retain an invisible pending object until F5.
Repair missing assets before reloading.
Donation effects preserve theme scenery and independent chapter decorations.
Game changes update scenery and request a crowd jump without displaying game or theme titles.
The companion does not assign or modify avatar gear.

### Native actions and cooldowns

Local jump, hug, and dance commands are quiet and fixed.
Hug pairs are shuffled among eligible Idle/Wander avatars, including the caster, with one initiator per pair.
Unmatched avatars jump.
Busy avatars retain their state and can participate if eligible during the window.
Only validated native internal IDs are command targets.
Each avatar participates once per recognition window.
Hugs finish under native control; clearing visuals does not force either partner to leave a hug.

Native permissions, cooldowns, or target changes during travel can prevent a hug.
The host command returns no success result, so silent rejection is not retried.
Dance admission and cleanup preserve other active minigames and states.
Dancing admits both Idle and ordinary Wander states.
Mapped or tween dances follow native animation settings.
The API cannot distinguish their sprite from another custom action.
Configure those animations to return to idle.
A looping mapped dance can outlast the party or clear and needs manual stopping.

Each eligible avatar receives at most one dance request per party, including milestone-to-goal upgrades.
The companion remembers dance and hug requests across clears, reconnects, and reloads, using real time independently of game speed.
During a hug cooldown, the pair jumps instead.
A dance waits for its cooldown if the party is still running.
Both cooldown guards default to ten seconds.

If you customize native per-user timers, add the corresponding private companion setting:

```json
{
  "danceCooldownSeconds": 10,
  "hugCooldownSeconds": 10
}
```

Set each value to at least its corresponding native duration.
Values must be numbers from 0 to 86400.
Allow one extra second for clock precision.
The Lua API cannot inspect native timers or observe every manual command.
A recent manual action can still make the first companion request reach the native cooldown.
The companion does not retry that rejected request within the same party or recognition window.

## Temporary development integration test

The runner replaces interactive rehearsal with an isolated instance of donation, campaign, avatar, and theme-preview subsystems.
Fixtures use production normalization, persistence, and composition.
The runner starts no Discord, Twitch, Extra Life, or stream-marker network clients.
It creates its own temporary state directory and ignores production state and credentials.
Physical Hue testing is opt-in.

1. Set `STREAM_AVATARS_TOKEN` to the companion's matching private token.
2. Point the companion address to `BOT_LAN_IP:3010`.
3. Select **Custom Lua** in Stream Avatars Login Details.
4. Set spawning to **Everyone / In Chat**.
5. Allow 101 avatars for 100 viewers plus the caster.
6. Run the temporary instance:

   ```sh
   WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20
   ```

The runner prints its listener address and waits up to 60 seconds for an authenticated ready v3 companion.
`all` plays six donation scenarios at their real durations, then the complete theme cycle.
Theme runs need a themes-capable companion and matching imported ZIP.
Donation-only runs also accept older donation-capable v3 companions.
Names `sa_integration_1`–`sa_integration_100` and IDs 900001–900100 are reserved.
Cleanup removes only companion-owned viewers.
Return to the normal streaming service afterwards to restore the caster.

| Option | Values or purpose |
| --- | --- |
| `--scenario` | `ordinary`, `anonymous`, `batch`, `milestone`, `large`, `goal`, `all`, or `themes` |
| `--crowd` | Integer from `0` to `100` |
| `--recognition` | `random`, `jump`, or `hug`; default is `random` |
| `--theme` | Focused theme, or `all` with `all`/`themes` scenarios |
| `--game` | Focused game mapping |
| `--candidate-pack <directory>` | Explicit validated artwork review candidate |
| `--theme-pack <directory>` | Explicit externally promoted artwork pack |
| `--hue` | Opt into physical light testing |

The forced recognition action is development-only.
Milestone and goal scenarios retain dancing.
With `--hue`, supply `HUE_USERNAME`, `HUE_IPADDRESS`, and `HUE_GROUPID`.
Without `--hue`, existing Hue settings do not initialize lights.
Logs describe expected visuals and dispatch; they do not assert native rendering success.

For Docker, use the published image without a production-state volume:

```sh
docker run --rm -it -p 3010:3000 \
  -e STREAM_AVATARS_TOKEN='<matching-private-token>' \
  ghcr.io/stjohnjohnson/extralife-helper-bot:latest \
  npm run sa:integration -- --scenario ordinary --crowd 20
```

The image includes mappings and artwork; `all` and `themes` need no extra pack mount.
SIGINT or SIGTERM sends a final clear and allows two seconds for the socket queue to drain.
Shutdown stops optional Hue and removes only the runner's temporary directory.
An occupied port fails without stopping the existing bot.
After testing, restore the production companion address and normal streaming service.

### Preview themes and games

The complete cycle contains block-world, kitchen, outdoor, puzzle, space-salvage, party, Raft, PEAK, Minecraft Bedrock, and neutral.
Each step lasts 6.5 seconds.
`--scenario themes` runs only this cycle.
A specific `--theme` or `--game` selects a focused theme preview.
With `all`, a specific selector applies to donations; the complete theme cycle still follows.

```sh
WEB_PORT=3010 npm run sa:integration -- --scenario themes
WEB_PORT=3010 npm run sa:integration -- --scenario ordinary --theme kitchen
WEB_PORT=3010 npm run sa:integration -- --scenario milestone --game "Keep Talking and Nobody Explodes"
```

The runner uses the checked-in bundled pack even in a fresh checkout without local artwork history.
Explicit missing or corrupt packs fail before state, listener, or Hue startup; they never select a fallback.
Development pack overrides are unnecessary for normal setup.
See the [candidate review workflow](stream-avatars-artwork.md#explicit-candidate-review-pack) for artwork iteration.

Preview state is removed on exit.
The runner sends no Twitch category updates, chat, markers, or production game observations.
Reconnect restores current state without an entrance.
Each changed game identity gets one six-second entrance; repeated identities retain scenery.
Scenery exports contain no gear entries, avatar definitions, permissions, or frame-pivot changes.

## Real LAN and OBS acceptance run

### Expected donation displays

| Scenario | Expected recognition and party |
| --- | --- |
| Ordinary or anonymous | `$25 - THANK YOU!` |
| Batch | `$25 FROM 2 DONATIONS - THANK YOU!` for $10 plus $15 |
| Milestone | $10 recognition, then `$2,500 RAISED!` for 18 seconds |
| Large | $1,060 recognition, then one `$3,550 RAISED!` party |
| Goal | $10 recognition, then `EXTRA LIFE GOAL REACHED!` for 20 seconds; goal overrides its simultaneous milestone |

Matching-equivalent donations use the same input path.
Whole dollars omit `.00`.

### Procedure

1. Import the current ZIP.
2. Restore the private companion address and token.
3. Set the companion address to `BOT_LAN_IP:3010`.
4. Select Custom Lua on the Stream Avatars computer.
5. After each run exits, start the next forced recognition variant:

   ```sh
   WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20 --recognition hug
   WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20 --recognition jump
   ```

6. Repeat with crowds of 0, 1, and 100.
7. Check the displays against the table above.
8. Check moving-caster heart following, hug pairs, and unmatched-avatar jumps.
9. Check late joins, departures, and native partner release.
10. Resize the window.
11. Check clamping, transparent alpha, image ordering, tile joins, readable captions, and OBS cropping.
12. Check that unrelated avatar gear and decorations remain visible.
13. Check dense-scene frame rate against a baseline.
14. Disconnect and reconnect the companion.
15. Reload with F5.
16. Check for repeated cooldown warnings across nearby parties and reloads.
17. Stop the runner with SIGINT.
18. Confirm owned cleanup without effect replay.
19. If `--hue` was enabled, confirm light restoration.
20. Restore the production companion address.
21. Restore the normal streaming service.

Each late eligible avatar participates once per phase.
Recent manual commands remain outside native timer visibility.
Busy avatar states must be preserved.
Tests must produce no real chat, markers, or production-state writes.
Normal donation polls run every 30 seconds.
Automated clock tests exercise API delays and overlapping batches that normal poll spacing can hide.
Record LAN/OBS, platform, capacity, and optional Hue results separately from dispatch logs.
See the [six-theme acceptance matrix](stream-avatars-theme-verification.md#acceptance-evidence).

## Persistent game state and v3 compatibility

`src/gameSession` owns category freshness, offline grace, current game, and legacy migration independently of campaign progress.
Successful Twitch category writes are ordered at confirmation; viewer polls are ordered at request start.
A game read older than the latest accepted stream status is ignored.
Restart and first Twitch reconciliation restore snapshots only.
Campaign resets leave game state intact.
Production game updates require confirmed online Twitch data no older than two viewer sampling intervals.
The first Twitch reconciliation restores scenery without an entrance.
Fifteen minutes of continuously confirmed offline observations clear the game.
Unknown status or a sampling gap breaks that continuous offline period.
Campaign accounting and donation effects continue independently of stream status.

Game state uses `<STREAM_AVATARS_STATE_DIR>/production/state.json`.
Campaign progress uses `production/campaign.json`.
Game corruption has an independent recovery gate and appears as `game recovery required` in `!sa status`.
Game recovery and reset need confirmed offline Twitch data no older than two viewer polling intervals.
They preserve campaign bytes, checkpoints, and active donation effects, and restore no entrance.
See [operator recovery commands](stream-avatars-setup.md#state-and-recovery).

The server sends the original exact v3 snapshot until the companion advertises `themes`.
It then supplies the current theme and capability-gated entrances.
Donation-only v3 companions remain compatible.
Donation recognition and party actions take priority over entrance jumps in the same frame.
Donation captions and scenery have independent ownership.
The portable metadata names `previewOnly` and `rehearsalOnly` remain unchanged to preserve catalog hashes.
Runtime preview admission uses integration mode.

## Campaign accounting details

Extra Life participant totals supply authoritative `sumDonations` and `fundraisingGoal` values.
The bot does not derive campaign totals by summing acknowledged donations.
Donation IDs and handled thresholds persist.
Startup, restart, and reset independently establish donation and total baselines.
New donations can receive recognition before the first total becomes available.

A crossing requires a fresh accepted donation within 120 seconds.
Old amount revelations and historical corrections advance accounting silently.
Decreases do not reenable handled thresholds.
Goal edits establish a silent baseline and do not reenable a handled goal.

Eligibility uses explicitly zoned donation timestamps and the monitoring checkpoint.
It does not depend on Twitch being online or a broadcast window.
Ordinary discovery reads one newest-first page.
Bounded catch-up reads more pages when count growth or missing metadata requires them.
Notifications and recognition proceed before the separately paced total refresh.
Accepted donation IDs persist for retries; count checkpoints advance only after a completed scan.
Matching donation records follow the ordinary path.

When the last ready companion disconnects, the service discards active effects, pending batches, phase timers, and delayed correlations.
Accounting continues; reconnect shows current totals without replay.
Writes are serialized, synchronized to storage, and atomically renamed.
Corrupt state retains a durable `.recovery-required` gate.
The independent game subsystem migrates legacy `production/state.json` and backups in place.
Legacy money fields remain inert migration data.
Old rehearsal files are no longer read and can be archived separately.
