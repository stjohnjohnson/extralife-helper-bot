# Live donation celebrations design — issue #67

Date: 2026-10-09
Status: Approved design; implementation plan requires user review before application changes.
Issue: https://github.com/stjohnjohnson/extralife-helper-bot/issues/67
Branch: codex/live-donation-celebrations

## Outcome

Every newly detected eligible donation gets a shared avatar celebration. Known money raised within the persistent broadcast session advances configurable live-money milestones independently of the campaign total. A newly observed campaign-goal crossing gets one distinct bonus per session.

The development preview is a scripted integration runner. It starts only the donation/session/Stream Avatars subsystem in a temporary instance and supplies fixture inputs. It does not run the complete bot or connect Discord, Twitch, or Extra Life. It replaces interactive rehearsal commands and the sa:rehearse CLI.

## Decisions approved in this conversation

- Count donations throughout the persistent session, including interruptions and the existing offline grace period. Do not require a fresh Twitch online observation for every celebration. A connected Stream Avatars application can render effects while the session remains open.
- The final offline grace interval can contain gifts received after the actual stream stopped. Eligibility ends at the persisted session end, not an inferred earlier cutoff.
- Gifts with a valid ID and eligible timestamp but a hidden amount receive the same recognition. Unknown amounts do not contribute invented dollars. Keep accounting limitations in status/logs; do not add an incomplete-total overlay caption.
- Reuse the existing donation polling process. Deduplicate and sum individual eligible gifts; do not infer donations from changes in the campaign total.
- Ordinary celebrations last five seconds. Live-money parties last 18 seconds, with a configurable initial $500 interval. Campaign-goal success has a distinct expanded gold treatment.
- Nearby events combine rather than queue a series of parties. A polling batch crossing multiple thresholds marks every threshold handled and celebrates only the highest newly reached threshold.
- Preserve existing individual donation notifications, stream markers, campaign summaries, the goal command, and Hue donation priority/restoration.
- Replace interactive rehearsal with a temporary, scripted integration runner that invokes the real subsystem and injects fake input. Physical Hue is opt-in. No production-state writes or donation messages.

## Existing foundations and limits

src/broadcastSession already owns retained starts, offline grace, session identity, atomic persistence, recovery, and serialized observations. Its v1 state reserves processedDonationIds, liveTotalCents, reachedDonationCheckpoints, and campaignGoalReached, but does not yet implement donation accounting.

app.js polls getUserDonations every 30 seconds, suppresses the first successful snapshot, and keeps seen IDs in memory. It currently reads one page. src/streamAvatars publishes five-second heart events, authenticated snapshots, and bounded transient delivery. Lua follows avatar positions, cleans up owned objects, and isolates image loading from the transport coroutine. Its current 50-heart rotation does not satisfy hearts above every active avatar.

HueController.celebrateDonation already takes priority over viewer color/party effects, coalesces overlapping donation effects, and restores saved lights. Preserve this behavior rather than adding a competing Hue controller.

The existing sa:rehearse runner is already a standalone subsystem process. Replace its interactive input and production rehearsal switching, while retaining the useful connection, synthetic-user ownership, and shutdown contracts in the new runner.

## Donation source contract

Verify the installed extra-life-api 8.0.0 transport before changing it. It sends offset=1 for its first page without an explicit API version. DonorDrive documents zero-based offsets since version 1.1, but its unversioned endpoint can use older semantics. This discrepancy alone is not evidence that current alerts are broken.

Document the chosen API version, first offset, maximum page size, response shape/headers, timestamp format, ordering, and failure statuses. Add a small source adapter with an injectable transport. Retain the wrapper when its verified contract can satisfy completeness and error handling; otherwise use Node's fetch with an explicit supported API version and offsets. Do not introduce a second independent donation poller or globally replace the campaign-summary/goal APIs.

Default donation ordering is newest first. Start with one page. Continue only when a full page still has not covered the relevant session window. Initial startup and restart reconciliation must cover all available in-window records, even when there are more than 100. Do not stop merely at the first already-seen ID: duplicates and out-of-order arrivals remain valid cases.

