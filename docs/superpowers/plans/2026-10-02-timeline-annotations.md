# Timeline Axes and Event Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add quantitative axes, game-transition annotations, and donation markers to the deterministic HTML report timeline.

**Architecture:** Extend the existing SVG renderer into a coordinated viewer plot, game lane, and donation lane that share a timestamp-based X scale. Keep all rendering in `report.js`, reuse existing report data, and preserve deterministic, escaped, offline output.

**Tech Stack:** CommonJS Node.js 24+, inline SVG/CSS, Jest

**Spec:** `docs/plans/2026-10-02-timeline-annotations-design.md`

## Global Constraints

- Work only in the managed `log-analyzer` worktree.
- Do not add runtime dependencies or remote report assets.
- Identical input and options must produce byte-identical HTML.
- Escape every user-derived value used in SVG markup or tooltips.
- Keep the JSON report schema and metrics unchanged.
- Run `npm run lint` and `npm test` before committing.

## Review Focus

- A single timeline bin must render at a valid timestamp-based X position without division by zero.
- Zero-viewer timelines must receive a useful nonzero Y-axis range.
- Missing game segments or donations must leave a valid chart without phantom markers.
- Events crossing midnight must show correct local clock labels while elapsed labels remain monotonic.
- Long or hostile game, donor, and message text must be escaped and must not break SVG or script markup.

---

### Task 1: Specify the coordinated timeline contract

**Files:**
- Modify: `tests/analysis/report.test.js`

**Interfaces:**
- Consumes: `renderHtml(report, timezone) -> string`
- Produces: assertions for axis ticks, game lanes and transitions, donation markers and hover details, and safe optional-lane behavior

- [ ] **Step 1: Add focused fixtures and failing renderer tests**

Add a second game segment, representative donations, multiple timeline bins, and assertions for `viewer-axis`, `time-axis`, local-time and elapsed labels, `game-segment`, `game-transition`, `donation-marker`, legend text, and escaped `<title>` content. Add an optional-data case with no games or donations.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/analysis/report.test.js --runInBand`

Expected: FAIL because the current SVG contains only a baseline and viewer polyline.

### Task 2: Render timestamp-aligned axes and annotation lanes

**Files:**
- Modify: `src/analysis/report.js`
- Test: `tests/analysis/report.test.js`

**Interfaces:**
- Consumes: `metrics.timeline`, `metrics.eventWindow`, `report.sessions.gameSegments`, `metrics.donations.items`, and `timezone`
- Produces: `timelineSvg({ timeline, eventWindow, gameSegments, donations, timezone }) -> string`

- [ ] **Step 1: Add deterministic chart-scale helpers**

Implement timestamp X scaling, rounded Y bounds and ticks, duration-based X tick intervals, local 24-hour labels, elapsed labels, and deterministic clipping identifiers.

- [ ] **Step 2: Render the viewer plot axes and line**

Draw labeled axes, horizontal gridlines, X tick marks with both label forms, and viewer points positioned by bin midpoint timestamps.

- [ ] **Step 3: Render the game and donation lanes**

Draw clipped game bands, vertical transition lines after the first segment, native SVG titles, constant-size donation markers, and a visible legend. Omit optional markers cleanly when the corresponding arrays are empty.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- tests/analysis/report.test.js --runInBand`

Expected: PASS.

- [ ] **Step 5: Run the full suite after refactoring**

Run: `npm test`

Expected: all tests pass with no warnings or errors.

### Task 3: Regenerate and verify the acceptance report

**Files:**
- Generated, ignored: `reports/extralife-2025.html`
- Generated, ignored: `reports/extralife-2025.json`

**Interfaces:**
- Consumes: the primary checkout's absolute `extralife-2025.log` path
- Produces: an updated local report with viewer axes, 15 game transitions, and 29 donation markers

- [ ] **Step 1: Run the analyzer against the 2025 log**

Run: `npm run analyze -- /Users/stjohn/Sites/github.com/stjohnjohnson/extralife-helper-bot/extralife-2025.log`

Expected: deterministic HTML and JSON outputs under `reports/`.

- [ ] **Step 2: Inspect generated marker counts and visually review the SVG**

Verify both axes are legible, 16 game segments produce 15 boundary markers, all 29 confirmed donations appear, and labels do not obscure the viewer line.

- [ ] **Step 3: Run final verification**

Run: `npm run lint`, then `npm test`, then `git diff --check`, then `git status --short`.

Expected: lint and tests pass, no whitespace errors, and only the intended source, test, and documentation files are pending.

- [ ] **Step 4: Commit the completed change**

Use a detailed Conventional Commit describing the SVG timeline enhancement, privacy-safe tooltip handling, absence of new configuration, and cross-platform browser behavior.
