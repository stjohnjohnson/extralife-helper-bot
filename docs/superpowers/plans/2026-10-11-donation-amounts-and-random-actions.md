# Donation Amounts and Random Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implement inline in the existing task worktree; this small follow-up does not need task delegation.

**Goal:** Show combined donation amounts outside parties and randomly choose crowd jump or paired hug recognition, while retaining milestone/goal dancing.

**Architecture:** Extend authoritative donation intents with exact batch amount/count, then accumulate them in the existing bounded composer window. Send strict numeric/action metadata under a new companion capability. Render fixed bitmap phrases and run native paired hugs in the Lua companion; the temporary subsystem runner can force either action for testing.

**Tech Stack:** Node.js 24.x, CommonJS, Jest, Lua 5.2-compatible companion/MoonSharp, PNGJS and the existing native ZIP generator.

**Spec:** `docs/plans/2026-10-11-donation-amounts-and-random-actions-design.md`

## Global Constraints

- Requires Node.js 24.x (24.15.0 or newer); use `npm ci` for dependencies.
- Reuse `/Users/stjohn/.codex/worktrees/live-donation-celebrations/extralife-helper-bot`, branch `codex/live-donation-celebrations`; never edit the primary checkout.
- No new dependencies, production configuration, persisted-state migration, arbitrary command/caption text, or donor-to-avatar mapping.
- Copy: `$25 - THANK YOU!`; `$25 FROM 2 DONATIONS - THANK YOU!`; generic `THANK YOU!` only when an amount is hidden.
- Hearts: five seconds, at most ten seconds from original recognition start. Milestone: 18 seconds; goal: 20 seconds; combined upgrade maximum: 38 seconds.
- One 50/50 jump/hug choice per recognition window; one initiating hug per randomly matched pair; odd/solo fallback jump.
- Donation amounts/actions appear only outside parties. Gifts suppressed by a party do not replay later.
- Keep 101 active-avatar, 32 confetti, 48 caption-object and 128 pending-image-load limits.
- Native hugs finish themselves; never forcibly exit an initiator or its Targeted partner. Preserve existing dance cleanup.
- Complete lint/tests before each commit; push/update existing PR #72; required CI must pass; leave worktree clean; do not merge.

## Review Focus

- A historical hidden amount is revealed alongside a fresh gift: show only fresh accepted money, never the cumulative delta.
- A delayed goal confirmation contains no new gifts: do not create an amount caption or random recognition action.
- A party ends while recent gift hearts remain: suppressed amount/actions never appear afterwards.
- A hug pair's target leaves or starts another action during native travel: avoid reciprocal commands/forced cleanup and verify native target release on the host.
- An old companion authenticates successfully but rejects new fields: reject its missing capability before reporting readiness or delivery.

---

### Task 1: Attribute, compose and transport recognition metadata

**Files:**
- Modify: `src/broadcastSession/donations.js`, `src/streamAvatars/celebrations.js`
- Test: `tests/broadcastDonationState.test.js`, `tests/donationIntegration.test.js`, `tests/streamAvatarsCelebrations.test.js`

**Interfaces:**
- `reduceDonations(state, input)` retains its return shape; `intent` adds `donationCount: number` and `donationTotalCents: number|null`.
- `createCelebrationComposer({ clock, random = Math.random })` retains accept/clear/stop. `accept(intent)` adds the two amount fields plus `recognitionStartedAtMs: number|null` and `recognitionAction: 'jump'|'hug'|null` to output.

- [ ] Add failing reducer assertions: gifts 1000+1500+duplicate -> count 2/total 2500; historical null-to-60000 revelation plus fresh 1000 -> count 1/total 1000; fresh null then same-scan known -> accepted ledger amount; remaining hidden gift -> null; delayed goal-only intent -> count 0/total 0; replay/reconcile/ended session -> no new intent.
- [ ] Run `npm test -- --runInBand --coverage=false tests/broadcastDonationState.test.js tests/donationIntegration.test.js`; confirm missing metadata causes failure.
- [ ] Compute intent amount/count from `newIds` and the final accepted ledger using existing `addCents`. Preserve conflicts, exclusions, unknown accounting and silent reconciliation.
- [ ] Add failing composer cases with injected random draws: 0 and 0.499 -> jump; 0.5 and 0.999 -> hug. Two different gifts at 1000/5000 accumulate 2500 and count 2, retain start 1000/action, and draw once. At the ten-second cap a later window resets totals/start and draws again. Include hidden-total propagation, safe-integer overflow, session change, clear/stop, and goal-only output.
- [ ] Implement accumulation/reset alongside existing recognition lifetime. Reuse checked cent arithmetic. Keep count/amount zero and start/action null without a recognition window. Never use cumulative live-total subtraction.
- [ ] Run the reducer/composer target suites; update direct intent fixtures to supply realistic metadata rather than defaulting absent production fields.
- [ ] Continue with the transport steps below before committing: adding composer fields and exact wire validation must land together so real consumers stay compatible.

