# ExtraLife Helper Bot

A unified helper bot for managing your ExtraLife 24 hour marathon stream, bridging between Discord and Twitch.

## Features

- Post donation notifications to Discord channels and Twitch chat
- Flash your Hue lights in ExtraLife colors when donations are received
- Optional Twitch and Discord chat control of Hue colors and temporary parties
- Update Discord channel names with fundraising progress
- Cross-platform commands that work on both Discord and Twitch (`!goal`, `!promote`)
- Custom command responses that work across both platforms
- Voice channel management for stream participants
- Automatic Twitch game category updates based on Discord presence changes

## Configuration

The bot requires at least one service (Discord or Twitch) to be configured. Set the following environment variables:

### Required (for both services)
- `EXTRALIFE_PARTICIPANT_ID`: Your ExtraLife/DonorDrive participant ID

### Discord Service (required)
- `DISCORD_TOKEN`: Your Discord bot token
- `DISCORD_DONATION_CHANNEL`: Discord channel ID for posting donations
- `DISCORD_SUMMARY_CHANNEL`: Discord channel ID for updating the name with progress

### Discord Voice Channel Management (required - for !promote command)
- `DISCORD_WAITING_ROOM_CHANNEL`: Voice channel ID for users waiting to join stream
- `DISCORD_LIVE_ROOM_CHANNEL`: Voice channel ID for live streaming participants

### Admin Users (required - for restricted commands)
- `DISCORD_ADMIN_USERS`: Comma-separated list of Discord user IDs who can use admin commands
- `TWITCH_ADMIN_USERS`: Comma-separated list of Twitch usernames who can use admin commands

