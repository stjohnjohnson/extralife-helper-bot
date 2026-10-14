# Bot setup

[README](../README.md) · [Configuration](configuration.md) · [Commands](commands.md)

Complete the core account and device setup before starting the bot.
Startup requires Discord, Twitch, voice-room, game-update, and Hue settings.
Optional integrations have separate guides.

## Extra Life

1. Open your Extra Life participant page.
2. Copy its participant ID into `EXTRALIFE_PARTICIPANT_ID`.

## Discord

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create its bot user.
3. Copy the bot token into `DISCORD_TOKEN`.
4. Enable **Presence Intent** in the bot settings.
5. Enable **Message Content Intent** in the bot settings.
6. Invite the bot to your server with the permissions below.
7. Enable Developer Mode in your Discord client.
8. Copy each channel ID into its corresponding setting.
9. Copy the monitored user's ID into `DISCORD_GAME_UPDATE_USER_ID`.

The bot requests guild, message, voice-state, presence, and message-content events.
It does not request the Server Members Intent.
Discord documents privileged intent requirements in its [Gateway reference](https://docs.discord.com/developers/events/gateway#privileged-intents).

| Permission | Purpose |
| --- | --- |
| View Channels | Access configured text and voice channels |
| Send Messages | Post donations and command responses |
| Read Message History | Reply to commands in text channels |
| Manage Channels | Rename the fundraising summary channel |
| Connect | Access voice rooms; required for the speaking overlay |
| Move Members | Move waiting participants with `!promote` |

Use `DISCORD_DONATION_CHANNEL` for donation messages and `DISCORD_SUMMARY_CHANNEL` for the progress channel.
Use `DISCORD_WAITING_ROOM_CHANNEL` and `DISCORD_LIVE_ROOM_CHANNEL` for voice management.
The monitored user must be visible to the bot for presence updates.

## Twitch

The bot uses two credential sets.
Chat credentials belong to the account named by `TWITCH_USERNAME`.
API credentials belong to the broadcaster whose channel is named by `TWITCH_CHANNEL`.

### Application

1. Register an application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps).
2. Set an OAuth redirect URI for the token authorization flow.
3. Copy the client ID into `TWITCH_CLIENT_ID`.
4. Copy the client secret into `TWITCH_CLIENT_SECRET`.
5. Set `TWITCH_CHANNEL` to the broadcaster's login name, without `#`.

### Chat account

1. Sign in to the account that will send bot chat messages.
2. Obtain a user access token with `chat:read` and `chat:edit` scopes.
3. Set `TWITCH_USERNAME` to that account's login name.
4. Set `TWITCH_CHAT_OAUTH` to `oauth:` followed by that access token.

Use Twitch's [OAuth token procedure](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/) to obtain the token.
Twitch's [IRC authentication guide](https://dev.twitch.tv/docs/chat/irc/#authenticating-with-the-twitch-irc-server) specifies the chat scopes.
The bot does not refresh the chat access token automatically.
If chat authentication fails, replace that token.

### Broadcaster API access

1. Sign in to the broadcaster account.
2. Authorize your application with the `channel:manage:broadcast` scope.
3. Exchange the authorization code using the same application's client ID, client secret, and registered redirect URI.
4. Copy the returned refresh token into `TWITCH_REFRESH_TOKEN`.

Follow Twitch's [authorization code grant flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow) for authorization and exchange parameters.
The bot uses this refresh token for game-category updates, viewer sampling, and donation markers.
The bot caches API access tokens in memory and refreshes them with a five-minute expiry buffer.
It does not save returned replacement refresh tokens.
If refresh fails, authorize again and replace `TWITCH_REFRESH_TOKEN`.

## Philips Hue

1. Find the Hue bridge IP address in the Hue app or router settings.
2. Set `HUE_IPADDRESS` to that address.
3. Press the physical link button on the bridge.
4. Within 30 seconds, send `{"devicetype":"ExtraLife Helper Bot"}` in a POST request to `http://<bridge-ip>/api`.
5. Set `HUE_USERNAME` to the returned API username.
6. Request `http://<bridge-ip>/api/<username>/groups`.
7. Set `HUE_GROUPID` to the group for donation celebrations.

See the [Hue developer setup guide](https://developers.meethue.com/develop/get-started-2/) for bridge discovery and API authorization.
Keep the bridge and bot reachable on the same private network.
Donation celebrations restore previous light states when they finish.
Chat colors use the same group; see [Hue commands](commands.md#hue-colors-and-parties).

## Run with Docker

1. Copy `env.example` to `.env`.
2. Replace every required placeholder using the [configuration reference](configuration.md).
3. Start the bot:

   ```sh
   docker run --rm -it --env-file .env -p 3000:3000 \
     -v stream-avatars-state:/usr/src/app/data/stream-avatars \
     ghcr.io/stjohnjohnson/extralife-helper-bot:latest
   ```

Every integration starts with the bot.
Configure the [marker threshold](stream-markers.md), [voice overlay](voice-overlay.md), and [Stream Avatars token and companion](stream-avatars-setup.md).
Restrict the published listener port to trusted computers.
The named Docker volume preserves Stream Avatars state.

The [Compose file](../docker-compose.yml) builds the local checkout and restarts the bot unless stopped.
It includes a Stream Avatars state volume.
Restrict its listener port to your trusted network before starting:

```sh
docker compose up -d --build
```

## Run locally

Use Node.js 24.x, version 24.15.0 or newer.
The `.nvmrc` file selects the 24.x series.

1. If you use nvm, run `nvm install`.
2. If you use nvm, run `nvm use`.
3. Confirm that `node --version` meets the version requirement.
4. Run `npm ci`.
5. Copy `env.example` to `.env`.
6. Replace its required placeholders.
7. Run `npm start`.

The bot logs to the console.
See [log capture](log-analysis.md#save-a-log) before an event if you need a report afterwards.

## Game-category behavior

Discord Playing activity triggers category searches for `DISCORD_GAME_UPDATE_USER_ID`.
Stopping a game selects **Just Chatting**.
Successful changes also send `DISCORD_GAME_UPDATE_MESSAGE` to Twitch chat.
An unsuccessful category search leaves the current category unchanged and logs a warning.

Matching prefers an exact name, then prefix matches, whole-word matches, and partial matches.
The code maps **The Jackbox Survey Scramble** and **The Jackbox Party Pack 11** to **Jackbox Party Packs**.
These overrides are defined in `src/gameUpdates.js`; they are not environment settings.

## Startup checks

Missing or invalid required configuration prevents startup.
A donation or summary channel missing from the Discord cache also prevents startup.
The bot logs Twitch, Hue, and web-integration connection failures separately.

1. Check the startup log for configuration errors.
2. Confirm that the bot can post in the donation channel.
3. Run `!goal` in chat.
4. As a configured administrator, run `!testlights`.
5. Check a Discord game change against the Twitch category.

The first successful donation load is silent.
The bot checks for new donations every 30 seconds.
Existing donation IDs do not produce repeated announcements during the same run.
