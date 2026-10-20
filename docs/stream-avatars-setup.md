# Stream Avatars setup

[README](../README.md) · [Configuration](configuration.md) · [Technical reference](stream-avatars-reference.md)

Stream Avatars connects to the bot through a private WebSocket connection.
It shows donation effects, campaign milestones, goal celebrations, and game-themed scenery.
The bot runs on Linux, macOS, or Windows.
The voice overlay and this bridge share the `WEB_HOST` and `WEB_PORT` listener.
Either web integration can be enabled independently; the [core bot settings](configuration.md#required-core-settings) remain required.

## Configure the bot

1. Complete the [core bot setup](setup.md).
2. Generate a private random token:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. Save these settings in `.env`, replacing the token placeholder:

   ```dotenv
   STREAM_AVATARS_ENABLED=true
   STREAM_AVATARS_TOKEN=<private-random-token>
   STREAM_AVATARS_DONATION_INTERVAL_CENTS=50000
   STREAM_AVATARS_STATE_DIR=./data/stream-avatars
   WEB_HOST=0.0.0.0
   WEB_PORT=3000
   ```

4. Permit the Stream Avatars computer to reach the bot's listener on your LAN.
5. Start the bot.

The token must contain 16–256 characters.
Copy it privately to the companion; never put it in chat or a URL.
Authentication uses the first WebSocket frame.
For an untrusted network, use a TLS reverse proxy and a `wss://` connection.
Invalid bridge settings disable Stream Avatars while core services continue.
Disconnected companions do not queue animations for replay.

## Generate and import the companion

Use a local repository checkout with Node.js 24.x, version 24.15.0 or newer, and dependencies installed through `npm ci`.

1. Run `npm run sa:package`.
2. Back up the destination's Stream Avatars settings.
3. For updates, privately save the existing `sa_helper_bridge_settings.json`.
4. In Stream Avatars, open **Import & Export → Select Import**.
5. Select `dist/stream-avatars/sa-helper-bridge.zip`.
6. Open the **sa_helper_bridge** script folder through **Create Script**.
7. Edit `sa_helper_bridge_settings.json` with the bot address and matching private token:

   ```json
   {
     "address": "192.168.1.42",
     "token": "YOUR_PRIVATE_TOKEN"
   }
   ```

8. Connect Stream Avatars.

Packaging uses Node.js alone and works on macOS, Windows, and Linux.
For another output location, run `npm run sa:package -- --output "path with spaces/bridge.zip"`.
The package contains placeholder credentials and never reads private `.env` or installed application settings.

**Reimporting replaces the command, script folder, images, and companion settings.**
Restore your private address and token after reimporting.
General application settings, Twitch login, avatar capacity, and OBS scenes are separate.

Use the current v3 companion with `campaign`, `celebrations`, and `donation-recognition` capabilities.
Older packages without these capabilities are rejected.
The default ZIP contains 54 images: 22 campaign images, two connection indicators, six backdrop tiles, and 24 scenery props.
Game mappings and scenery ship with the bot; no theme environment settings are required.
The companion does not change avatar gear or display game-title text.

### Connection addresses

| Value | Connection |
| --- | --- |
| `192.168.1.42` | Port 3000, path `/sa/socket` |
| `127.0.0.1` | Same-computer connection |
| `192.168.1.42:4444` | Custom listener port |
| `[::1]` | IPv6 loopback |
| `wss://bridge.example/sa/socket` | TLS reverse proxy |

The legacy `url` companion setting remains accepted.
The bot's legacy voice-overlay listener settings remain fallbacks when corresponding `WEB_*` settings are absent.

## Host connection indicator

An animated Extra Life logo above the host avatar confirms an authenticated bot connection with fresh snapshots or heartbeats. The original eight-frame animation loops at five frames per second. A gold question mark replaces it while connecting, disconnected, or after 30 seconds without a validated snapshot or heartbeat. Missing or invalid private settings also show the question mark; the companion attempts no connection. Correct the settings and reload the companion. Heartbeats before an authenticated snapshot cannot activate the logo. Connection freshness uses wall time, even when game time is paused.

Both indicators follow Stream Avatars' own streamer avatar. Each 64 × 64 source frame displays at half size, using a 32 × 32 frame at the host's donation-heart position. The indicator replaces the host's heart while displayed. Other viewers retain their donation hearts, and the host retains donation actions. If the indicator cannot display, normal donation hearts remain available. The indicators hide when the host is absent or inactive, or the canvas cannot fit the displayed frame. They do not attach to another viewer. If an indicator image cannot load, the companion logs an unavailable-indicator message and continues other effects. Reimport the latest ZIP and reload the companion to restore missing images.

This indicator confirms bridge connectivity, not every rendered effect or external bot service. A stopped companion cannot update its own indicator. No additional settings are required. After an upgrade, reimport the generated ZIP and restore the private connection address and token.

### Celebration sounds

The package bundles seven original family recordings: four donation clips, two milestone clips and one goal clip. Each plays once at its natural length. Donations cycle Quinn 1 → Zac 1 → Quinn 2 → Zac 2. Milestones alternate Quinn → Zac. Goals use Zac's goal recording. Native shared state remembers the next option across F5 reloads, disconnects and reconnects. A full application restart can reset that state.

Run `npm run sa:package` to write the ZIP and `dist/stream-avatars/sounds/`. A custom output ZIP has an adjacent `sounds/` folder. Import all seven Oggs through **Sounds → Import Sound** with these exact names:

```text
sa_donation
sa_donation_2
sa_donation_3
sa_donation_4
sa_milestone
sa_milestone_2
sa_goal
```

Leave chat/soundboard triggering disabled. Adjust each sound's volume in the native settings. The content ZIP importer carries these files in the companion script's `sounds/` subfolder, but cannot register the native sound-library entries. You can import from that extracted folder when transferring only the ZIP.

Optional private settings accept a single imported name, `false` to disable a kind, or an ordered list of 1–16 distinct names. Defaults are:

```json
"sounds": {
  "donation": ["sa_donation", "sa_donation_2", "sa_donation_3", "sa_donation_4"],
  "milestone": ["sa_milestone", "sa_milestone_2"],
  "goal": "sa_goal"
}
```

For custom sounds, replace a list with names such as `["Quinn Thanks", "Zac Thanks"]`. Names must already be imported, start with a letter or number, and contain only letters, numbers, spaces, underscores or hyphens. Each name is limited to 64 characters. Lists must be dense and have no duplicates ignoring case. Invalid settings disable only the affected kind and produce a warning. Omitted keys use defaults. A changed list restarts at its first option; disabling a kind does not consume its next turn.

Audio starts with a validated active recognition or party phase. Repeated packets, caption/amount updates, recognition extensions, snapshots, startup and reconnect do not play or advance the rotation. An expired or rejected packet does not consume a turn. Each kind rotates independently. An unavailable clip consumes its turn, allowing the next event to try the next option. Playback identities are remembered for two minutes, up to 256 identities, across clears and reloads.

A goal wins its simultaneous milestone. A valid later milestone-to-goal upgrade plays the goal cue once and stops the companion's prior audio. A new phase replaces only its owned sound. Expiry, clear, disconnect, reload and identity changes stop only companion-owned audio. Missing sounds or host errors leave visuals and connectivity running. The console reports audio unavailability once per run.

The catalog is allowlisted, checksummed and bounded. Node-only packaging validates Ogg/Vorbis framing, page checksums and SHA-256 digests. Source WAVs and preparation metadata are excluded from the ZIP. See [recording provenance and preparation](../integrations/stream-avatars/sounds/README.md).

## Donation and scenery behavior

| Event | Display |
| --- | --- |
| Fresh donation, including matching | Five seconds of hearts, amount/thank-you caption, and a random jump or paired hug |
| Nearby donations | Combined recognition lasting at most ten seconds from its original start |
| Campaign interval crossed | Recognition first, then an 18-second confetti and dance party |
| Campaign goal reached | Recognition first, then a distinct 20-second goal party |
| Later live game identity change | Mapped scenery and one welcoming jump; no game-title text |

The default milestone interval is $500 of cumulative campaign progress.
Change it with `STREAM_AVATARS_DONATION_INTERVAL_CENTS`; values are cents, not dollars.
Crossing multiple intervals produces one party.
A simultaneous goal crossing takes priority over its milestone.
New donations during a party wait for the next combined recognition.

Campaign totals come from Extra Life, independently of Twitch stream status.
Hidden donation amounts use a generic thank-you caption.
The bot does not associate donor names with Twitch avatars.
Startup, restart, and reset silently establish current baselines.
Reconnect restores current state without replaying missed effects or entrances.
Donation parties do not add an extra Hue celebration.

Production scenery follows the confirmed Twitch category.
Successful Discord category updates change scenery even when Twitch is offline.
Scenery updates do not require a live broadcast or a fresh viewer sample.
The first Twitch reconciliation restores scenery silently.
Scenery persists through offline periods and restarts until another category update or an explicit game reset.
Donation recognition and campaign milestones remain independent of Twitch status.

Detailed timing, native action limitations, and cleanup behavior are in the [renderer reference](stream-avatars-reference.md#renderer-behavior).

## State and recovery

The default state directory is `./data/stream-avatars`.
Campaign progress uses `production/campaign.json`; independent game state uses `production/state.json`.
Each file has an exclusive lock and a previous valid `.backup`.
Keep external backups private and outside Git.
Do not share a state directory between running instances.

For Docker, publish the listener and mount persistent state:

```sh
docker run --rm -it --env-file .env -p 3000:3000 \
  -v donation-state:/usr/src/app/data/donations \
  -v stream-avatars-state:/usr/src/app/data/stream-avatars \
  ghcr.io/stjohnjohnson/extralife-helper-bot:latest
```

The Compose example already mounts this volume; uncomment its port mapping when enabling a web integration.
Bind mounts must be writable by the container's `node` user, UID/GID 1000.
Do not run `docker compose down -v` when you need to preserve progress.

Corrupt state creates a durable recovery gate.
Normal donation notifications continue if campaign accounting is unavailable.
Donation announcements use a separate [replay checkpoint](configuration.md#donation-replay).
Restarted announcements do not replay historical Stream Avatars effects.
Use [Twitch admin commands](commands.md#command-reference) for explicit recovery or reset:

| Command group | Requirement and effect |
| --- | --- |
| `!sa campaign recover confirm` | Restore the validated backup; silently establish current donation and total baselines |
| `!sa campaign reset confirm` | Archive and reset campaign progress; silently establish new baselines |
| `!sa game recover confirm` | Restore the game backup after a fresh confirmed offline Twitch observation |
| `!sa game reset confirm` | Archive and reset game state after a fresh confirmed offline Twitch observation |

Campaign commands have no offline requirement.
Game commands require an offline observation no older than two viewer sampling intervals.
Game commands preserve campaign progress and active donation effects.
Campaign commands do not reset game state.
Moderator or broadcaster badges alone do not grant access; configure `TWITCH_ADMIN_USERS`.

Changing participants archives old campaign progress and establishes independent baselines.
Changing the interval or goal does not replay historical effects.
Decreased totals do not reenable handled thresholds.
Legacy game state migrates in place; never rename `state.json` to `campaign.json`.
Back up state before upgrading if you need rollback.
Upgrade the bot and companion together.

After a crash, confirm that no process owns the state directory before removing a stale lock.
See [persistence details](stream-avatars-reference.md#campaign-accounting-details) for donation checkpoints and recovery behavior.

## Verify the installation

1. Import the latest companion ZIP.
2. Restore its private connection settings.
3. Run `!sa status` as a configured Twitch administrator.
4. Check that the companion reports connected and no recovery requirement.
5. Follow the [temporary integration procedure](stream-avatars-reference.md#temporary-development-integration-test) for synthetic donations and scenery previews.
6. Check the result in Stream Avatars and OBS on the destination computer.

Automated tests and dispatch logs do not establish native visual acceptance.
Check small and dense crowds, image ordering, transparent tile joins, resize behavior, native cooldowns, and OBS cropping.
The temporary runner uses separate state and no Discord, Twitch, Extra Life, or marker network clients.
Physical Hue testing requires the explicit `--hue` option.
Restore the production companion address and normal streaming service after testing.

See [current scenery acceptance](stream-avatars-theme-verification.md) and [historical verification evidence](stream-avatars-verification.md).
For custom sprites or artwork, use the [technical reference](stream-avatars-reference.md#image-catalog) and [artwork workflow](stream-avatars-artwork.md).
