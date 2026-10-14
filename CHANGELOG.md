# [4.15.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.14.0...v4.15.0) (2026-10-14)

### Changes

- Discord activity changes update Stream Avatars scenery while Twitch is offline after successful category updates. Scenery persists through offline periods and restarts until another category update or game reset. ([#102](https://github.com/stjohnjohnson/extralife-helper-bot/pull/102))

# [4.14.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.13.0...v4.14.0) (2026-10-13)

### Changes

- Add family voice alerts for donation recognition, campaign milestones and goals. Donation and milestone clips alternate automatically. Missing sounds preserve visual celebrations and connectivity. ([#80](https://github.com/stjohnjohnson/extralife-helper-bot/pull/80))

### Upgrade actions

- Run `npm run sa:package`. ([#80](https://github.com/stjohnjohnson/extralife-helper-bot/pull/80))
- Import `dist/stream-avatars/sa-helper-bridge.zip` into Stream Avatars. ([#80](https://github.com/stjohnjohnson/extralife-helper-bot/pull/80))
- Import all seven Oggs from `dist/stream-avatars/sounds/` through **Sounds → Import Sound**. ([#80](https://github.com/stjohnjohnson/extralife-helper-bot/pull/80))
- Set the companion’s private connection address. ([#80](https://github.com/stjohnjohnson/extralife-helper-bot/pull/80))
- Set the companion’s private connection token. ([#80](https://github.com/stjohnjohnson/extralife-helper-bot/pull/80))
- Companion import cannot register native sounds; import the seven Oggs separately. ([#80](https://github.com/stjohnjohnson/extralife-helper-bot/pull/80))
- Live audible playback, intelligibility, OBS capture and Windows execution remain unverified. ([#80](https://github.com/stjohnjohnson/extralife-helper-bot/pull/80))

# [4.13.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.12.1...v4.13.0) (2026-10-13)

### Changes

- Stream Avatars displays a small animated Extra Life logo at the host's heart position when connected. A question mark indicates unconfirmed connectivity. Viewer hearts remain available. ([#97](https://github.com/stjohnjohnson/extralife-helper-bot/pull/97))

### Upgrade actions

- Run `npm run sa:package`. ([#97](https://github.com/stjohnjohnson/extralife-helper-bot/pull/97))
- Back up the companion's private connection settings. ([#97](https://github.com/stjohnjohnson/extralife-helper-bot/pull/97))
- Import `dist/stream-avatars/sa-helper-bridge.zip` into Stream Avatars. ([#97](https://github.com/stjohnjohnson/extralife-helper-bot/pull/97))
- Restore the private connection address. ([#97](https://github.com/stjohnjohnson/extralife-helper-bot/pull/97))
- Restore the private connection token. ([#97](https://github.com/stjohnjohnson/extralife-helper-bot/pull/97))
- Reconnect Stream Avatars or reload the companion with F5. ([#97](https://github.com/stjohnjohnson/extralife-helper-bot/pull/97))
- A stopped companion cannot update its indicator. ([#97](https://github.com/stjohnjohnson/extralife-helper-bot/pull/97))
- Native graphical placement still requires an operator check. ([#97](https://github.com/stjohnjohnson/extralife-helper-bot/pull/97))

## [4.12.1](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.12.0...v4.12.1) (2026-10-12)

Internal maintenance; no user-facing changes.

# [4.12.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.11.0...v4.12.0) (2026-10-12)

### Changes

- Add automatic game-themed scenery with bundled artwork and static mappings. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))
- Include donation fixtures and all theme transitions in integration scenario `all`. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))
- Keep avatars unchanged while game changes trigger a welcoming jump. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))

### Upgrade actions

- Run `npm run sa:package`. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))
- Import `dist/stream-avatars/sa-helper-bridge.zip` into Stream Avatars. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))
- Restore your existing private connection address. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))
- Restore your existing private connection token. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))
- If you configured obsolete theme environment variables, remove them. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))
- The ZIP contains all 52 campaign and scenery images. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))
- Complete the broader OBS crop and seam checks during deployment acceptance. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))
- Complete the checks for other platforms during deployment acceptance. ([#88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88))

# [4.11.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.10.0...v4.11.0) (2026-10-12)

### Changes

- Releases describe final shipped changes and required upgrade actions using reviewed PR notes. ([#84](https://github.com/stjohnjohnson/extralife-helper-bot/pull/84))
- Contributors receive concise writing guidance and a PR template with explicit release-note and upgrade sections. ([#84](https://github.com/stjohnjohnson/extralife-helper-bot/pull/84))

### Upgrade actions

- Complete the template before merging human-authored PRs. Non-breaking Dependabot maintenance remains exempt. Preserve applicable BREAKING CHANGE: footers. ([#84](https://github.com/stjohnjohnson/extralife-helper-bot/pull/84))

# [4.10.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.9.0...v4.10.0) (2026-10-12)


### Bug Fixes

* **deps:** support major dependency updates from PR 61 ([84b80a9](https://github.com/stjohnjohnson/extralife-helper-bot/commit/84b80a9468fb71ce1945d6de6e57f91163aac9d1))
* **stream-avatars:** preserve campaign store error causes ([1d9428e](https://github.com/stjohnjohnson/extralife-helper-bot/commit/1d9428eb21234f2641dfafe835a4484da1bc3c23))


### Features

* **analysis:** show cumulative donations on viewer timeline ([b4f95fb](https://github.com/stjohnjohnson/extralife-helper-bot/commit/b4f95fbb0a83218967d70f4ec020d66ad35b287c))

# [4.9.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.8.0...v4.9.0) (2026-10-12)


### Bug Fixes

* accept native null milestones and improve celebration visuals ([cc959a7](https://github.com/stjohnjohnson/extralife-helper-bot/commit/cc959a778f86233a236c7a41759f1eed8d67de9c))
* align companion owned crowd names with integration runner ([cf370f5](https://github.com/stjohnjohnson/extralife-helper-bot/commit/cf370f596fb257ebd383250d3f67b3f4c2e93632))
* harden Stream Avatars lifecycle and deployment ([610d7ab](https://github.com/stjohnjohnson/extralife-helper-bot/commit/610d7abfbbfac169e74170f3d4b97ea22ad88375))
* install Lua CI prerequisites and verify reconnect cap ([a864f58](https://github.com/stjohnjohnson/extralife-helper-bot/commit/a864f581bca8fe54f9967cbe88fcb4bef59ae2bb))
* isolate Stream Avatars image loading from transport ([3ea9f9d](https://github.com/stjohnjohnson/extralife-helper-bot/commit/3ea9f9daa0a8a316a2d8ed87b3c94ddface12aa0))
* preserve donation celebration baselines across mixed scans ([2e4d2e7](https://github.com/stjohnjohnson/extralife-helper-bot/commit/2e4d2e7d587467077aa5980f6361b94576905bb6))
* preserve Stream Avatars recovery and effect ownership ([3962cab](https://github.com/stjohnjohnson/extralife-helper-bot/commit/3962cab94a614569431663a141f59b8c62513ba1))
* respect native avatar action cooldowns during celebrations ([e75e6ad](https://github.com/stjohnjohnson/extralife-helper-bot/commit/e75e6adaa58ed3b14946e916ed0bbaf47ac8d4a5))
* restore build and release test reliability ([3ecb3b5](https://github.com/stjohnjohnson/extralife-helper-bot/commit/3ecb3b5ca74d68aa8369cf02652db1368225db62))
* retain party bounds and dance history for delayed goal upgrades ([42b1ebb](https://github.com/stjohnjohnson/extralife-helper-bot/commit/42b1ebb573c0efac3e5089f95597304fb6d4a30a))
* retain recognition history across delayed extensions ([9dc21de](https://github.com/stjohnjohnson/extralife-helper-bot/commit/9dc21de71f7c83342b89e9ad45012d20e031e93e))
* start celebration dances from native wander state ([d5b56a8](https://github.com/stjohnjohnson/extralife-helper-bot/commit/d5b56a895704435290766b13dcbbe790bb62955e))
* support Stream Avatars embedded JSON slash escapes ([14b80c8](https://github.com/stjohnjohnson/extralife-helper-bot/commit/14b80c885f8711462eb92e09bb331de0c49ee94d))


### Features

* account for broadcast donations and fundraising thresholds ([550d4db](https://github.com/stjohnjohnson/extralife-helper-bot/commit/550d4db937c7f86503a04fecfbbbf2318455a3fc)), closes [hi#water](https://github.com/hi/issues/water)
* add authenticated Stream Avatars LAN bridge ([1b0fc7b](https://github.com/stjohnjohnson/extralife-helper-bot/commit/1b0fc7b5558b9aad03c180b0704e5fa99ed595e2))
* add isolated Stream Avatars rehearsal scenarios ([9a1a467](https://github.com/stjohnjohnson/extralife-helper-bot/commit/9a1a4678a14c8c4a8941fd286140fc78893b8948))
* add persistent broadcast sessions ([238a9b4](https://github.com/stjohnjohnson/extralife-helper-bot/commit/238a9b43ea1a0ed51ca07dee575e61349a5577e5))
* add Stream Avatars moving-heart companion ([c57ecef](https://github.com/stjohnjohnson/extralife-helper-bot/commit/c57ecef944b931107efab1c19c0eb4633f08c8e1))
* add verified donation source and exact money parsing ([dbffc58](https://github.com/stjohnjohnson/extralife-helper-bot/commit/dbffc582ccfe42619112d4ad06248506ab1a298a))
* compose and negotiate donation recognition metadata ([39da0c7](https://github.com/stjohnjohnson/extralife-helper-bot/commit/39da0c713919a919325a2b0c62423764f54a96b3))
* compose donation and goal celebrations over the avatar bridge ([9134565](https://github.com/stjohnjohnson/extralife-helper-bot/commit/91345659974dc6086d63c459e6d203cb76aca798))
* control Stream Avatars rehearsals from Twitch chat ([8ce171c](https://github.com/stjohnjohnson/extralife-helper-bot/commit/8ce171ce4d3b27687bcff07df7dc2600c34e26f7))
* display combined donation amount captions ([e5a46b2](https://github.com/stjohnjohnson/extralife-helper-bot/commit/e5a46b2930180cdeddb2ebaf52c8669e818b11f1))
* expose Twitch broadcast lifecycle observations ([9103e38](https://github.com/stjohnjohnson/extralife-helper-bot/commit/9103e382ae8f61fcbcf65525c28cf6ec689cb4de))
* integrate live donation accounting with existing polling and notifications ([b3e9525](https://github.com/stjohnjohnson/extralife-helper-bot/commit/b3e9525033fa9123b6bebe5b190d3f89c4f69ae8))
* package Stream Avatars companion and image catalog ([21af08a](https://github.com/stjohnjohnson/extralife-helper-bot/commit/21af08abd217ce95f6f0c41a7d333ca9ccc9614a))
* persist and recover broadcast donation progress ([67ea634](https://github.com/stjohnjohnson/extralife-helper-bot/commit/67ea63425ed87d8ad210f8f880465f193c0e3272))
* randomize donation jumps and paired hugs ([e55fd0d](https://github.com/stjohnjohnson/extralife-helper-bot/commit/e55fd0d33bc424f186f93877ce73db948ce593fc))
* render donation hearts and gold crowd celebrations ([6f1c865](https://github.com/stjohnjohnson/extralife-helper-bot/commit/6f1c8658da70410d302cf43a8d20c5b60c16efd2))
* render ordered campaign celebrations with protocol v3 ([58150b8](https://github.com/stjohnjohnson/extralife-helper-bot/commit/58150b8b174c7f76dbbe7c48802d1a40cfd54928))
* replace rehearsal with a temporary avatar integration runner ([a00f146](https://github.com/stjohnjohnson/extralife-helper-bot/commit/a00f146adc5ed165ab0c28a971cf190a79ef2786))
* sequence donation thanks before campaign parties ([b96f8bc](https://github.com/stjohnjohnson/extralife-helper-bot/commit/b96f8bc9c3ccbe6cc0238d47b9063c37aa65483c))
* track campaign progress independently of broadcasts ([95f4dd9](https://github.com/stjohnjohnson/extralife-helper-bot/commit/95f4dd94f783c12ba7bcdba7272e2ff05480e028))
* verify donation recognition through temporary integration ([0729539](https://github.com/stjohnjohnson/extralife-helper-bot/commit/0729539793be1d6e19d6f7d993ed54800278513f))

# [4.8.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.7.1...v4.8.0) (2026-10-08)


### Bug Fixes

* recover donation markers from startup and transport failures ([4bfe119](https://github.com/stjohnjohnson/extralife-helper-bot/commit/4bfe119a36006ffbe63f49723a672abc340f78a9))


### Features

* add configurable donation marker service ([c513822](https://github.com/stjohnjohnson/extralife-helper-bot/commit/c5138221b240dc800861658611b94326774c79bb))
* create markers for newly announced large donations ([e517e6e](https://github.com/stjohnjohnson/extralife-helper-bot/commit/e517e6e68cac0cd987d49f39f2f464e9b1223ea5))

## [4.7.1](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.7.0...v4.7.1) (2026-10-08)


### Bug Fixes

* left-align Discord voice overlay icons ([6fc4120](https://github.com/stjohnjohnson/extralife-helper-bot/commit/6fc412019641d7800339eadb2abb8ee722f77d76))

# [4.7.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.6.0...v4.7.0) (2026-10-07)


### Bug Fixes

* preserve pending intentional voice departures ([1ddd6ec](https://github.com/stjohnjohnson/extralife-helper-bot/commit/1ddd6ec5a880772589a3e18a8b16a98f5cad9f31))
* refresh Hue group membership before effects ([e6bab45](https://github.com/stjohnjohnson/extralife-helper-bot/commit/e6bab457014bbf22d93dd807121e971ab821bf54))


### Features

* coordinate Hue parties and donation celebrations ([6eeb25c](https://github.com/stjohnjohnson/extralife-helper-bot/commit/6eeb25c7199ab60e565e7b04d2e78666f384e2f1))
* enable opt-in Hue commands across Twitch and Discord ([4c2151d](https://github.com/stjohnjohnson/extralife-helper-bot/commit/4c2151d53d610c90656a7928faba2681cf8abaff))
* gate voice overlay connections on streamer presence ([874ec40](https://github.com/stjohnjohnson/extralife-helper-bot/commit/874ec40395271abe8a93e3389a4a45a4be60fe50))
* parse Hue chat colors ([d5fbe39](https://github.com/stjohnjohnson/extralife-helper-bot/commit/d5fbe39456520090d290f6c84828cee6a30e85a9))

# [4.6.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.5.0...v4.6.0) (2026-10-07)


### Bug Fixes

* animate Discord avatars only while speaking ([375eff1](https://github.com/stjohnjohnson/extralife-helper-bot/commit/375eff107feed60ae0992c98107e7d42f7f8e6af))
* exclude helper from voice participation counts ([a43175d](https://github.com/stjohnjohnson/extralife-helper-bot/commit/a43175dbab18ee2e0dc294e5a6109cd7297e08ec))
* recover voice overlay across Discord outages and shutdown ([25b3811](https://github.com/stjohnjohnson/extralife-helper-bot/commit/25b38119349871d932d83d9062f5699422bb320c))


### Features

* configure optional Discord voice overlay ([c347d73](https://github.com/stjohnjohnson/extralife-helper-bot/commit/c347d7386d316aaf96996aafe73c59634317b929))
* render responsive OBS voice avatars ([34cdc59](https://github.com/stjohnjohnson/extralife-helper-bot/commit/34cdc59edfb01b5d62260510928734f5c50f326e))
* serve voice overlay snapshots over the local network ([4acec0e](https://github.com/stjohnjohnson/extralife-helper-bot/commit/4acec0ed99cbd998a11851028c848e5a93ef9769))
* track live room avatars and speaking activity ([2d8b8f2](https://github.com/stjohnjohnson/extralife-helper-bot/commit/2d8b8f269483e4dc41cf3d2cf932adf841ce2410))

# [4.5.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.4.0...v4.5.0) (2026-10-02)


### Features

* add granular viewer and voice participation analytics ([1d3847b](https://github.com/stjohnjohnson/extralife-helper-bot/commit/1d3847bbf963efa28335b1e02979c5c5b8d55575))

# [4.4.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.3.1...v4.4.0) (2026-10-02)


### Bug Fixes

* prevent analysis double counting ([8cb174a](https://github.com/stjohnjohnson/extralife-helper-bot/commit/8cb174aa2f08e14569f1d1c2ee4eb9c9bd5ec6ca))
* show isolated viewer samples ([cee4be1](https://github.com/stjohnjohnson/extralife-helper-bot/commit/cee4be1ceccd45c1fecb48e80e8b05a385f00bb8))


### Features

* add deterministic log parser ([d31d50d](https://github.com/stjohnjohnson/extralife-helper-bot/commit/d31d50d6a7b70f5007afd9a8f680625fd3a608a8))
* annotate report timeline ([60d5f1a](https://github.com/stjohnjohnson/extralife-helper-bot/commit/60d5f1a7a509b3113a099eec3112ebdbe2692101))
* calculate event engagement metrics ([d79fe30](https://github.com/stjohnjohnson/extralife-helper-bot/commit/d79fe30260790329d0af4973e71ce51c46e1988f))
* clarify chat engagement signals ([d35f0de](https://github.com/stjohnjohnson/extralife-helper-bot/commit/d35f0de0b0c83075c867ca1967d27f05f427e528))
* detect event sessions and game timelines ([9c166e4](https://github.com/stjohnjohnson/extralife-helper-bot/commit/9c166e44a73d40f58c0378a5bdd69f199352c59d))
* emit structured analysis events ([3c9da3e](https://github.com/stjohnjohnson/extralife-helper-bot/commit/3c9da3ea65b3d281a1a77820fc3bec0d3f2bf34a))
* generate deterministic analysis reports ([aefcd98](https://github.com/stjohnjohnson/extralife-helper-bot/commit/aefcd98b5f875d92706ef6019d7bc06eb01dc5dd))

## [4.3.1](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.3.0...v4.3.1) (2026-10-02)


### Bug Fixes

* make bot lifecycle shutdown-safe ([60d4de4](https://github.com/stjohnjohnson/extralife-helper-bot/commit/60d4de45efad52af7eacfbbe870fef4a14b3288f))

# [4.3.0](https://github.com/stjohnjohnson/extralife-helper-bot/compare/v4.2.2...v4.3.0) (2025-11-10)


### Features

* add Philips Hue light celebrations for donations ([d770bd1](https://github.com/stjohnjohnson/extralife-helper-bot/commit/d770bd14a3e4f392a423e0bf6e13476de5321803))

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
