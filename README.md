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

### Overall
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
- `TWITCH_OAUTH`: OAuth token from [https://twitchapps.com/tmi/](https://twitchapps.com/tmi/)
- `TWITCH_CHANNEL`: The Twitch channel name to join

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
1. Create a Twitch account for your bot
2. Get an OAuth token from https://twitchapps.com/tmi/
3. Set the channel name (without the # prefix)

## Commands

### Available Commands (work on both Discord and Twitch)
- **`!goal`**: Shows current fundraising progress
  ```
  St. John Johnson has raised $1,250.00 out of $10,000.00 (13%)
  ```

- **`!promote`**: Moves all users from waiting room voice channel to live chat voice channel *(Admin only)*
  ```
  Promoted 3 member(s) to live chat!
  ```
  *Note: This command requires Discord voice channel management to be configured and admin permissions*

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
Helper bot for automating some Discord and Twitch integrations (and maybe more?!)
