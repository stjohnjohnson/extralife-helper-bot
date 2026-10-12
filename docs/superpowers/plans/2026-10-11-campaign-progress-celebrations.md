# Campaign Progress and Sequential Celebrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Thank every fresh donation before any qualifying campaign-total milestone or goal party, without depending on Twitch stream status.

**Architecture:** Replace the bridge's broadcast controller with a participant-bound campaign tracker. Keep prompt donation discovery separate from authoritative total refresh; a timed composer orders recognition and parties and retains at most one combined pending batch. Protocol v3 and the companion expose campaign progress and explicit phases, retaining native action safety and portable packaging.

**Tech Stack:** Node.js 24.15.0+ in the 24.x series, CommonJS, Jest, ws, Lua 5.2+ / installed MoonSharp, existing ZIP/PNG tooling. No new dependencies.

**Spec:** `docs/plans/2026-10-11-campaign-progress-celebrations-design.md` (read before executing).

## Global Constraints

- Reuse `codex/live-donation-celebrations`; refresh primary `origin/main` first, preserve every other checkout, and do not merge/rebase main into this task branch automatically.
- Default campaign interval: 50000 cents; preserve `STREAM_AVATARS_DONATION_INTERVAL_CENTS` and its current 1–100000000 bounds.
- Recognition: 5000 ms, extendible to 10000 ms from original start; milestone: 18000 ms; goal: 20000 ms; late same-party goal upgrade capped at 38000 ms from party start.
- Fresh-donation confirmation window: 120000 ms; source schedule: 30000 ms; retain version 1.4 API, existing 15000 ms pacing, cancellation and strict validation.
- Money/counts are nonnegative safe integers; hidden donation money is null. Campaign totals are authoritative API observations, never sums of acknowledged gifts or legacy stream money.
- Keep 101 avatars, 32 confetti, 48 caption objects, 128 pending loads, fixed quiet native commands, no donor-to-viewer mapping, no changes to gear/decorations.
- Persist ID/threshold decisions before emitting effects. Baseline startup/restart/reset silently; drop disconnected visual work, with no reconnect replay.
- Keep native real-time cooldown guards and their existing settings/defaults; no mass commands overriding busy avatars or forced native hug cleanup.
- Full tests and lint must pass before each commit; detailed Conventional Commits, only task files staged; push/update PR #72 and verify required CI. Never merge without instruction.

## Review Focus

- Delayed/failing campaign responses: prompt thanks, no estimated totals, one party after confirmation and acknowledgement; no historical crossing after confirmation expires. Tasks 1, 2, 4.
- More than 100 gifts or a backdated record behind a known first-page ID: bounded catch-up accounts for record-count growth without hiding gifts or delaying normal notifications. Tasks 1, 4.
- Campaign total decreases, interval/goal edits, or participant changes: silent rebasing and no repeated handled milestone/goal. Tasks 1, 4.
- Disconnect/reset/shutdown just before a phase timer fires: no old party/pending caption after reconnection; current progress persists. Tasks 2, 3, 4.
- New gifts while an existing party has a delayed goal upgrade: one combined next thank-you, proper correlation, bounded party duration, one dance per avatar and no UserCD retries. Tasks 2, 3, 5.

## File map and staging

Tasks 1–2 add standalone campaign modules alongside the currently used broadcast modules. Task 3 stages v3 protocol helpers and updates the companion/harness; Task 4 atomically switches the running service, app and runner and removes the retired paths. Do not deploy an intermediate commit. Every staged task must preserve a passing full suite; temporary legacy helpers exist only to permit that transition and are removed during cutover.

New modules: `src/streamAvatars/campaignState.js`, `campaignStore.js`, `campaignProgress.js`. Existing `celebrations.js` gains the new composer alongside its old export until cutover. Transport/rendering stay in existing files. Do not introduce a generic event framework or duplicate visual queue in Lua.

