# Configuration reference

[README](../README.md) · [Setup](setup.md) · [Commands](commands.md)

Copy `env.example` to `.env`, then replace its required placeholders.
The local bot loads `.env` at startup.
For Docker, supply the file with `--env-file .env`.
Existing process environment values take precedence over `.env` values.
Keep credentials private and outside Git.

## Required core settings

Startup requires every setting in this table.
Discord, Twitch, voice management, game updates, and Hue cannot be disabled through partial configuration.
Required values must be nonempty; successful startup validation does not verify credentials or channel access.

| Setting | Value |
| --- | --- |
| `EXTRALIFE_PARTICIPANT_ID` | Extra Life participant ID |
| `DISCORD_TOKEN` | Discord bot token |
| `DISCORD_DONATION_CHANNEL` | Text channel ID for donation announcements |
| `DISCORD_SUMMARY_CHANNEL` | Channel ID whose name shows fundraising progress |
| `DISCORD_WAITING_ROOM_CHANNEL` | Voice channel ID for waiting participants |
| `DISCORD_LIVE_ROOM_CHANNEL` | Voice channel ID for live participants |
| `DISCORD_GAME_UPDATE_USER_ID` | Discord user ID monitored for game changes and voice participation |
| `TWITCH_USERNAME` | Bot account login name |
| `TWITCH_CHAT_OAUTH` | Bot-account chat access token, prefixed with `oauth:` |
| `TWITCH_CHANNEL` | Broadcaster channel login name, without `#` |
| `TWITCH_CLIENT_ID` | Twitch application's client ID |
| `TWITCH_CLIENT_SECRET` | The same application's client secret |
| `TWITCH_REFRESH_TOKEN` | Broadcaster-account refresh token with `channel:manage:broadcast` |
| `HUE_USERNAME` | Hue bridge API username |
| `HUE_IPADDRESS` | Hue bridge IP address |
| `HUE_GROUPID` | Hue group ID for donation celebrations and chat colors |

The broadcaster refresh token must belong to the application identified by `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.
Chat credentials and broadcaster API credentials serve different accounts and purposes.
See [credential setup](setup.md#twitch).

## Commands and notifications

| Setting | Default | Valid values and effect |
| --- | --- | --- |
| `DISCORD_ADMIN_USERS` | Empty | Comma-separated Discord user IDs; spaces around entries are removed |
| `TWITCH_ADMIN_USERS` | Empty | Comma-separated Twitch login names; comparisons ignore case |
| `DISCORD_GAME_UPDATE_MESSAGE` | `Now playing {game}!` | Twitch chat notification after a category update; the first `{game}` is replaced |
| `CUSTOM_RESPONSES` | Empty | Comma-separated `command:"response"` pairs; see [custom commands](commands.md#custom-commands) |
| `HUE_CHAT_CONTROL_ENABLED` | `false` | Exactly `true` or `false`; enables `!color` for everyone on both platforms |
| `STREAM_MARKER_DONATION_THRESHOLD` | Disabled | Positive USD amount with at most two decimal places; blank also disables markers |

An empty admin list grants no admin-command access on that platform.
Discord server roles and Twitch moderator or broadcaster badges do not grant bot admin access.
Hue donation celebrations remain active when chat light control is disabled.
See [donation markers](stream-markers.md) for live-stream and recording requirements.

## Analytics sampling

| Setting | Default | Valid values |
| --- | --- | --- |
| `TWITCH_VIEWER_SAMPLE_INTERVAL_SECONDS` | `60` | Integer seconds from `15` to `3600` |
| `DISCORD_VOICE_SAMPLE_INTERVAL_SECONDS` | `60` | Integer seconds from `15` to `3600` |

Both collectors start with the bot.
Voice monitoring follows `DISCORD_GAME_UPDATE_USER_ID` within the guild containing `DISCORD_DONATION_CHANNEL`.
It does not always use the fixed live room.
See [sampling and report limitations](log-analysis.md#viewer-and-voice-samples).

## Shared web listener and OBS overlay

| Setting | Default | Valid values and effect |
| --- | --- | --- |
| `VOICE_OVERLAY_ENABLED` | `false` | Exactly `true` or `false` |
| `WEB_HOST` | `0.0.0.0` | Nonempty listener address; this default accepts connections on all network interfaces |
| `WEB_PORT` | `3000` | Integer port from `1` to `65535` |
| `VOICE_OVERLAY_HOST` | Unset | Legacy fallback when `WEB_HOST` is absent |
| `VOICE_OVERLAY_PORT` | Unset | Legacy fallback when `WEB_PORT` is absent |

The overlay and Stream Avatars share one listener.
The listener starts when either integration is enabled.
The overlay uses `/voice` and `/voice/events`; Stream Avatars uses `/sa/socket`.
The legacy settings also affect this shared listener when the corresponding `WEB_*` setting is absent.
An explicitly empty `WEB_*` value does not select the legacy fallback.

For Docker web integrations, publish the configured port.
Limit access to the computers that need the listener.
The voice overlay has no login and displays participant identities and speaking activity.
See [OBS setup and network access](voice-overlay.md).

## Stream Avatars

| Setting | Default | Valid values and effect |
| --- | --- | --- |
| `STREAM_AVATARS_ENABLED` | `false` | Exactly `true` or `false` |
| `STREAM_AVATARS_TOKEN` | Empty | Private shared token of `16`–`256` characters; required when enabled |
| `STREAM_AVATARS_DONATION_INTERVAL_CENTS` | `50000` | Integer cents from `1` to `100000000`; default milestone interval is $500 |
| `STREAM_AVATARS_STATE_DIR` | `./data/stream-avatars` | Nonempty writable directory; relative paths use the process working directory |

Persistent campaign and game files are stored beneath `production/` in the state directory.
Use a separate state directory for each instance.
Changing the milestone interval establishes a silent baseline.
Existing donations do not produce historical milestone effects.
Game mappings and scenery ship with the bot; no theme environment settings are needed.
The retired `STREAM_AVATARS_OFFLINE_GRACE_SECONDS` setting is ignored.
See [Stream Avatars setup](stream-avatars-setup.md) for token generation, companion settings, storage, and recovery.

## Logging and compatibility

| Setting | Default | Effect |
| --- | --- | --- |
| `LOG_LEVEL` | `info` | Winston level: `error`, `warn`, `info`, `http`, `verbose`, `debug`, or `silly` |
| `TWITCH_API_OAUTH` | Unset | Legacy parsed value; it does not supply API authentication |

`LOG_LEVEL` is read when the logger module loads, before local `.env` hydration.
For local execution, set it in the process environment: `LOG_LEVEL=debug npm start`.
Docker's `--env-file` supplies it before the logger loads.
API calls use the broadcaster refresh-token flow regardless of `TWITCH_API_OAUTH`.
Leave the legacy API value unset.

`NODE_ENV=test` suppresses local `.env` loading for tests.
Normal local execution needs no `NODE_ENV` setting; the Docker image sets it to `production`.

## Configuration errors

Missing required settings, malformed custom commands, invalid marker amounts, and invalid sampling values prevent startup.
Invalid Hue chat or overlay flags also prevent startup.
Invalid listener settings prevent startup when the voice overlay is enabled.
Invalid Stream Avatars settings disable that integration and produce a warning; core services continue.
If both integrations are enabled, invalid listener settings still prevent startup through overlay validation.
A listener bind failure disables the web integrations while core services continue.
A failed Hue connection skips light celebrations; its credentials remain required by startup validation.