Use a fixed upper timestamp for a scan and a deterministic ordering when supported. Follow documented pagination metadata; detect contradictory/changing counts, repeated pages, and incomplete scans. Do not commit a scan as complete when a later page fails. Retry with bounded backoff and overlap to tolerate changes while paginating. Respect DonorDrive's documented request cadence and 429 responses; large catch-up scans may take several polling turns. Single-page scans remain the normal small-data path.

A confirmed public donation record supplies createdDateUTC, which the API describes as creation time in UTC. It does not document a separate payment-settlement timestamp. Use the published donation record and an explicitly zoned, strictly validated creation timestamp; do not claim payment settlement verification. Exclude registration-fee records, wrong-participant records, impossible future timestamps, invalid IDs, and ambiguous timestamps. Missing timestamps do not become receipt-time donations.

Amounts use USD integer cents after strict decimal validation. Reject negative, non-finite, over-precision, and unsafe-range amounts. A missing/null amount is unknown, distinct from zero and malformed data. Money arithmetic and threshold comparisons operate only on safe integers.

## Accounting and persistence

Add a pure donation reducer and a serialized session-controller donation operation. The input is a complete source scan, its capture time, and an optional campaign observation. The output is updated state plus a bounded celebration intent. Persist the state before publishing the intent.

Eligibility uses [startedAtMs, endedAtMs), or [startedAtMs, scanUpperBound] for an open session. Retain the established grace behavior. An observation error does not imply an ended session. Once the session closes, later matching is excluded. Available delayed records inside an ended window may reconcile totals silently without creating an after-stream party.

Deduplicate using donation IDs within the participant/session identity. Persist validated IDs, exact known totals, unknown-amount count, reached thresholds, campaign-goal state/baseline, and recovery/reconciliation status. Keep names/messages out of the durable accounting ledger unless needed by existing notification behavior. Store enough per-ID facts to detect conflicting duplicate amounts/timestamps and, if an initially hidden amount later becomes public, account for it once without replaying the original gift animation.

Migrate existing valid v1 session files explicitly. Preserve start/end, processed IDs, totals, thresholds, chapter/time-checkpoint fields, and recovery information. Add participant identity so changing participant configuration cannot reuse another campaign's ledger. Corrupt files must continue through the existing recovery gate rather than silently resetting money.

The first complete scan after startup/restart/recovery reconciles available history silently, including marking historical milestones handled and baselining campaign-goal status. Failed initial scans do not establish a successful baseline. Existing in-memory notification startup behavior remains separate from the durable avatar ledger.

On subsequent scans, add each eligible ID exactly once. Crossing several interval boundaries records them all but returns one highest-threshold milestone intent. Configuration changes baseline existing totals instead of manufacturing a retroactive milestone backlog.

Accounting is exactly once per donation ID. Transient animation dispatch is best-effort and at most once after durable acceptance: a crash between save and send can lose an animation, but must not replay a gift or add money twice on restart. This is an intentional trade-off, not an exactly-once network-delivery claim.

A source/persistence failure retains the last good state and exposes a diagnostic. Persistence/recovery failure pauses avatar accounting/effects while ordinary bot notifications retain their existing path. No effect-delivery failure resets totals or prevents chat/markers/Hue from continuing.

## Campaign goal

Read fundraisingGoal and sumDonations from Extra Life; do not use campaign percentages or pledges. Store validated goal/total observations independently of the live total.

The first successful observation after startup is a silent baseline. Already-met goals do not produce a party. A later valid observation rising from below the same positive goal to at/above it, while the session is open and associated with newly eligible donation activity, produces a once-per-session bonus. Account for the API exposing a donation before its campaign aggregate updates: retain short bounded pending donation context until a later successful campaign observation can confirm the crossing. Baseline changed/lowered goals silently rather than making configuration edits look like donations.