### Task 1: Campaign state, persistence and safe fresh-donation progress

**Files:** Create the three campaign modules and `tests/campaignProgressState.test.js`, `campaignProgressStore.test.js`, `campaignProgressLifecycle.test.js`. Reference `src/broadcastSession/store.js` for proven file safety; do not alter the legacy schema/file.

**Interfaces:**
- `createCampaignState({mode, participantId, intervalCents}) -> CampaignState`; `validateCampaignState(value, identity) -> CampaignState`; `reduceCampaignProgress(state, input, {pendingConfirmations=[]}={}) -> {state, intent, diagnostics, pendingConfirmations}`.
- State exact keys: `schemaVersion:1`, `mode`, string `participantId`, `revision:0`, `baselineAtMs:null`, `donationBaselineReady:false`, `rawSeenDonationIds:[]`, `processedDonationIds:[]`, `recordCount:null`, `campaignObservation:null` (later `{observedAtMs,totalCents,goalCents}`), `donationIntervalCents:intervalCents`, `donationCheckpointCount:0`, `goalHandled:false`. The controller separately owns `pendingConfirmations` entries `{batchId,acceptedAtMs,expiresAtMs}`; do not save or publish them. Commit returned state and transient correlations together only after a successful save.
- Input: `{batchId, donations, rawSeenIds, recordCount, complete, campaign, observedAtMs, baseline, intervalCents}`; fields absent from a partial input do not overwrite completed observations. Donation values retain `{id,participantId,createdAtMs,amountCents}` from the source. Intent: `{batchId, donationIds, donationCount, donationTotalCents, campaignTotalCents, milestoneCents, goalReached}`; campaign money is null until initialized.
- `createCampaignStore({path, mode, participantId, intervalCents, fs}) -> {load,save,archiveAndReset,recoverLastBackup,flush,close}`.
- `createCampaignProgress({store,clock,mode,participantId,intervalCents,newEpochId}) -> {getSnapshot,getStatus,getPollCheckpoint,acceptObservation,reset,recover,subscribe,stop}`. Checkpoint: `{epochId,participantId,baselineAtMs,baselineNeeded,rawSeenDonationIds,recordCount}`; intake metadata advances its completed record count only when `complete` is true. Observation includes `expectedEpochId`; reject late epochs. Load/save `.../<mode>/campaign.json`; ignore existing `state.json`. First poll/total after startup or reset are independently silent baselines.

- [x] Write reducer tests with these exact assertions (use small fixture helpers):

```js
// Baseline $2,475 / goal $10,000 is silent; no stream observation exists.
expect(baseline.intent).toBeNull();
// Fresh $50, followed by a fresh authoritative $2,525 total.
expect(thanks.intent).toMatchObject({donationCount:1,donationTotalCents:5000});
expect(crossing.intent).toMatchObject({campaignTotalCents:252500,milestoneCents:250000,goalReached:false});
expect(duplicate.intent).toBeNull();
// $990 -> $1,000 on a fresh $10 gift crosses goal AND the $1,000 bar once.
expect(goal.intent).toMatchObject({goalReached:true,milestoneCents:100000});
expect(repeatedGoal.intent).toBeNull();
```

  Add named cases for null amounts, zero/registration/invalid records, duplicate/conflicting raw IDs, later old-amount revelations, delayed campaign within/beyond 120000 ms, stale total timestamps, initial failed total, decreases/recovery, interval/goal changes, already-met startup goal and participant changes. Persist before invoking a subscriber/effect; a failed save yields no effect.