### Twitch Service (required)
- `TWITCH_USERNAME`: Your bot's Twitch username
- `TWITCH_CHAT_OAUTH`: Bot OAuth token from [https://twitchapps.com/tmi/](https://twitchapps.com/tmi/)
- `TWITCH_CHANNEL`: The Twitch channel name to join
- `TWITCH_CLIENT_ID`: Your Twitch application client ID

### Game Update Notifications (required)
- `DISCORD_GAME_UPDATE_USER_ID`: Discord user ID to monitor for game changes
- `DISCORD_GAME_UPDATE_MESSAGE`: Custom message template (optional, default: "Now playing {game}!")
- `TWITCH_CLIENT_SECRET`: Your Twitch application client secret (for automatic token refresh)
- `TWITCH_REFRESH_TOKEN`: Refresh token for automatic access token management

### Custom Command Responses (optional)
- `CUSTOM_RESPONSES`: Define custom bot commands and their responses
  - Format: `command1:"response1",command2:"response2"`
  - Example: `donate:"Check out https://donate.example.com",discord:"Join our Discord: https://discord.gg/example"`
  - Commands must start with a letter and contain only lowercase letters and numbers
  - Cannot conflict with built-in commands (`goal`, `promote`, `color`)
  - Commands are case-insensitive when used (e.g., `!DONATE` and `!donate` work the same)

### Philips Hue Light Celebration (required)
- `HUE_USERNAME`: Your Hue bridge username/API key
- `HUE_IPADDRESS`: IP address of your Hue bridge (e.g., `192.168.1.100`)
- `HUE_GROUPID`: The Hue group ID containing lights for donation celebrations
- `HUE_CHAT_CONTROL_ENABLED`: Optional `true` or `false` flag (default: `false`). Set to `true` to let all Twitch and Discord users control this same group with `!color`. Donation celebrations work independently of this flag.

**Setting up Hue Integration:**
1. Find your Hue bridge IP address (check your router admin panel or use the [Hue app](https://apps.apple.com/us/app/philips-hue/id1055281310))
2. Create a new user on your bridge:
   - Press the physical button on your Hue bridge
   - Within 30 seconds, send a POST request to `http://[bridge-ip]/api` with body: `{"devicetype":"ExtraLife Helper Bot"}`
   - The response will contain your `username` (API key)
3. Find your group ID by making a GET request to `http://[bridge-ip]/api/[username]/groups`
4. Configure the environment variables for this bot appropriately

## Running

### Docker (Recommended)

```bash
# Create a .env file with your configuration
cp env.example .env
# Edit .env with your settings

# Run the bot
docker run --rm -it --env-file .env ghcr.io/stjohnjohnson/extralife-helper-bot:latest
```

### Local Development

Node.js 24.x (24.15.0 or newer) is required. If you use `nvm`, run `nvm install`
and `nvm use` to select the version declared in `.nvmrc`.

```bash
# Install the locked dependencies
npm ci

# Create .env file with your configuration
cp env.example .env

# Run the bot
npm start

# Run tests
npm test

# Lint code
npm run lint
```

Dependabot checks npm dependencies and GitHub Actions weekly. All version
updates, including major upgrades, are grouped into one PR per ecosystem.
Security updates use separate groups per ecosystem and are not delayed by the
weekly version-update schedule. Review grouped upgrades and run CI before merging.

## Analyze Event Logs

The repository includes an offline analyzer for helper-bot logs. It selects the longest live event, stitches brief Twitch reconnects, and generates a self-contained HTML planning report plus inspectable JSON data.

```bash
npm run analyze -- /path/to/extralife.log
```

Reports are written to `reports/<log-name>.html` and `reports/<log-name>.json` by default. The generated files are ignored by Git.

Available options:

- `--output-dir <path>` changes the report destination.
- `--timezone <iana-name>` controls displayed local times; the default is `America/Los_Angeles`.
- `--bot-user <name>` adds another bot to the default `stjohnbot` and `streamelements` exclusions. Repeat the option for multiple bots.
- `--start <iso-time> --end <iso-time>` supplies a manual event window when the log has no usable Twitch viewer samples.

Example:

```bash
npm run analyze -- extralife.log \
  --bot-user anotherhelperbot \
  --timezone America/Los_Angeles
```

The report covers game durations and transitions, viewer levels and retention, chat participation and human-versus-bot emote use, donation timing and amounts, and data-quality warnings. Games with less than 30 minutes of coverage are shown but excluded from rankings. Comparisons are descriptive correlations, not evidence that a game caused a viewer or donation change.

Legacy mixed-text logs have three important limitations: Twitch chat dates are inferred from surrounding timestamped records, donation records are counted as live only when the associated chat notification and status update confirm them, and emotes are recognized from a checked-in exact-name catalog because Twitch tags were not retained. Ambiguous records remain visible in diagnostics but are excluded from totals requiring certainty. New bot logs add structured metadata, donation IDs, full chat timestamps, and authoritative Twitch emote tags automatically.

> **Privacy:** Reports can contain donor names, chatter names, donation messages, and chat text. They are intended for private local use; review them before sharing.

## Setup Instructions

### Discord Bot Setup
1. Create a new Discord application at https://discord.com/developers/applications
2. Create a bot user and copy the token
3. **Enable required intents** in the Bot settings:
   - `Server Members Intent` - required for game update monitoring
   - `Presence Intent` - required for game update monitoring
   - `Message Content Intent` - required for command processing
4. Invite the bot to your server with these permissions:
   - `Send Messages` - for donation notifications and command responses
   - `Manage Channels` - for updating summary channel name
   - `Move Members` - for the `!promote` command (if using voice channel management)
   - `View Channels` - for accessing configured channels
5. Get the channel IDs by enabling Developer Mode in Discord and right-clicking channels
6. **For voice management**: Set up waiting room and live room voice channel IDs in your environment

### Twitch Bot Setup
1. **Create a Twitch application** at https://dev.twitch.tv/console/apps
2. **Copy your Client ID and Client Secret** from the application
3. **Generate Chat OAuth token**:
   - Use your bot account (can be separate from streamer)
   - Get token from https://twitchapps.com/tmi/
   - Set as `TWITCH_CHAT_OAUTH`

4. **Set basic configuration**:
   - `TWITCH_USERNAME`: Your bot's username (for chat)
   - `TWITCH_CHANNEL`: Your streamer channel name (without # prefix)
   - `TWITCH_CLIENT_ID`: Your application's client ID

### Game Update Setup
1. **Both Discord and Twitch services** must be configured as shown above
2. **Get refresh token for automatic token management**:
   - **Must use streamer/broadcaster account** (not bot account)
   - Use [Twitch Token Generator](https://twitchtokengenerator.com/) with your Client ID
   - Select `channel:manage:broadcast` scope
   - Copy the **refresh token** (not the access token)
   - Set as `TWITCH_REFRESH_TOKEN`
3. **Set client secret**: Add `TWITCH_CLIENT_SECRET` from your Twitch application
4. **Get the Discord user ID to monitor**:
   - Enable Developer Mode in Discord settings
   - Right-click the user's profile and select "Copy User ID"
   - Set this as `DISCORD_GAME_UPDATE_USER_ID`
5. **Note**: The Discord bot needs the "Server Members Intent" and "Presence Intent" enabled for presence monitoring
6. **Customize the notification** (optional): Set `DISCORD_GAME_UPDATE_MESSAGE` (use `{game}` as placeholder)

### Donation Stream Markers

Set `STREAM_MARKER_DONATION_THRESHOLD=100` to create one Twitch stream marker for each new Extra Life donation of **$100.00 or more**. The value is a positive USD amount with up to two decimal places (for example, `25.50`). Leaving it unset or blank disables markers; invalid values prevent startup.

Markers reuse the broadcaster's `TWITCH_REFRESH_TOKEN`, `TWITCH_CLIENT_ID`, and `TWITCH_CLIENT_SECRET` from Game Update Setup with the `channel:manage:broadcast` scope. Your stream must be live with **Store past broadcasts** enabled under Twitch's VOD settings. Bot chat credentials alone cannot create markers.

Each marker is labeled `Donation: $100.00 from Full Display Name`. Donor names appear in full unless Twitch's 140-character description limit requires shortening the name with an ellipsis. Missing or blank names appear as `Anonymous`; donation messages are not included. Multiple qualifying donations in the same poll receive separate markers, with no application-imposed per-stream cap or cooldown. Twitch documents API rate limits but no per-stream marker count quota; the API's 100-marker retrieval limit is per page.

Markers are requested alongside announcements using the existing 30-second donation polling interval. They mark the stream's current position when Twitch processes the request; they cannot be backdated to the original donation time. Twitch already records category changes as VOD chapters, so the bot adds markers only for donations.

The first successful donation load remains silent even if earlier startup fetches fail; it and repeated donation IDs never create markers. Offline/VOD-unavailable donations are skipped, and other failures (including rate limits) are logged without interrupting announcements or Hue celebrations. Requests expire after ten seconds and are cancelled during shutdown. Failed, skipped, or historical donations are not retried or replayed after restart, avoiding duplicate and late markers.

See [Twitch's marker API](https://dev.twitch.tv/docs/api/reference#create-stream-marker), [rate limits](https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits), and [VOD chapters](https://help.twitch.tv/s/article/video-on-demand) for platform requirements.

## Commands

### Built-in Commands (work on both Discord and Twitch)
- **`!goal`**: Shows current fundraising progress
  ```
  St. John Johnson has raised $1,250.00 out of $10,000.00 (13%)
  ```

- **`!promote`**: Moves all users from waiting room voice channel to live chat voice channel *(Admin only)*
  ```
  Promoted 3 member(s) to live chat!
  ```
  *Note: This command requires Discord voice channel management to be configured and admin permissions*

### Hue Chat Commands (optional, Twitch and Discord)

Set `HUE_CHAT_CONTROL_ENABLED=true` to enable these commands for everyone on both platforms. They use the existing Hue bridge credentials and `HUE_GROUPID`.

- **`!color lightblue`**: Apply a CSS named color (for example, `orange` or `rebeccapurple`).
- **`!color #112233`**: Apply a six-digit hex color. Short hex values, alpha values, and CSS functions are unsupported.
- **`!color random`**: Apply a random color.
- **`!color party`**: Change the group's color every second for 15 seconds, then restore each light's previous on/off state, brightness, and color.

Commands and colors are case-insensitive. Normal color changes remain until changed again and preserve each light's on/off state. Successful normal changes are quiet; starting a party gets a short acknowledgement.

Twitch and Discord share one normal color change per second and one party per minute. These limits are independent and apply to the whole group, rather than to individual users. Extra requests receive a cooldown response. Requests during a party, donation celebration, restoration, or pending light change receive a brief busy response and are not queued.

Donation celebrations cancel active parties permanently. After the celebration, the lights return to the original pre-party state. `!testlights` uses the same celebration priority and remains admin-only.

Missing or invalid colors get usage guidance. Disabled controls and unavailable bridges get concise replies; bridge and restoration failures are logged. A party requires a saved state for every light in the group before it starts. Shutdown cancels active effects, waits for pending light writes, and attempts to restore the original state.

The `color` command name is reserved even when chat light control is disabled; rename any existing custom response using that name before upgrading.

### Stream Avatars controls (optional, Twitch admins)

Enable the LAN bridge with `STREAM_AVATARS_ENABLED=true` and a private `STREAM_AVATARS_TOKEN`. The companion settings need only the bot address and matching token. Screen bounds and packaged heart dimensions are automatic.

In the configured Twitch channel, admins can use `!sa status`, `!sa rehearsal start`, `!sa crowd 20`, `!sa hearts`, and `!sa rehearsal stop`. Starting rehearsal requires a fresh successful offline Twitch sample. Real live status stops rehearsal automatically. The `sa` name is reserved from custom responses.

`npm run sa:rehearse` provides a temporary local preview without Twitch, Discord, or Extra Life credentials. Use `crowd 20`, `hearts`, `clear`, and `quit`. Run `npm run sa:package` to generate an import ZIP with the companion, current image catalog, and animation settings. See [setup and commands](docs/stream-avatars-setup.md) and [verification status](docs/stream-avatars-verification.md). A real Stream Avatars/OBS preview remains required for issue #65 acceptance.

Run `npm run sa:package` to generate `dist/stream-avatars/sa-helper-bridge.zip` for **Import & Export → Select Import** on another computer. It bundles the companion and all image manifests with their frame/FPS/loop settings, using placeholder credentials. See [package import and adding images](docs/stream-avatars-setup.md#generate-and-import-the-zip); reimporting replaces the bridge's local settings, so preserve them before updating.

### Custom Commands
You can create your own custom commands using the `CUSTOM_RESPONSES` environment variable. Custom commands:
- Work on both Discord and Twitch
- Are available to all users (not admin-restricted)
- Are case-insensitive (`!donate` and `!DONATE` work the same)
- Cannot override built-in commands

**Examples:**
- **`!donate`**: Custom donation link response
  ```
  Check out my donation page: https://donate.example.com
  ```
- **`!discord`**: Custom Discord invite response
  ```
  Join our community Discord: https://discord.gg/example
  ```

## Admin Commands

Some commands are restricted to admin users only for security purposes. Admin users are configured via the `DISCORD_ADMIN_USERS` and `TWITCH_ADMIN_USERS` environment variables (see configuration section above).

**Admin-only commands:**
- `!promote` - Voice channel management (moves users from waiting room to live chat)
- `!sa` - Stream Avatars rehearsal and session recovery (Twitch only)
- `!testlights` - Test Philips Hue light celebration (verifies connection and triggers a demo light show)

**Admin Configuration Examples:**
```bash
DISCORD_ADMIN_USERS=123456789012345678,987654321098765432
TWITCH_ADMIN_USERS=your_username,another_admin
```

**Getting Discord User IDs**: Enable Developer Mode in Discord settings, right-click your username, and select "Copy User ID".

## Example Output

### Discord
```
St. John Johnson just donated $25.00 with the message "Good luck with the marathon!"!
```

### Twitch
```
ExtraLife ExtraLife St. John Johnson just donated $25.00 with the message "Good luck with the marathon!"! ExtraLife ExtraLife
```

### Goal Command Response
```
!goal
St. John Johnson has raised $1,250.00 out of $10,000.00 (13%)
```

### Game Update Behavior
When the monitored Discord user changes their game status:
- **Game Start**: Twitch channel game category automatically updates to match the new game using smart matching
- **Game Stop**: Twitch channel game category automatically updates to "Just Chatting"
- **Game Switch**: Twitch channel game category updates from old game to new game
- **Game Overrides**: Specific games can be mapped to different Twitch categories (configured in code):
  - `The Jackbox Survey Scramble` → `Jackbox Party Packs`
  - `The Jackbox Party Pack 11` → `Jackbox Party Packs`
- **Smart Matching**: When no override exists, uses 5-priority system:
  1. **Exact match** (case insensitive)
  2. **Game starts with** Discord activity name
  3. **Discord activity starts with** game name (abbreviations)
  4. **Whole word match** within game name
  5. **Fuzzy match** for partial matches
- **Not Found**: If no suitable game category is found on Twitch, no change is made and a warning is logged
- **Token Management**: Access tokens are automatically refreshed using refresh tokens when they expire

**Note**: This feature requires both Discord and Twitch services to be fully configured, including `TWITCH_CLIENT_SECRET` and `TWITCH_REFRESH_TOKEN` for automatic token management.

## Automatic Token Management

The bot automatically manages Twitch access tokens when game update notifications are configured:

- **Automatic Refresh**: Access tokens are automatically refreshed before they expire (with 5-minute safety buffer)
- **In-Memory Caching**: Tokens are cached in memory to minimize API calls
- **Error Handling**: If token refresh fails, detailed error messages guide you to re-authorize
- **No Manual Intervention**: Once properly configured with refresh token, the bot handles all token management

**Important**: The `TWITCH_REFRESH_TOKEN` must be obtained using the **broadcaster/streamer account**, not the bot account, as it needs `channel:manage:broadcast` permissions.

### Viewer and voice participation analytics

`TWITCH_VIEWER_SAMPLE_INTERVAL_SECONDS` and `DISCORD_VOICE_SAMPLE_INTERVAL_SECONDS` default to 60 seconds. Both accept integer values from 15 to 3600. Twitch records online and offline samples; API failures remain collection errors.

Discord follows `DISCORD_GAME_UPDATE_USER_ID` in the guild containing `DISCORD_DONATION_CHANNEL`. The bot needs access to that guild and voice channels; its existing voice-state intent supplies participation data. Total humans include the streamer, companions exclude the streamer, and bots are separate. The new voice events retain counts and guild/channel identifiers without member names or user IDs. No audio or speaking activity is recorded.

Voice samples occur at startup, on relevant count/channel changes, and periodically. Only periodic observations contribute to average, median, peak, start, and end summaries; all observations appear on the timeline. Reports show cadence, sample sizes, coverage, gaps, and service failures. Coverage is the union of successful periodic sampling intervals clipped to each window. Missing data is unavailable rather than zero; confirmed disconnection and offline Twitch samples are valid zero observations. Existing historical logs retain their original deterministic reports.

### OBS voice overlay

The optional voice overlay uses the configured live room and excludes the game-update target and helper bot. Enable it with `VOICE_OVERLAY_ENABLED=true`; `WEB_HOST` defaults to `0.0.0.0` for LAN access and `WEB_PORT` to `3000`. This HTTP listener serves both the voice overlay (including SSE at `/voice/events`) and the Stream Avatars WebSocket at `/sa/socket`. The legacy `VOICE_OVERLAY_HOST` and `VOICE_OVERLAY_PORT` settings remain fallbacks when the corresponding `WEB_*` setting is absent. The helper joins self-muted only while `DISCORD_GAME_UPDATE_USER_ID` is in the live room, and leaves as soon as that user disconnects or moves to another room. It observes speaking activity without recording audio. The helper is excluded from voice participation counts.

Add a Browser Source in OBS using `http://<bot-lan-ip>:3000/voice`. Set its dimensions to **460 × 64** for the compact camera scenes, or **540 × 64** below the right-side camera. Use independent source instances for different dimensions rather than scaling a larger browser canvas down. The avatars stay centered inside the source, grow no larger than 48 pixels, and shrink to fit larger groups. Idle avatars fade to 60% and use a static image; animated avatars animate only while speaking, alongside the cyan ring. They return to the static image after the existing 180 ms speaking release delay.

For the large-camera scene, place the 460 × 64 source inside the camera's lower-left corner with a small inset. For the other scenes, place it directly below the camera. Keep donation displays and the bottom Stream Avatars area clear.

Use `http://<bot-lan-ip>:3000/voice?preview=5` (or `preview=1` / `preview=10`) to see sample avatars and simulated speaking without displaying live participants. Remove the preview query when ready to use the real room. The Browser Source stays available while the streamer is away. The real overlay is blank when the streamer is absent, nobody eligible is present, or voice is unavailable; errors are reported in the bot log.

The bot needs **View Channel** and **Connect** in the live voice room. It joins self-muted and must remain undeafened to detect speaking. Explicitly moving or disconnecting it pauses automatic return until restart. Other transient failures reconnect automatically while the streamer is in the live room. Returning to the live room starts a fresh connection after an ordinary departure. Stats still follow the streamer and exclude only the helper itself; the overlay always uses the fixed live room and hides both the helper and `DISCORD_GAME_UPDATE_USER_ID`.

For Docker, publish the overlay port:

```bash
docker run --rm -it --env-file .env \
  -e VOICE_OVERLAY_ENABLED=true -p 3000:3000 \
  ghcr.io/stjohnjohnson/extralife-helper-bot:latest
```

Allow the OBS computer to reach that port on your internal network. The existing full-bot configuration requirements still apply. No audio is recorded or decoded, and member identities/speaking activity are not added to analytics logs.
