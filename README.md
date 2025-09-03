# ExtraLife Helper Bot

A unified helper bot for managing your ExtraLife 24 hour marathon stream, bridging between Discord and Twitch.

This bot combines the functionality of both Discord and Twitch bridges, allowing you to:
- Post donation notifications to Discord channels
- Update Discord channel names with fundraising progress
- Post donation notifications to Twitch chat
- Respond to `!goal` commands in Twitch chat
- Run both services simultaneously or independently

## Features

### Discord Integration
- **Donation Stream**: Posts new donations to a specified Discord channel
- **Summary Updates**: Updates a Discord channel name to show total amount raised and percentage of goal
- **Real-time Updates**: Checks for new donations every 30 seconds

### Twitch Integration  
- **Donation Announcements**: Posts new donations to Twitch chat with ExtraLife emotes
- **Goal Command**: Responds to `!goal` with current fundraising progress
- **Chat Bot**: Maintains persistent connection to your Twitch channel

## Configuration

The bot requires at least one service (Discord or Twitch) to be configured. Set the following environment variables:

### Required (for both services)
- `EXTRALIFE_PARTICIPANT_ID`: Your ExtraLife/DonorDrive participant ID

### Discord Service (optional)
- `DISCORD_TOKEN`: Your Discord bot token
- `DISCORD_DONATION_CHANNEL`: Discord channel ID for posting donations
- `DISCORD_SUMMARY_CHANNEL`: Discord channel ID for updating the name with progress

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
docker run --rm -it --env-file .env stjohnjohnson/extralife-helper-bot:latest
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
3. Invite the bot to your server with `Send Messages` and `Manage Channels` permissions
4. Get the channel IDs by enabling Developer Mode in Discord and right-clicking channels

### Twitch Bot Setup  
1. Create a Twitch account for your bot
2. Get an OAuth token from https://twitchapps.com/tmi/
3. Set the channel name (without the # prefix)

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