- [x] Run targeted tests RED: `npm test -- --runInBand --coverage=false --runTestsByPath tests/campaignProgressState.test.js tests/campaignProgressStore.test.js tests/campaignProgressLifecycle.test.js`.
- [x] Implement the interfaces. Copy/adapt atomic writes, Linux directory sync, private permissions, owner locks, link rejection, backup/quarantine/recovery markers; no broadcast timestamps/offline checks. Baseline-ID census and accepted-ID sets have separate purposes; count excluded rows for discovery without recognizing them. Timestamp eligibility uses the completed monitoring baseline only to suppress pre-startup history, never Twitch start/end times; in-baseline delayed/backdated gifts remain eligible. A completed observation establishes the raw-ID/count checkpoint; accepting an early page does not pretend later pages completed.
- [x] Verify file tests: restart preserves threshold/ID history but silently baselines missed gifts; corrupt file gate survives restart; confirmed repair silently rebases; mismatched participant progress is archived/rebased, not relabelled; legacy files remain byte-identical; stale in-flight epoch rejects after recovery/reset; stop waits for mutations.
- [x] Run targeted tests GREEN, full `npm test -- --runInBand` and `npm run lint`; commit `feat: track campaign progress independently of broadcasts` with implementation/configuration/rollback details.

### Task 2: Ordered composer with one combined pending batch

**Files:** Modify `src/streamAvatars/celebrations.js`; create `tests/campaignCelebrations.test.js`. Keep the current composer exported until Task 4.

**Interfaces:** `createCampaignCelebrationComposer({clock,random=Math.random,newSequenceId}) -> {accept(intent),advance(),nextTransitionAt(),clear(),stop()}`. `accept`/`advance` return an array of zero or more phase messages in chronological order, without envelope/version/event IDs. `nextTransitionAt()` returns the next absolute timestamp or null. All boundaries use the injected clock.

Messages expose `sequenceId`, `phase`, `kind`, `campaignTotalCents`, `milestoneCents`, `donationCount`, `donationTotalCents`, `recognitionStartedAtMs`, `recognitionAction`, `heartsUntilMs`, `partyStartedAtMs`, `partyUntilMs`. Retain opaque batch correlation in the composer, never in the wire. The active cycle and one pending aggregate own their gift counts/money/reward priority; accepting a delayed total must not add a gift twice.

- [x] Write tests that pin phase order and durations:

```js
now=1000;
expect(c.accept(milestoneGift)[0]).toMatchObject({phase:'recognition',kind:'donation',heartsUntilMs:6000,partyUntilMs:0});
now=5999; expect(c.advance()).toEqual([]);
now=6000; expect(c.advance()[0]).toMatchObject({phase:'party',kind:'milestone',partyStartedAtMs:6000,partyUntilMs:24000});
// A gift during that party is queued, not sent or silently suppressed.
now=10000; expect(c.accept(nextGift)).toEqual([]);
now=24000; expect(c.advance()[0]).toMatchObject({phase:'recognition',donationCount:1,heartsUntilMs:29000});
```

  Add exact cases for 10000 ms recognition cap, a combined pending batch, multi-bar highest-only, goal winning both crossings, random action drawn once per recognition, hidden combined amount, delayed confirmation after thanks (no repeated caption/action), expired correlation, same-batch goal upgrade capped to 38000 ms, a fresh batch's goal waiting its turn, duplicate confirmation, unsafe accumulation leaving state intact, clear/stop and repeated advance after expiry.
- [x] Run `npm test -- --runInBand --coverage=false --runTestsByPath tests/campaignCelebrations.test.js` RED.
- [x] Implement the explicit state machine. Starting a phase samples/sets its timestamps once; pending gifts combine without restarting the current party. A completed thank-you remains correlatable for 120000 ms without blocking newer gifts. Collapse confirmed rewards coherently, preserve highest threshold/goal priority, and never replay already shown thanks. Same-party upgrades retain `sequenceId`; a new pending cycle gets a new one.
- [x] Run targeted tests GREEN, full suite/lint; commit `feat: sequence donation thanks before campaign parties`.

### Task 3: Strict v3 campaign protocol and native rendering