#### Task 1 continued: Carry strict fields and fence old companions

**Files:**
- Modify: `src/streamAvatars/protocol.js`, `src/streamAvatars/server.js`, `src/streamAvatars/index.js`, `integrations/stream-avatars/companion.lua`
- Test: `tests/streamAvatarsProtocol.test.js`, `tests/streamAvatarsServer.test.js`, `tests/streamAvatarsEvents.test.js`, `tests/streamAvatarsIntegration.test.js`, `tests/streamAvatarsCompanion.test.js`, `tests/lua/companionHarness.lua`

**Interfaces:**
- Version-2 celebration adds exactly `donationCount`, `donationTotalCents`, `recognitionStartedAtMs`, `recognitionAction` from the composer above.
- Ready/snapshot capability lists support five entries and include `donation-recognition`. Ready admission/client counts require both that capability and `celebrations`.

- [ ] Add failing Node validation tests for valid single/batch/hidden/goal-only packets and fractional, negative, overflow, unknown-action, inconsistent null/count/start, future start, extended hearts, extra-field cases. Include actual serialized null packets in Lua.
- [ ] Add server tests: old `celebrations`-only companion receives import-latest rejection and is never ready/delivered; upgraded companion gets the new strict fields over a real authenticated WebSocket. Preserve legacy hearts transport behavior.
- [ ] Run protocol/server/event target suites and Lua contracts; confirm new fields/capability fail before production edits.
- [ ] Update exact schemas and cross-field validation in Node/Lua according to spec. Extend feature lists/cardinality, admission, readiness counters and error text. Retain `jsonNull` for native userdata nulls and all existing timestamp/session/generation/message-size limits.
- [ ] Update ready/snapshot/celebration fixtures across existing tests and real Node-to-Lua packet generation. Add a mutation that removes the capability gate and prove its readiness test rejects it.
- [ ] Run target suites and full suite/lint; commit `feat: compose and negotiate donation recognition metadata`, with explanatory body paragraphs. Do not ship a sender that reports delivery to an older strict Lua package.

### Task 2: Render the combined amount caption

**Files:**
- Modify: `scripts/sa-assets.js`, `integrations/stream-avatars/companion.lua`
- Create: `integrations/stream-avatars/assets/sa_separator.{png,json}`, `sa_from.{png,json}`, `sa_donations.{png,json}`
- Test: `tests/streamAvatarsAssets.test.js`, `tests/streamAvatarsPackage.test.js`, `tests/streamAvatarsCompanion.test.js`, `tests/lua/companionHarness.lua`

**Interfaces:**
- Fixed assets: `sa_separator` -> ` - `; `sa_from` -> ` FROM `; `sa_donations` -> ` DONATIONS - `.
- Ordinary caption consumes recognition count/amount. Milestone/goal still consume cumulative live total and their existing fixed caption assets.

- [ ] Add failing asset/package tests for all three transparent manifests, deterministic regeneration and correct bitmap dimensions. Add hyphen support to the existing font; use manifest-derived assertions for Lua phrase dimensions. Expected catalog becomes 22 packaged images (19 existing + 3).
- [ ] Add Lua scenarios asserting single $25, batch $25/count 2, $25.50, whole dollars without dot, hidden total generic Thank you, and cumulative $500 never mistaken for donation amount.
- [ ] Add party cases: milestone/goal have no amount/count phrases; gifts near party expiry leave hearts but never expose their suppressed amount afterwards. Include upgrade from ordinary to party, then an actually fresh ordinary window after party completion.
- [ ] Add long-number/small/negative/resized-canvas and amount-shortening cases proving clamping, caption-object release and existing caps.
- [ ] Run target tests and confirm missing assets/ordinary caption behavior fail.
- [ ] Generate assets with `node scripts/sa-assets.js`; update ordinary caption composition, per-window metadata and permanent party suppression. Rebuild glyph objects on amount/count changes without resetting action-issued tracking. Never add a second caption layer/row.
- [ ] Run assets/package/Lua suites, lint and full tests; commit `feat: display combined donation amount captions`.

### Task 3: Random jump or paired native hug

**Files:**
- Modify: `integrations/stream-avatars/companion.lua`
- Test: `tests/lua/companionHarness.lua`, `tests/streamAvatarsCompanion.test.js`

