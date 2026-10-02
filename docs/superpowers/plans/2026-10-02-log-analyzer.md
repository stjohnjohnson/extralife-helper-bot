# Deterministic Helper-Bot Log Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate deterministic local HTML and JSON analysis of one helper-bot event log.

**Architecture:** Parse legacy and versioned log records into one normalized event model, select the longest stitched live event, calculate fixed engagement and fundraising metrics, and render offline artifacts. Add structured metadata to future runtime logs without changing bot behavior.

**Tech Stack:** Node.js 24 CommonJS, Jest 30, ESLint 9, built-in filesystem/URL/Intl APIs, inline SVG/CSS/JavaScript.

**Spec:** `docs/plans/2026-10-02-log-analyzer-design.md`

## Global Constraints

- Work only in the isolated `codex/log-analyzer` worktree.
- Make identical inputs and options byte-stable; do not use network data, random IDs, or generation timestamps.
- Preserve readable logs and never emit credentials or full tokens.
- Keep generated reports and the supplied 2025 log out of Git.
- Use test-first RED-GREEN cycles and Conventional Commits with detailed bodies.

## Review Focus

- Time-only chat messages around UTC midnight must resolve monotonically or remain explicitly ambiguous.
- Raw chat/donation strings containing HTML or `</script>` must not execute in the report.
- Startup donation inventory must not inflate live-event fundraising.
- Short stream tests and brief marathon reconnects must not be selected as separate headline events.
- Missing viewer samples must reduce coverage instead of being interpreted as zero viewers.

---

### Task 1: CLI Contract and Normalized Parser

**Files:** Create `scripts/analyze.js`, `src/analysis/options.js`, `src/analysis/parser.js`, `tests/analysis/options.test.js`, `tests/analysis/parser.test.js`, and fixtures; modify `package.json` and `.gitignore`.

**Interfaces:** Produce `parseArguments(argv)`, `parseLog(text)`, and normalized events with `type`, `timestamp`, `line`, `confidence`, and `data`.

- [ ] Write and run failing option-validation and parser tests.
- [ ] Implement the CLI contract, legacy/structured parsing, provenance, timestamp inference, donation classification, and diagnostics.
- [ ] Run focused tests and the full suite, then commit.

### Task 2: Event Windows and Game Timeline

**Files:** Create `src/analysis/sessions.js` and `tests/analysis/sessions.test.js`.

**Interfaces:** Consume normalized events; produce `{ selected, excluded, gaps, gameSegments }`.

- [ ] Write and run failing tests for stitching, selection, terminal inference, gaps, manual windows, and presence flaps.
- [ ] Implement deterministic window and game-segment construction.
- [ ] Run focused tests and the full suite, then commit.

### Task 3: Metrics

**Files:** Create `src/analysis/metrics.js`, `src/analysis/stopwords.js`, and `tests/analysis/metrics.test.js`.

**Interfaces:** Consume normalized in-window events and session output; produce versioned overview, timeline, game, viewer, chat, donation, ranking, and diagnostic data.

- [ ] Write and run failing tests with hand-calculated fixture expectations.
- [ ] Implement 15-minute bins, viewer/game statistics, transition windows, chat/lexical measures, donation measures, and low-coverage ranking exclusion.
- [ ] Run focused tests and the full suite, then commit.

### Task 4: Deterministic Report and CLI Integration

**Files:** Create `src/analysis/report.js`, `src/analysis/run.js`, `tests/analysis/report.test.js`, and `tests/analysis/cli.test.js`; modify `scripts/analyze.js`.

**Interfaces:** Produce stable `<stem>.json` and `<stem>.html` files from a log path and validated options.

- [ ] Write and run failing determinism, escaping, offline-asset, output-path, and exit-code tests.
- [ ] Implement stable JSON serialization, inline report rendering, atomic output writes, and CLI status messages.
- [ ] Run focused tests and the full suite, then commit.

### Task 5: Future Structured Events

**Files:** Create `src/analysis/eventMetadata.js` and tests; modify `app.js`, `src/viewerMonitoring.js`, `src/gameUpdates.js`, `src/commands.js`, and their tests.

**Interfaces:** Produce `eventMetadata(eventType, payload)` as `{ eventVersion: 1, eventType, ...payload }` and attach it to existing readable logs.

- [ ] Write and run failing event-metadata and runtime-log tests.
- [ ] Add donation IDs/amounts, chat timestamps/identity, viewer samples, game changes, commands, and service-failure metadata without behavior changes.
- [ ] Run focused tests and the full suite, then commit.

### Task 6: Documentation and Acceptance

**Files:** Modify `README.md`; generated `reports/` remains ignored.

**Interfaces:** Document the supported CLI and interpretation/privacy contract.

- [ ] Run analyzer integration tests and the supplied 2025 log acceptance checks.
- [ ] Document usage, metrics, privacy, legacy limitations, and options.
- [ ] Run lint, the complete test suite, deterministic reruns, and diff review; commit and leave the worktree clean.