**Files:** Modify `src/streamAvatars/protocol.js`, `integrations/stream-avatars/companion.lua`, `scripts/sa-assets.js`, generated `integrations/stream-avatars/assets/sa_raised.{png,json}`, and companion/protocol/assets/package tests plus `tests/lua/companionHarness.lua`.

**Interfaces:** Stage `decodeCampaignClientMessage(raw)`, `validateCampaignServerMessage(value)`, `publicCampaign(state)` beside legacy functions until Task 4. Version is exactly 3. Feature list: `hearts`, `crowd`, `campaign`, `celebrations`, `donation-recognition`. Required readiness: `campaign`, `celebrations`, `donation-recognition`.

Snapshot exact keys: `version,type,mode,generation,serverNowMs,campaign,integration,features`. Public campaign exact keys: `campaignId,initialized,totalCents,goalCents,nextMilestoneCents,goalHandled`; identity is the configured participant string, totals/goal/next are null until initialized, never donor data. No session/elapsed fields.

Celebration exact keys: `version,type,mode,generation,campaignId,id,sequenceId,issuedAtMs,expiresAtMs,phase,kind,campaignTotalCents,milestoneCents,donationCount,donationTotalCents,recognitionStartedAtMs,recognitionAction,heartsUntilMs,partyStartedAtMs,partyUntilMs`. Recognition: positive count, existing 5000/10000 constraints, `kind=donation`, `partyStartedAtMs=null`, `partyUntilMs=0`; campaign money may be null. Party: count/amount/hearts zero, recognition start/action null, known campaign money, milestone/goal kind, start no later than issue, end after issue and at most start+38000. New parties use 18000/20000; upgraded ones retain original start. Event admission expires within 10000 ms of issue. Keep existing exact clear/crowd/auth/heartbeat/diagnostic fields, changing version to 3 and using campaign identity on legacy hearts if retained.

- [x] Write v3 serialization/rejection tests: Node-produced recognition/party JSON accepted in Lua; v2 rejected; extra strings/commands/IDs/invalid phase combinations, unbounded durations and wrong identities rejected; MoonSharp null function/userdata accepted. Confirm public snapshots omit census, gift IDs, timestamps and ledgers.
- [x] Add Lua scenarios proving visible `$50 - THANK YOU!` before `$2,525 RAISED!`, no party dancing during recognition, clean layer transition, identical sequence updates causing no new actions, new pending sequence acting once, goal priority, late joins, busy states, resizing/negative bounds and unchanged density/image-failure cleanup. Port every existing meaningful action/null/cooldown/cleanup regression to v3 fixtures; do not weaken assertions.
- [x] Run targeted protocol/Lua/assets/package tests RED. Generated v2 wire fixtures must be changed to staged v3 helpers; legacy Node-only contract coverage remains until cutover.
- [x] Implement protocol and Lua validation/rendering. Bind state clearing to campaign/mode/generation and phase admission to `sequenceId`; keep per-event deduplication. Party packets never revive a donation caption. Keep native ownership, target validation, jittered confetti and real-time cooldown code unchanged except necessary sequence bookkeeping.
- [x] Change asset copy to exactly ` RAISED!`, run `node scripts/sa-assets.js`, and derive Lua caption geometry from the manifest. Do not hard-code the old width 341 or change unrelated art; package still has 22 images/25 entries.
- [x] Add behavioral mutations removing phase gates, sequence admission and campaign fencing, alongside existing native cooldown mutations. Run Lua 5.2 contracts, local Lua contracts, full suite/lint and package generation; commit `feat: render ordered campaign celebrations with protocol v3`.

### Task 4: Cut over polling, service, controls and temporary runner

**Files:** Modify `src/donations/source.js`, `app.js`, `src/streamAvatars/{index,events,server,config,actions,commands,integration}.js`, `scripts/sa-integration.js`, `src/viewerMonitoring.js`, `env.example`, `tests/fixtures/donations/integration-scenarios.js`, all affected app/source/service/WebSocket/runner/config/control tests. Remove retired `src/broadcastSession/` modules only after moving shared observation validation to `src/streamObservation.js` and migrating their relevant tests to campaign/observation tests.

