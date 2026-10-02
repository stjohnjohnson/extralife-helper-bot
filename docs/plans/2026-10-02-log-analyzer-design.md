# Deterministic Log Analyzer Design

## Goal

Build an offline, deterministic analyzer for one Extra Life event log at a time. It produces a private, self-contained HTML planning report and a versioned JSON sidecar covering game schedules, viewer behavior, Twitch chat, and donations.

## Architecture

The Node.js CLI accepts a legacy mixed-text log or future structured event log. Adapters normalize records into timestamped events with source-line provenance and confidence, a session selector chooses the longest stitched live event, a metrics layer computes fixed statistics, and a renderer writes byte-stable JSON and HTML without network access.

Future bot logs retain their readable Winston messages while adding `eventVersion` and `eventType` metadata. Donation IDs and full chat timestamps remove the main ambiguities found in the 2025 log.

## Event Selection

Viewer samples are grouped by Twitch `startedAt`. Matching channel/title sessions separated by at most ten minutes are stitched, and the longest stitched event becomes the headline window. Other sessions remain visible in diagnostics. A terminal game stop within ten minutes closes the event; otherwise the end is one median sampling interval after the final viewer sample, capped at ten minutes.

Game transitions are confirmed against Twitch categories and viewer samples. `game -> none -> game` presence gaps of at most two minutes are collapsed to avoid treating Discord presence flicker as a real segment.

## Report

The report includes an overview, a 15-minute timeline, game segments and aggregate games, viewer trends and transition windows, chat participation and lexical trends, donation patterns, and a data-quality panel. Games with less than 30 minutes of coverage are visible but excluded from rankings. Rankings remain separate by metric; the report does not invent a composite score or make causal claims.

Names and messages are shown because the report is for private local use. All values are safely escaped, generated files are ignored by Git, and the report displays a private-data notice.

## Failure Handling

Malformed or unknown lines are retained in diagnostics with source line numbers. Ambiguous legacy timestamps and donations are labeled and excluded from calculations requiring certainty. Invalid options, unreadable input, and undetectable event windows fail with nonzero status unless a valid manual window is supplied.

## Verification

Synthetic fixtures cover parsing, session selection, timelines, metrics, deterministic rendering, privacy-safe escaping, and CLI failures. Local acceptance uses the ignored `extralife-2025.log` and must reconcile 1,173 lines, exclude the short October test stream, stitch both marathon stream IDs, and retain 300 marathon viewer samples.