**Interfaces:**
- Companion consumes Task 1's stable recognition start/action. Its per-window handled set replaces the jump-only set without changing dance ownership.
- Allowed fixed commands: quiet localized jump; quiet localized hug plus validated native internal target ID.

- [ ] Extend the harness native-command model to count hug initiators/partners and model asynchronous Hug/Targeted -> Idle. Give each scenario its own random function; do not mutate global Lua math shared by other tests.
- [ ] Add failing scenarios: forced jump; forced hug with 2, 3, 20 and 101 eligible users; solo fallback; no self/reciprocal/reused pairs; reproducible Fisher-Yates matching under scripted draws. Assert floor(n/2) initiating hug commands and n%2 jumps.
- [ ] Add busy-state and eligibility-recheck cases for both initiator/partner, late joins paired only with unhandled users, duplicate packets/amount updates causing no repeated actions, unsafe target-ID fallback, synchronous exception degradation, party suppression and generation/disconnect/reload clearing bookkeeping.
- [ ] Model target disappearance and takeover while a hug is running; assert companion never force-exits either side or retries the hug. Native host travel/release remains an acceptance check, not a fabricated harness claim.
- [ ] Run Lua contracts to establish RED for hug support and action-once behavior.
- [ ] Implement stable sorted/capped active selection, ordinary-state eligibility, shuffled pairs without replacement, one initiator per pair and handled marking before dispatch. Validate target ID with `^[A-Za-z0-9_:-]+$`; use jump fallback for unmatched/unsafe targets. Recheck states before dispatch and preserve parties/manual actions.
- [ ] Make amount updates retain the handled set; reset it on a new recognition start/clear. Skip random actions for permanently party-suppressed recognition. Let native hugs finish; add no `exitState` hug cleanup.
- [ ] Add behavioral mutations for self-pairing, repeated window actions, missing busy-state/ID guards and reciprocal dispatch. Run all Lua contracts under both local Lua and Lua 5.2, then lint/full tests; commit `feat: randomize donation jumps and paired hugs`.

### Task 4: Temporary runner, native acceptance and deliverable

**Files:**
- Modify: `scripts/sa-integration.js`, `src/streamAvatars/integration.js`, `src/streamAvatars/index.js`, `tests/fixtures/donations/integration-scenarios.js`
- Test: `tests/streamAvatarsIntegrationCli.test.js`, `tests/streamAvatarsDevelopmentRunner.test.js`, `tests/streamAvatarsIntegration.test.js`
- Modify: `docs/stream-avatars-setup.md`, `docs/stream-avatars-verification.md`

**Interfaces:**
- CLI: `--recognition random|jump|hug`, default random; invalid/missing values fail.
- `runIntegration({ ..., recognition = 'random' })` validates the option and passes `integration.recognitionAction` into `startStreamAvatars`. Only the integration path injects a constant composer draw (jump=0/hug=0.5); production always uses default randomness.

- [ ] Add failing CLI/process/runner tests for default and both forced actions, invalid values, expected $25/count-2 batch captions, no production-state/config access and unchanged optional Hue isolation.
- [ ] Implement the developer-only injection and update the six scenario caption expectations/help. Keep real-time pauses and delivery diagnostics; never assert visual success from dispatch alone.
- [ ] Run `npm ci`, `npm run lint`, complete `npm test -- --runInBand`, and `LUA_BIN=<Lua 5.2 binary> npm test -- --runInBand --coverage=false tests/streamAvatarsCompanion.test.js`. Fix failures without weakening tests.
- [ ] Run `npm run sa:package`; verify deterministic bytes, 22 manifests/image entries, placeholders and actual native import types. Preserve the user's private settings while importing/testing.
- [ ] Test the real host with `WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20 --recognition jump`, then hug. Use a matching private token in environment without exposing it. Observe single/batch captions, paired hugs, partner release, busy avatars and unchanged milestone/goal dances. Repeat hug with `--crowd 0` for solo fallback and `--crowd 100` for the 101-avatar cap/performance.
- [ ] Record native access/cooldown/target-disappearance and concurrent-action limits honestly. Any temporary installed-script instrumentation must be backed up and restored byte-for-byte; leave private settings untouched. If native checks cannot run, preserve the testable package and report acceptance still pending.
- [ ] Update setup/verification docs with caption wording, capability/reimport requirement, pairing/fallback rules, native completion caveats, test commands and actual evidence. Self-review against every spec requirement.
- [ ] Run lint/full tests after final edits. Commit `feat: verify donation recognition through temporary integration`, using detailed Conventional Commit body paragraphs. Push the existing task branch, update PR #72's final behavior and validation, and await both required CI jobs. Deliver PR/ZIP links and a clean worktree; do not merge.