**Interfaces:**
- Add `source.pollCampaignDonations({participantId,checkpoint,signal,onLatest,onDonations}) -> {complete,throughMs,recordCount,rawSeenIds,donations}`. Checkpoint comes from Task 1, including intake epoch/baseline, known raw IDs and last completed record count. `onLatest` keeps original individual notification behavior; `onDonations` sends newly normalized pages to campaign intake without waiting for the total request. Reuse request pacing/validation; a cached total is not a fresh observation.
- Service exposes `getPollCheckpoint()`, `acceptObservation({expectedEpochId,batchId,donations?,rawSeenIds?,recordCount?,complete?,campaign?,observedAtMs,baseline?})`, `resetIntegration()`, `getStatus()`, `dispatch(action)`, `stop()`, `address`. No `observeProduction` or `getSessionWindow`.
- Status includes `campaignTotalCents`, `campaignGoalCents`, `nextMilestoneCents`, `initialized`, `recoveryRequired`, companion readiness/connectivity/resolution and mode/crowd count. Commands: status, `campaign reset confirm`, `campaign recover confirm`; admin/channel/age/dedup protections stay.
- Schedule exactly one phase timer using injectable `{setTimeout,clearTimeout}`. Rearm from `nextTransitionAt()` after intake/advance; publish returned messages with fresh envelopes. Clear/stop/disconnect cancels timers and composer correlations. Extend server notifications with an explicit last-ready-companion-disconnected callback; use ready clients, not merely authenticated sockets. New ready clients receive a snapshot, never an active/replayed sequence.

- [x] Write app/source tests RED: online/offline/unknown Twitch observations never change donation acceptance; campaign startup needs no Twitch event; first-page thanks/notifications run before delayed aggregate; batch IDs correlate the later request; epochs reject stale replies; existing individual notifications, Hue calls, summaries and markers are unchanged.
- [x] Test discovery: 100+ new gifts, full pages containing known IDs, count growth from a newly visible backdated in-baseline row, identical/repeated pages, changed counts during pagination, absent metadata fallback, older baseline history, invalid/registration rows, request pacing/backoff/cancellation. Stop at the pre-baseline boundary or when growth is explained, never a known anchor alone when growth remains unexplained. Fail incomplete traversal without silently committing its checkpoint; previously accepted page IDs remain deduplicated on retry.
- [x] Wire the campaign controller/composer/protocol. Remove app's Stream Avatars observer hook while preserving viewer monitoring. Persist state before sending; if no ready companion, mark gifts/crossings handled but discard visual intents/correlations. A final disconnect increments visual generation, clears owned effects/timers and drops pending batches without altering campaign progress. Reconnect never accepts an old phase packet.
- [x] Test real WebSocket phase transitions and disconnect/reset/shutdown immediately before callbacks, including two clients and the final ready client leaving. Assert no queued party after reconnect and no callbacks after stop. Check stale timer callbacks against a generation token as well as clearing timer handles.
- [x] Replace controls/status text and remove offline grace from parsed/configured settings. Unknown legacy grace env values are harmlessly ignored. Keep legacy broadcast files untouched; campaign reset/recover silently initialize current totals rather than replaying thresholds. Move standalone Twitch observation validation and retain its viewer-monitoring tests; delete unused stream-money/session lifecycle code and obsolete exports after `rg` confirms no callers. Replace removed behavior tests with the new invariants, retaining all relevant persistence/security/validation cases.
- [x] Update the six runner fixtures with campaign baselines: ordinary/anonymous/batch start at 90000 cents with goal 1000000; milestone/large start at 249000 with that goal; goal starts at 99000 with goal 100000. Milestone gift 1000 reaches 250000; large gift 106000 reaches 355000; goal gift 1000 reaches 100000 and wins its simultaneous milestone. Normal gift amounts/counts remain 2500 or [1000,1500]. Initialize baselines without fake stream observations, update synthetic campaign totals on gifts, and wait/log 5000+18000/20000 for party cases. Keep only six public scenarios and existing options; overlap/API-lag cases live in automated fixtures/tests.
- [x] Make runner waits advance the same injected scheduler as the composer, not just wall-clock variables. Assert emitted order `recognition,party` for milestone/large/goal and recognition alone for the first three. Retain signal/drain/temp-dir/no-real-client/opt-in-Hue tests. Change readiness diagnostics to v3.
- [x] Remove transitional v2 helpers/composer/source APIs once callers migrate; export canonical v3 protocol functions under existing names and `publicCampaign`. Run `rg -n 'getSessionWindow|observeProduction|liveTotalCents|raised this stream|OFFLINE_GRACE_SECONDS|publicSession' src scripts app.js env.example` and resolve production hits; old historical planning documents may retain prior wording.
- [x] Run full suite/lint, both Lua contracts and deterministic package tests GREEN; commit `refactor: use campaign progress throughout the avatar integration`.

