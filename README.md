# ExtraLife Helper Bot

ExtraLife Helper Bot connects Extra Life donations with Discord, Twitch, Philips Hue, and stream displays.

## Features

- Announce new donations in Discord and Twitch chat.
- Show fundraising progress with `!goal` and a Discord channel name.
- Celebrate donations with Hue lights and let chat control their colors.
- Move waiting-room participants into the live Discord voice room with an admin command.
- Update the Twitch game category from a selected user's Discord activity.
- Create Twitch markers for donations at or above a configured amount.
- Show speaking avatars in an OBS voice overlay.
- Celebrate donations and campaign milestones in Stream Avatars, with game-themed scenery.
- Collect viewer and voice participation samples for local event-log reports.

## Start the bot

The bot requires Extra Life, Discord, Twitch, voice-room, game-update, and Hue settings.
Every integration starts with the bot.
Startup validation requires a marker threshold, a private Stream Avatars token, and valid settings for all services.
For existing installations, follow the [upgrade instructions](docs/configuration.md#upgrade-from-feature-switches).

1. Complete the [account and device setup](docs/setup.md).
2. Copy the environment example:

   ```sh
   cp env.example .env
   ```

3. Replace the required placeholders in `.env` using the [configuration reference](docs/configuration.md).
4. Start the published Docker image:

   ```sh
   docker run --rm -it --env-file .env -p 3000:3000 \
     -v stream-avatars-state:/usr/src/app/data/stream-avatars \
     ghcr.io/stjohnjohnson/extralife-helper-bot:latest
   ```

Restrict listener access to trusted computers.
The voice overlay has no login; see [network access](docs/voice-overlay.md).
The named Docker volume preserves Stream Avatars state.

For local execution, use Node.js **24.x, version 24.15.0 or newer**:

```sh
npm ci
npm start
```

The companion bundles seven family voice recordings. Donations cycle through four options, milestones alternate between two, and goals use one recording. Run `npm run sa:package`, then import all seven Oggs from `dist/stream-avatars/sounds/` through Stream Avatars' **Sounds** screen. Each new celebration plays one clip; updates and reconnects do not repeat it. Set native volume or configure custom single names, ordered lists, or disabled kinds. See [sound setup](docs/stream-avatars-setup.md#celebration-sounds) for imports and configuration.

## Documentation

| Task | Guide |
| --- | --- |
| Create accounts, obtain credentials, and run the bot | [Setup](docs/setup.md) |
| Find required settings, defaults, and valid values | [Configuration](docs/configuration.md) |
| Use chat commands and assign administrators | [Commands](docs/commands.md) |
| Configure speaking avatars in OBS | [Voice overlay](docs/voice-overlay.md) |
| Configure donation effects, scenery, and persistent state | [Stream Avatars setup](docs/stream-avatars-setup.md) |
| Mark large donations in Twitch recordings | [Donation markers](docs/stream-markers.md) |
| Save logs and generate event reports | [Log analysis](docs/log-analysis.md) |
| Change artwork or inspect native acceptance evidence | [Stream Avatars technical reference](docs/stream-avatars-reference.md) |

## Development

Use the supported Node.js version and install dependencies with `npm ci`.
Run `npm run lint` and `npm test` before submitting changes.
See [AGENTS.md](AGENTS.md) for contribution, issue, and writing guidelines.
See [CHANGELOG.md](CHANGELOG.md) for released changes.
