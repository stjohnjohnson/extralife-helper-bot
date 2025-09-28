# ExtraLife Helper Bot

A unified helper bot for managing your ExtraLife 24 hour marathon stream, bridging between Discord and Twitch.

This bot combines the functionality of both Discord and Twitch bridges, allowing you to:
- Post donation notifications to Discord channels and Twitch chat
- Update Discord channel names with fundraising progress
- Cross-platform commands that work on both Discord and Twitch (`!goal`, `!promote`)
- Voice channel management for stream participants
- Run both services simultaneously or independently

## Features

### Discord Integration
- **Donation Stream**: Posts new donations to a specified Discord channel
- **Summary Updates**: Updates a Discord channel name to show total amount raised and percentage of goal
- **Voice Channel Management**: `!promote` command to move users from waiting room to live chat

### Twitch Integration  
- **Donation Announcements**: Posts new donations to Twitch chat with ExtraLife emotes
- **Automatic Game Category Updates**: Changes Twitch channel game category when Discord user changes games

### Cross-Platform Features
- **Game Update Bridge**: Detects Discord game status changes and automatically updates Twitch channel category
- **Cross-platform Commands**: `!goal` and `!promote` commands work from Twitch and Discord
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

### Twitch Service (optional)  
- `TWITCH_USERNAME`: Your bot's Twitch username
- `TWITCH_CHAT_OAUTH`: Bot OAuth token from [https://twitchapps.com/tmi/](https://twitchapps.com/tmi/)
- `TWITCH_CHANNEL`: The Twitch channel name to join

### Game Update Notifications (optional - requires both Discord and Twitch)
- `DISCORD_GAME_UPDATE_USER_ID`: Discord user ID to monitor for game changes
- `DISCORD_GAME_UPDATE_MESSAGE`: Custom message template (optional, default: "Streamer is now playing {game}!")
- `TWITCH_API_OAUTH`: OAuth token with `channel:manage:broadcast` scope (see setup instructions below)
- `TWITCH_CLIENT_ID`: Your Twitch application client ID

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
3. Invite the bot to your server with these permissions:
   - `Send Messages` - for donation notifications and command responses
   - `Manage Channels` - for updating summary channel name
   - `Move Members` - for the `!promote` command (if using voice channel management)
   - `View Channels` - for accessing configured channels
4. Get the channel IDs by enabling Developer Mode in Discord and right-clicking channels
5. **For voice management**: Set up waiting room and live room voice channel IDs in your environment

### Twitch Bot Setup  
1. **Create a Twitch application** at https://dev.twitch.tv/console/apps
2. **Copy your Client ID** from the application
3. **Generate two OAuth tokens**:

   **For Chat (Bot Account)**:
   - Use your bot account (can be separate from streamer)
   - Get token from https://twitchapps.com/tmi/
   - Set as `TWITCH_CHAT_OAUTH`
   
   **For API/Game Updates (Streamer Account)**:
   - **Must use streamer/broadcaster account**
   - Use [Twitch Token Generator](https://twitchtokengenerator.com/) with your Client ID
   - Select `channel:manage:broadcast` scope
   - Set as `TWITCH_API_OAUTH`

4. **Set configuration**:
   - `TWITCH_USERNAME`: Your bot's username (for chat)
   - `TWITCH_CHANNEL`: Your streamer channel name (without # prefix)

### Game Update Setup (optional)
1. **Requires both Discord and Twitch services** to be configured
2. Get the Discord user ID to monitor:
   - Enable Developer Mode in Discord settings
   - Right-click the user's profile and select "Copy User ID"
   - Set this as `DISCORD_GAME_UPDATE_USER_ID`
3. **Note**: The Discord bot needs the "Server Members Intent" enabled for presence monitoring
4. Customize the notification message with `DISCORD_GAME_UPDATE_MESSAGE` (use `{game}` as placeholder)

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

Some commands are restricted to admin users only for security purposes. Configure admin users by setting these environment variables:

- `DISCORD_ADMIN_USERS` - Comma-separated list of Discord user IDs who can use admin commands
- `TWITCH_ADMIN_USERS` - Comma-separated list of Twitch usernames who can use admin commands

**Admin-only commands:**
- `!promote` - Voice channel management

**Example:**
```bash
DISCORD_ADMIN_USERS=123456789012345678,987654321098765432
TWITCH_ADMIN_USERS=your_username,another_admin
```

To get your Discord user ID: Enable Developer Mode in Discord settings, right-click your username, and select "Copy User ID".

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
- **Game Start**: Twitch channel game category automatically updates to match the new game
- **Game Stop**: Twitch channel game category automatically updates to "Just Chatting"
- **Game Switch**: Twitch channel game category updates from old game to new game
- **Not Found**: If the game isn't found on Twitch, no change is made and an error is logged
Helper bot for automating some Discord and Twitch integrations (and maybe more?!)
