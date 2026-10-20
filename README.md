# ExtraLife Helper Bot

ExtraLife Helper Bot connects Extra Life donations with Discord, Twitch, Philips Hue, and optional stream displays.

## Features

- Announce new donations in Discord and Twitch chat.
- Show fundraising progress with `!goal` and a Discord channel name.
- Celebrate donations with Hue lights; optionally let chat control their colors.
- Move waiting-room participants into the live Discord voice room with an admin command.
- Update the Twitch game category from a selected user's Discord activity.
- Create optional Twitch markers for donations at or above a configured amount.
- Show optional speaking avatars in an OBS voice overlay.
- Celebrate donations and campaign milestones in Stream Avatars, with game-themed scenery.
- Collect viewer and voice participation samples for local event-log reports.

## Start the bot

The bot requires Extra Life, Discord, Twitch, voice-room, game-update, and Hue settings.
All core services are required by startup validation.
The OBS overlay, Stream Avatars, donation markers, and chat light control are optional.

1. Complete the [account and device setup](docs/setup.md).
2. Copy the environment example:

   ```sh
   cp env.example .env
   ```

3. Replace the required placeholders in `.env` using the [configuration reference](docs/configuration.md).
4. Start the published Docker image:

   ```sh
   docker run --rm -it --env-file .env \
     -v donation-state:/usr/src/app/data/donations \
     ghcr.io/stjohnjohnson/extralife-helper-bot:latest
   ```

For web integrations, publish the listener port as described in the relevant guide.
Stream Avatars also needs persistent state storage.
The donation volume preserves [replay checkpoints](docs/configuration.md#donation-replay) across container replacements.

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
