# Event logs and reports

[README](../README.md) · [Configuration](configuration.md)

The offline analyzer creates an HTML event report and inspectable JSON from a bot log.
It selects the longest live event and joins brief Twitch reconnects.
The analyzer runs locally and needs no bot credentials.

## Save a log

The bot writes logs to the console; it does not create a log file automatically.
For a local run, capture both output streams:

```sh
npm start > extralife.log 2>&1
```

For an existing Docker container, export its available logs:

```sh
docker logs CONTAINER_NAME > extralife.log 2>&1
```

Docker log retention depends on the container's logging configuration.
A removed container cannot supply its old logs.
Keep `LOG_LEVEL=info` or a more detailed level during collection.
Higher severity filters omit the samples and events needed for analysis.

## Generate a report

Use the [supported local Node.js version](setup.md#run-locally) and install dependencies with `npm ci`.
Then run:

```sh
npm run analyze -- /path/to/extralife.log
```

The default outputs are `reports/<log-name>.html` and `reports/<log-name>.json`.
Git ignores generated reports.

| Option | Effect |
| --- | --- |
| `--output-dir <path>` | Change the output directory |
| `--timezone <iana-name>` | Change displayed times; default is `America/Los_Angeles` |
| `--bot-user <name>` | Add a bot exclusion; repeat for multiple bots |
| `--start <iso-time> --end <iso-time>` | Select a manual event window |

Default bot exclusions are `stjohnbot` and `streamelements`.
Supply both manual timestamps together, with the start before the end.
Use explicit timezone offsets in those timestamps.
A manual window is useful when the log has no usable Twitch viewer samples.

```sh
npm run analyze -- extralife.log \
  --bot-user anotherhelperbot \
  --timezone America/Los_Angeles
```

## Read the report

The report covers game durations, viewer levels, chat participation, emote use, donation timing, and data-quality warnings.
The viewer timeline shows viewers on the left axis and cumulative event donations on the right.
Hover over a gold donation step for the amount and running total.
Games with less than 30 minutes of coverage appear in the report but are excluded from rankings.
Comparisons show associations; they do not establish that a game caused a viewer or donation change.

## Viewer and voice samples

Both sampling intervals default to 60 seconds and accept integer values from 15 to 3600.
Twitch records online and offline samples.
API failures remain collection errors rather than zero-viewer observations.

Discord follows `DISCORD_GAME_UPDATE_USER_ID` within the guild containing `DISCORD_DONATION_CHANNEL`.
Total humans include the monitored user; companions exclude that user; bot counts are separate.
The helper bot is excluded from participation counts.
Voice events retain counts and guild/channel identifiers, without member names or user IDs.
Voice sampling records no audio or speaking activity.

Voice samples occur at startup, relevant count or channel changes, and regular intervals.
Only periodic observations contribute to average, median, peak, start, and end summaries.
All observations appear on the timeline.
Reports show cadence, sample sizes, coverage, gaps, and service failures.
Coverage combines successful periodic sampling intervals within each report window.
Missing data remains unavailable; confirmed disconnection and offline Twitch samples are valid zero observations.

## Older logs and privacy

Older mixed-text logs have three limitations:

- Chat dates are inferred from surrounding timestamped records.
- Donation totals include only records confirmed by their chat notification and status update.
- Emotes use an exact-name catalog because older logs lack Twitch tags.

Ambiguous records appear in diagnostics and are excluded from totals that need certainty.
Current logs include structured metadata, donation IDs, full chat timestamps, and Twitch emote tags.
Historical metrics remain available with the cumulative donation overlay.

Logs and reports can contain donor names, usernames, donation messages, and chat text.
Review them before sharing.
Keep private reports and raw logs outside Git.