Do not celebrate startup/recovery history, observations after session end, or repeated campaign snapshots. An API failure cannot turn an unknown baseline into a below-goal observation.

## Celebration behavior

Ordinary gift: transparent hearts follow each active avatar, including an active broadcaster; a quick crowd jump; one Thank you! caption; five-second duration. No donor-to-Twitch identity mapping. Anonymous/offline donors get identical recognition.

Live milestone: gold confetti, crowd dance, and a caption with the actual cumulative known live total, for example $1,543.50 raised this stream!; 18-second duration. Crossing $500/$1,000/$1,500 in one batch produces one party. Campaign goal: expanded gold celebration, distinct Extra Life goal reached! caption, 20-second duration.

One composer chooses goal over milestone over ordinary visual treatment, retaining hearts for newly recognized gifts. Multiple nearby gifts share one bounded ordinary animation. Gifts during a party refresh a short heart/thank-you layer without restarting the party or creating a party backlog. A higher milestone can update the existing party banner. A goal may upgrade a running party, with a fixed maximum combined lifetime. New events after a completed celebration can start a new effect.

Use absolute issue/end/expiry times, event ID, session ID, mode/run identity, and generation. A late packet cannot restart a full duration or cross the session/generation boundary. No unbounded pending-event queue. Reconnect sends current persistent state, not transient effects.

The same poll batch starts existing Hue donation handling and avatar intent dispatch without awaiting one to permit the other. One layer owns the Hue call to prevent duplicate starts. Milestone/goal visuals do not extend or replace the established physical donation animation.

## Lua, assets, and protocol

Extend the bounded protocol with celebration intent, numeric money fields, and a developer-only synthetic-crowd context. Never send donor-supplied caption text or arbitrary commands/code. Negotiate capabilities so an old companion fails visibly or degrades to its supported hearts until reimported.

Reuse sa_heart. Add transparent reusable gold confetti and a goal accent to the existing image catalog, plus a caption implementation. Verify actual host text/action APIs before relying on them. If the host lacks usable text primitives, package a small bitmap caption font and render fixed text/numeric amounts locally rather than sending native chat commands as captions.

Invoke jump/dance through verified host primitives with fixed, quiet local actions; do not generate outbound chat messages. Verify durations and permission behavior against the real host. Celebration cleanup must not restore avatar positions, clear unrelated gear, overwrite viewer selections, or destroy theme/chapter objects. If native actions cannot meet this contract, resolve that limitation during the host spike before finishing the rendering implementation.

Ensure every active avatar can receive a heart within the supported application capacity. Replace the 50-user rotating subset for donation celebrations with a tested resource budget sized for the configured supported crowd (at least 100 viewers plus broadcaster). Keep image-load concurrency and confetti density bounded. Handle joins/leaves, negative/resized canvas bounds, expiry, duplicate events, missing assets, and CLR image-load failures while transport stays alive.

Package the new catalog with existing native ZIP generation and placeholder-only settings. Preserve private credential handling. Missing images should degrade to remaining caption/action/heart elements, with sanitized diagnostics.

## Scripted development integration runner

Command: npm run sa:integration. Start a temporary instance of the relevant bot subsystem, not app.start(). Inject a fixture donation source, fixture campaign observations, deterministic session inputs, and optional Hue output. Use the production reducer, persistent controller, composer, bridge, protocol, shipped Lua, and package.

The runner owns a newly created OS temporary directory. It never loads the configured production state path. Initialize fixture participant/channel identity and timestamps. Start the real listener, print the address/configuration instructions, then wait for an authenticated, ready companion with required capabilities. Authentication/connection timeout is a failure, not a successful visual check.

Run a fixed sequence with real display-duration pauses: ordinary $25 gift; anonymous gift; nearby/batched gifts; the first $500 crossing; a large gift crossing several intervals; a distinct campaign-goal crossing. Print expected totals, captions, durations, and steps. The batch/large-gift scenarios verify one coherent party. Optional named scenario/crowd arguments are useful for repeating a single step without creating an interactive command system.

