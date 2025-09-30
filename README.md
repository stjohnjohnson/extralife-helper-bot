# ExtraLife Helper Bot

A unified helper bot for managing your ExtraLife 24 hour marathon stream, bridging between Discord and Twitch.

This bot combines the functionality of both Discord and Twitch bridges, allowing you to:
- Post donation notifications to Discord channels and Twitch chat
- Update Discord channel names with fundraising progress
- Cross-platform commands that work on both Discord and Twitch (`!goal`, `!promote`)
- Custom command responses that work across both platforms
- Voice channel management for stream participants
- Automatic Twitch game category updates based on Discord presence changes
- Smart game matching with 5-level priority system
- Automatic token refresh management for seamless operation
- Run both services simultaneously or independently

## Features

### Discord Integration
- **Donation Stream**: Posts new donations to a specified Discord channel
- **Summary Updates**: Updates a Discord channel name to show total amount raised and percentage of goal
- **Voice Channel Management**: `!promote` command to move users from waiting room to live chat
- **Presence Monitoring**: Detects when monitored users change their game status

### Twitch Integration
- **Donation Announcements**: Posts new donations to Twitch chat with ExtraLife emotes
- **Automatic Game Category Updates**: Changes Twitch channel game category when Discord user changes games
- **Smart Game Matching**: Uses 5-level priority system to find best Twitch category matches
- **Automatic Token Management**: Refreshes access tokens automatically using refresh tokens

### Cross-Platform Features
- **Game Update Bridge**: Detects Discord game status changes and automatically updates Twitch channel category with smart matching
- **Cross-platform Commands**: `!goal` and `!promote` commands work from both Twitch and Discord
- **Custom Commands**: Define your own bot commands that work across both platforms
- **Real-time Updates**: Checks for new donations every 30 seconds

## Configuration

The bot requires at least one service (Discord or Twitch) to be configured. Set the following environment variables:

### Required (for both services)
- `EXTRALIFE_PARTICIPANT_ID`: Your ExtraLife/DonorDrive participant ID

### Discord Service (optional)
- `DISCORD_TOKEN`: Your Discord bot token
- `DISCORD_DONATION_CHANNEL`: Discord channel ID for posting donations
- `DISCORD_SUMMARY_CHANNEL`: Discord channel ID for updating the name with progress

### Discord Voice Channel Management (optional - for !promote command)
- `DISCORD_WAITING_ROOM_CHANNEL`: Voice channel ID for users waiting to join stream
- `DISCORD_LIVE_ROOM_CHANNEL`: Voice channel ID for live streaming participants

### Admin Users (optional - for restricted commands)
- `DISCORD_ADMIN_USERS`: Comma-separated list of Discord user IDs who can use admin commands
- `TWITCH_ADMIN_USERS`: Comma-separated list of Twitch usernames who can use admin commands

### Twitch Service (optional)
- `TWITCH_USERNAME`: Your bot's Twitch username
- `TWITCH_CHAT_OAUTH`: Bot OAuth token from [https://twitchapps.com/tmi/](https://twitchapps.com/tmi/)
- `TWITCH_CHANNEL`: The Twitch channel name to join
- `TWITCH_CLIENT_ID`: Your Twitch application client ID

### Game Update Notifications (optional - requires both Discord and Twitch)
- `DISCORD_GAME_UPDATE_USER_ID`: Discord user ID to monitor for game changes
- `DISCORD_GAME_UPDATE_MESSAGE`: Custom message template (optional, default: "Now playing {game}!")
- `TWITCH_CLIENT_SECRET`: Your Twitch application client secret (for automatic token refresh)
- `TWITCH_REFRESH_TOKEN`: Refresh token for automatic access token management

### Custom Command Responses (optional)
- `CUSTOM_RESPONSES`: Define custom bot commands and their responses
  - Format: `command1:"response1",command2:"response2"`
  - Example: `donate:"Check out https://donate.example.com",discord:"Join our Discord: https://discord.gg/example"`
  - Commands must start with a letter and contain only lowercase letters and numbers
  - Cannot conflict with built-in commands (`goal`, `promote`)
  - Commands are case-insensitive when used (e.g., `!DONATE` and `!donate` work the same)

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

```bash
# Install dependencies
npm install

# Create .env file with your configuration
cp env.example .env

# Run the bot
npm start

# Run tests
npm test

# Lint code
npm run lint
```

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

### Game Update Setup (optional)
1. **Requires both Discord and Twitch services** to be configured
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
- **Smart Matching**: Uses 5-priority system:
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