### Task 5: Deployment documentation and acceptance-ready package

**Files:** Update `docs/stream-avatars-setup.md`, `docs/stream-avatars-verification.md`, relevant README/env examples, plan status/checklists, and any package/runtime findings requiring correction.

- [x] Self-review every spec paragraph against implemented tests and code. Verify all five Review Focus conditions have explicit regression cases; use failed-before/passed-after checks or meaningful behavioral mutations for phase ordering and reconnect cancellation.
- [x] Document the authoritative campaign source, donation-first order, matching equivalence, silent startup/restart, disconnected drop, updated controls, private cooldown guards, v3 reimport/legacy-file rollback and possible delayed-total gap. Remove current operator instructions that require Twitch session recovery/offline status or describe stream totals.
- [x] Install/verify Node 24.x dependencies with `npm ci`; run `npm run lint`, complete `npm test -- --runInBand`, `npm run audit:prod`, and Lua 5.2 companion contracts via `LUA_BIN=/path/to/lua5.2 npm test -- --runInBand --coverage=false --runTestsByPath tests/streamAvatarsCompanion.test.js`. Do not skip/disable tests. Run deterministic/native ZIP-reader and installed-MoonSharp validation; inspect new `sa_raised` PNG dimensions and wire nulls.
- [x] Build `npm run sa:package`; ensure placeholder credentials, 22 images/25 entries and portability. Preserve private installed settings before any authorized import, restore address/token afterward. Do not claim the native acceptance passed from source inspection or mocks.
- [x] Prepare operator commands on port 3010 with `--scenario all --crowd 20 --recognition hug`, then jump, solo (`--crowd 0`) and dense (`--crowd 100`) checks. Native acceptance: thanks clearly visible before each party; `$2,500 RAISED!`/$3,550 banner without stream wording; goal wins its milestone; matching-equivalent synthetic donation behaves identically; no repeated UserCD clocks; busy states/gear preserved. Delayed totals and overlaps are reproducible with automated injected timing even if normal 30-second polls never overlap.
- [x] Commit only verified task changes with detailed Conventional Commits. Update existing PR #72's title/body around campaign totals and sequential recognition, cite the reviewed replacement spec instead of promising superseded issue criteria, push, check required CI on the exact head and resolve failures. Leave worktree clean and link the final ZIP/testing instructions. Never merge automatically.

## Execution and review boundary

Implementation and local verification are complete on `codex/live-donation-celebrations`. The v3 package is ready for deployment acceptance; Fresh whole-branch review found two delayed-goal timing defects, corrected with failing-then-passing regressions. Required exact-head PR CI is checked after each final push. Native graphical acceptance remains with the operator. The staged v2/v3 coexistence described above was temporary and is removed in the final cutover.
