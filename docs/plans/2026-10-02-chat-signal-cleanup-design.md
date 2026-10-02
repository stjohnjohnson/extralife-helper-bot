# Chat Signal Cleanup Design

## Goal

Make chat metrics reflect actual participants and recognizable Twitch emotes, while removing low-signal lexical output and the implementation-oriented coverage column from the HTML report.

## Bot Classification

`stjohnbot` and `streamelements` become default bot users for this repository. Repeated `--bot-user` values remain supported and are merged with those defaults, deduplicated, normalized to lowercase, and written to report options so exclusions remain inspectable.

The existing message-pattern heuristics remain as a fallback for legacy notifications from other bot names. Bot exclusion continues to affect human message, chatter, command, link, per-game chat, timeline, and transition metrics.

## Emote Detection

Future structured chat logging will preserve an `emotes` array derived from Twitch/TMI emote tags. Repeated uses remain repeated in the array so counts are exact.

Legacy logs contain rendered chat text but no Twitch tags. They will use a checked-in, case-sensitive catalog of common Twitch emote names plus the channel-specific `ExtraLife` emote. Token matching is exact; arbitrary CamelCase words are not guessed as emotes.

Chat metrics will retain `emoteCount` as the human-emote total for compatibility and add `botEmoteCount` plus `topEmotes`. Each ranked emote records total, human, and bot uses. The HTML will label human and bot emote totals separately and show a ranked emote table, preventing automated donation/raid emotes from being mistaken for audience behavior.

## Report Simplification

Remove `Coverage samples` from the HTML game table; the sample count remains in JSON and continues to support diagnostics and calculations. Remove `Top words` and `Top phrases` from HTML while retaining their inspectable JSON metrics for compatibility. Keep top chatters and the other participation metrics.

## Verification

Tests will cover default and custom bot merging, bot exclusion across metrics, repeated legacy and structured emotes, human/bot emote separation, stable emote ranking, structured-log tag extraction, lexical-panel removal, and the simplified game-table header. Acceptance will regenerate the 2025 report and verify 224 human messages, 73 bot messages, 25 human chatters, 116 `ExtraLife`, 2 `PogChamp`, and 1 `LUL` use within the selected event.
