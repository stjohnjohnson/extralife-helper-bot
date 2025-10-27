## [4.2.2](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.2.1...v4.2.2) (2025-10-27)


### Bug Fixes

* After refactor, forgot to remove configured checks ([9124243](https://github.com/stjohnjohnson/extralife-helper-bot/commit/9124243c80d04c5e20811ad8017e8695af4938e5))

## [4.2.1](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.2.0...v4.2.1) (2025-10-27)


### Bug Fixes

* Reduce the noise when there is no stream ([965230f](https://github.com/stjohnjohnson/extralife-helper-bot/commit/965230f6731e047c249893650f31c003ee52d60b))

# [4.2.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.1.0...v4.2.0) (2025-10-27)


### Features

* **gameUpdates:** add game override system for Twitch category mapping ([305b66c](https://github.com/stjohnjohnson/extralife-helper-bot/commit/305b66c68fc0ff6e57050ddc53af0fc14fc56e02))

# [4.1.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.0.0...v4.1.0) (2025-10-27)


### Features

* add Twitch stream viewer count monitoring with comprehensive testing ([2c5a22f](https://github.com/stjohnjohnson/extralife-helper-bot/commit/2c5a22f740ab4aba4f1f45875e4dbc93024e3d58))

# [4.0.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v3.0.1...v4.0.0) (2025-10-27)


* refactor!: make all services required, remove optional configuration ([e1f5c8a](https://github.com/stjohnjohnson/extralife-helper-bot/commit/e1f5c8a0723860acedbae8c229a0669ca38a31f6))


### BREAKING CHANGES

* Discord, Twitch, and Game Updates are now all required services instead of optional

- Remove "configured" flags from config object (discord.configured, twitch.configured, gameUpdates.configured)
- Make all Discord, Twitch, and Game Update environment variables required
- Simplify application logic by removing conditional service initialization
- Update configuration validation to require all services upfront
- Update tests to reflect new required configuration structure
- Update README documentation to clarify all services are now mandatory
- Reduce code complexity by eliminating optional service detection logic

Required environment variables are now:
- Discord: DISCORD_TOKEN, DISCORD_DONATION_CHANNEL, DISCORD_SUMMARY_CHANNEL, DISCORD_WAITING_ROOM_CHANNEL, DISCORD_LIVE_ROOM_CHANNEL
- Twitch: TWITCH_USERNAME, TWITCH_CHAT_OAUTH, TWITCH_CHANNEL, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_REFRESH_TOKEN
- Game Updates: DISCORD_GAME_UPDATE_USER_ID
- Core: EXTRALIFE_PARTICIPANT_ID

## [3.0.1](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v3.0.0...v3.0.1) (2025-10-27)


### Bug Fixes

* Write the new game to Twitch chat ([0c41b31](https://github.com/stjohnjohnson/extralife-helper-bot/commit/0c41b31832daf05550c71348324b7e98e5c3b811))

# [3.0.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v2.2.0...v3.0.0) (2025-09-30)


### Features

* implement automatic Twitch token refresh with comprehensive documentation updates ([31abd99](https://github.com/stjohnjohnson/extralife-helper-bot/commit/31abd99c53cb3dbbc32ced5a65e06de9e1f27292))


### BREAKING CHANGES

* TWITCH_API_OAUTH environment variable removed in favor of automatic token refresh using TWITCH_CLIENT_SECRET and TWITCH_REFRESH_TOKEN

# [2.2.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v2.1.1...v2.2.0) (2025-09-30)


### Features

* improve logging format and Discord summary initialization ([5ba7258](https://github.com/stjohnjohnson/extralife-helper-bot/commit/5ba7258388bbd5fcc80e6f0a9346b104146abd6a))

## [2.1.1](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v2.1.0...v2.1.1) (2025-09-30)


### Bug Fixes

* separate Discord summary updates with delay to handle API timing ([776cb98](https://github.com/stjohnjohnson/extralife-helper-bot/commit/776cb983119d7f80c50452d351bc6773466aef2c))

# [2.1.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v2.0.0...v2.1.0) (2025-09-28)


### Features

* add custom command responses via CUSTOM_RESPONSES env var ([0670082](https://github.com/stjohnjohnson/extralife-helper-bot/commit/067008247b6506a5af8e44e0f4ced98069ff8de0)), closes [#10](https://github.com/stjohnjohnson/extralife-helper-bot/issues/10)

# [2.0.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v1.0.1...v2.0.0) (2025-09-28)


### Features

* add Discord-to-Twitch game update bridge with smart matching ([370016e](https://github.com/stjohnjohnson/extralife-helper-bot/commit/370016e9e9e21c13536ddebe250821c8b69f4223)), closes [#11](https://github.com/stjohnjohnson/extralife-helper-bot/issues/11)


### BREAKING CHANGES

* Twitch configuration now requires separate TWITCH_CHAT_OAUTH and TWITCH_API_OAUTH tokens instead of single TWITCH_OAUTH token

## [1.0.1](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v1.0.0...v1.0.1) (2025-09-23)


### Bug Fixes

* Removing dev dependencies when making the Docker container ([00380ed](https://github.com/stjohnjohnson/extralife-helper-bot/commit/00380ed36a3193c83041a08e45a028b1e75386b1))

# 1.0.0 (2025-09-23)


### Bug Fixes

* Switch to Semantic-Version as the release vehicle ([cd90999](https://github.com/stjohnjohnson/extralife-helper-bot/commit/cd909991e18751283d98743e390a12ed21c322b6))


### Features

* add voice channel management with admin-restricted !promote command ([de0c312](https://github.com/stjohnjohnson/extralife-helper-bot/commit/de0c312acd6ee28a1f58ba202fbbb38b2abea9ed))
* Automatically release the docker container ([8c4d5c3](https://github.com/stjohnjohnson/extralife-helper-bot/commit/8c4d5c331e3ace21adfb9a26c3fa05b6a4650476))