Supply owned synthetic viewers only when using Stream Avatars' Custom Lua service. Include the broadcaster fixture. Document restoring the normal streaming service. Native actions must remain local even when the actual application has other services configured.

Default Hue is a no-op sink. Only an explicit --hue flag initializes HueController using validated Hue-only configuration. No automatic light initialization because a developer happens to have HUE_* values in .env.

Do not import/start Discord or tmi clients, create stream markers, call Extra Life, update campaign summaries, or expose fake-input commands in the production bot. Production keeps !sa status and session reset/recover controls. Remove rehearsal switching, crowd/hearts preview chat commands, sa:rehearse, and its startup/shutdown notice from production. Replace obsolete rehearsal tests with runner/isolation contracts while preserving independent transport, session, Lua, and recovery assertions.

On normal completion, error, SIGINT, or SIGTERM, clear owned effects/users, allow bounded cleanup delivery, stop Hue/server/session, release locks, and remove only the runner-owned temporary directory. A fresh runner invocation starts fresh. A port conflict fails clearly; it never attaches to or stops an existing bot. Use a separate port or stop the normal instance for LAN testing.

## Validation and delivery

Automated fixtures cover source version/offset contract, >100 in-window gifts, page failure/churn, explicit UTC offsets and invalid dates, exact cents, wrong participant, registration fees, hidden/malformed amounts, duplicate/conflicting/out-of-order IDs, pre/in/post-window gifts, initial history, restart/recovery, failures before/after persistence, multiple thresholds, interval changes, campaign baselines/delayed crossings, and goal changes.

Exercise the actual Lua with real Node messages in the existing harness: all-active hearts, caster/late joins, captions/confetti/actions, overlap/expiry, reconnect/generation, missing/delayed assets, resource caps, cleanup, and no theme/gear mutation. Update mutation checks when source structure changes rather than removing behavioral protections. Verify native ZIP import contents, animation looping, alpha, catalog entries, and deterministic output.

Run npm ci using Node >=24.15.0 <25. Before each commit/PR run npm run lint and the complete npm test suite; preserve coverage thresholds. Required CI includes Linux build/audit/tests/Docker and Lua 5.2 contracts. Fix required failures before declaring the implementation ready to test.

Deliver an implementation PR against main with generated import ZIP available as a local artifact, setup/configuration changes, and a Linux-to-gaming-computer LAN/OBS checklist. The plan/documentation PR does not close issue #67. Final implementation PR may close it after the agreed readiness checks.

Actual rendering, quiet native actions, image spacing, OBS transparency/crop, dense-crowd frame rate, physical Hue synchronization, and restoration of the normal service need the user's real setup. Ready to test means automated/CI checks passed and the runner/package/checklist are ready; it does not claim an unperformed deployment test. Existing foundation verification mentions unresolved avatar teleporting and pending LAN/OBS validation; observe/report those separately if they persist.

## Sources

- Issue #67: https://github.com/stjohnjohnson/extralife-helper-bot/issues/67
- Prior approved design: https://github.com/stjohnjohnson/extralife-helper-bot/blob/codex/stream-avatars-design/docs/plans/2026-10-08-stream-avatars-design.md
- DonorDrive donation fields/order: https://github.com/DonorDrive/PublicAPI/blob/master/resources/donations.md
- DonorDrive version/offset/headers: https://github.com/DonorDrive/PublicAPI/blob/master/overview.md
- DonorDrive request cadence: https://github.com/DonorDrive/PublicAPI/blob/master/README.md
- Participant goal/total: https://github.com/DonorDrive/PublicAPI/blob/master/resources/participants.md
- Stream Avatars local commands: https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/global-functions/runcommand
- Stream Avatars mass actions: https://docs.streamavatars.com/stream-avatars/commands/minigames-and-fun-commands/mass-command
- Synthetic users: https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/classes/app/platformservicesettings
- Existing code and tests inspected at main commit 4c31926.
