# Donation Stream Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Automatically create one Twitch marker per newly announced Extra Life donation meeting an explicitly configured USD threshold.

**Architecture:** A runtime marker service reuses Twitch auth and HTTPS helpers, and receives new donations from app.js. Optional cancellation and numeric HTTP status errors extend the shared request helper. No durable queue or retry, no game markers.

**Tech Stack:** Node.js 24.x (24.15.0 or newer), CommonJS, native HTTPS/AbortController, Jest, ESLint.

**Spec:** docs/plans/2026-10-07-donation-stream-markers-design.md

## Global Constraints

- Isolated codex/ branch; preserve primary and unrelated worktrees.
- Disabled when threshold is unset or blank. Positive USD amount with up to two decimal places; inclusive comparison in cents.
- 140-character descriptions, one marker per new donation, no artificial cap.
- Existing 30-second donation polling and game/category behavior remain intact.
- Silent startup/repeated IDs never create markers. Offline or failed writes never replay.
- Operations expire after 10 seconds; stop cancels pending writes. Never log credentials.
- npm ci, npm run lint, and complete npm test; green CI before handoff.

## Review Focus

- Unicode names must not be split into invalid surrogate pairs.
- Late auth after shutdown/timeout must not cause a marker write.
- Overlapping polls must not mark or announce startup history.
- Auth, HTTP 429/404, and malformed success responses must not interrupt donations.
- A 100-donation burst must retain individual markers and exact donor descriptions.

### Task 1: Configurable marker service

**Files:** src/config.js, src/gameUpdates.js, new src/streamMarkers.js; tests/config.test.js, tests/gameUpdates.test.js, new tests/streamMarkers.test.js.

**Interfaces:**
- Produces `config.streamMarkers.donationThresholdCents: number|null`.
- Produces `createStreamMarkerService(config, logger) -> { markDonation(donation): Promise<object|null>, stop(): void }`.
- Consumes `getValidAccessToken(config, logger)`, `getBroadcasterIdFromChannel(channel, clientId, accessToken)`, `makeTwitchApiRequest(path, options, clientId, accessToken)`; options gains AbortSignal support and errors gain statusCode.

- [x] Write failing tests for unset/blank/invalid threshold, decimal amounts, inclusive qualification, safe description formatting, exact POST body, auth/lookup sharing, 100 markers, offline and rate-limit failures, timeout and stop including late auth.
- [x] Run `npm test -- --runInBand tests/config.test.js tests/gameUpdates.test.js tests/streamMarkers.test.js --coverage=false`. Expected: failures identify missing marker configuration/service/cancellation support.
- [x] Implement configuration and service, preserving existing API callers. Abortable marker operations use a 10-second deadline; log structured IDs/status without tokens or response bodies. No retries.
- [x] Run targeted tests. Expected: all pass.
- [x] Run `npm run lint` and `npm test`. Expected: clean lint and entire suite passes, including coverage thresholds.
- [x] Commit verified service changes with conventional message and detailed body.

### Task 2: Runtime integration and operator documentation

**Files:** app.js, tests/app.test.js, README.md, env.example.

**Interfaces:**
- Consumes Task 1 config and service interfaces; app startup creates service, new donations call markDonation, stop calls service.stop.
- Produces nonblocking runtime donation markers with safe startup and teardown.

- [x] Write failing app tests exercising the real service with Twitch API boundary doubles: silent startup, exact inclusive boundary, repeated IDs, mixed/multiple qualifying donations, disabled feature, blocked/failing requests that leave chat/Hue working, stop, and overlapping startup polls.
- [x] Run `npm test -- --runInBand tests/app.test.js --coverage=false`. Expected: failures identify missing donation marker integration.
- [x] Wire service into app lifecycle and announced donation flow; preserve donation objects until notification dispatch. Guard overlapping polls so initial silent load cannot race live polling.
- [x] Document threshold examples, broadcaster scope, VOD prerequisites, 140-character descriptions, timing, per-donation batches, failures, and restart behavior. Leave env.example threshold blank.
- [x] Run `npm run lint` and `npm test`. Expected: entire suite and coverage gates pass.
- [x] Commit only task files. Review whole branch and fix findings with regression tests.

Delivery: push and create PR against main, attach PR to this chat, and verify required CI.
