# Donation amounts and random recognition actions

Status: behavior agreed in conversation; implementation plan awaiting review.

## Agreed experience

- Outside milestone/goal parties, replace the generic caption with `$25 - THANK YOU!` for one donation, or `$25 FROM 2 DONATIONS - THANK YOU!` for a combined batch. Nearby gifts continue sharing one recognition window; their amounts and donation counts accumulate within that window.
- Whole dollars omit `.00`; nonzero cents remain visible. The displayed amount belongs to newly recognized gifts, not the cumulative stream total.
- Choose jump or hug with equal probability once per shared recognition window. Later gifts in that window retain the choice rather than restarting the crowd action.
- Hug matching is random among eligible active avatars, including the caster. Pair avatars without replacement and issue one native hug command per pair. An odd/unmatched avatar jumps; a solo avatar jumps.
- Hearts retain their existing five-second duration, bounded to ten seconds from the recognition window's original start when nearby gifts extend it.
- Milestones and goals retain dancing, confetti, their current captions and durations. Gifts during a party retain hearts/accounting but show no donation-amount caption and do not interrupt dancing with jumps/hugs. Suppressed gifts are not queued for later display/actions when a party ends.
- Screensaver, climb and explode are outside this change. No new production configuration is needed.

## Approach and alternatives

Extend the existing reducer intent, composer and strict numeric wire protocol. Reuse numeric bitmap glyphs and package three small fixed phrase assets. Keep native actions in the companion; the bot chooses jump/hug once, and the companion chooses random pairs from the current eligible crowd.

A separate per-gift caption queue would identify individual gifts but contradicts the selected combined experience and could build a backlog. Letting every avatar choose independently would mix jumps and hugs in one celebration and complicate matching. The selected approach preserves one coherent crowd action and existing bounded event composition.

## Accounting and composition

`reduceDonations` adds `donationCount` and `donationTotalCents` to its transient intent. Count only its newly accepted IDs. Read amounts from the accepted ledger after the scan, so duplicate facts, conflicting facts and a same-scan null-to-known revelation follow the existing authoritative policy. If any newly accepted gift still has a hidden amount, the batch total is null; show the existing generic Thank you caption rather than inventing an amount or showing an incomplete-total warning. Count zero plus total zero describes a delayed goal-only intent.

The composer accumulates those values for its existing recognition window, using checked integer-cent addition. Its output adds `donationCount`, `donationTotalCents`, `recognitionStartedAtMs` and `recognitionAction`. The latter two are null without a recognition window; otherwise the action is exactly `jump` or `hug`. Session change, clear, stop and expiry reset all transient values. Historical reconciliation and later revelation of old hidden gifts remain silent and never become new donation amounts.

Use `createCelebrationComposer({ clock, random = Math.random })` to make the 50/50 choice testable: a draw below 0.5 chooses jump, otherwise hug. Only draw when a new window begins. Never transmit donor names, gift IDs or arbitrary caption/command text.

## Wire compatibility

Keep protocol version 2 and add the `donation-recognition` capability. Increase allowed capability/feature cardinality from four to five. The updated bot requires both `celebrations` and `donation-recognition` when admitting a ready companion; older packages receive a clear import-latest-companion rejection rather than silently discarding strict-schema packets. Snapshot feature lists and companion ready lists include the new capability. No persisted-state schema migration is needed.

Validate all four new celebration fields in both Node and Lua, including JSON null in the native MoonSharp codec. Amount/count are nonnegative safe integers (amount also allows null), count zero requires amount zero, a positive count requires a valid recognition start/action, and a null recognition start requires count zero/action null. Recognition start is nonnegative, no later than issue time, and bounds hearts to start + 10000 ms. Existing exact-key rejection, timestamps, generation/session fencing, caps and once-only event IDs remain in force.

## Companion rendering and actions

Use the existing caption layer and total layout/clamping. Add `sa_separator` (` - `), `sa_from` (` FROM `), and `sa_donations` (` DONATIONS - `) assets alongside existing digits/Thank you. Add the ASCII hyphen to the bitmap font. Derive phrase geometry from generated manifests in package tests; explicitly verify any Lua dimensions against those manifests. There is one caption row, no second party caption, and the existing 48-caption-object/128-pending-load budgets remain unchanged.

Tie the action-issued ID set to `recognitionStartedAtMs`. Amount/count updates rebuild caption objects without resetting that set. Clear unused glyph objects when a caption becomes shorter. A window that coincides with a party is permanently suppressed for amount/actions, including after the party ends; remaining hearts may finish naturally.

Build a deduplicated, stable ID-sorted crowd capped at 101. Act only on currently Idle/Wander avatars; preserve busy states. Shuffle eligible, unhandled avatars with Fisher-Yates using Lua `math.random`. Issue one `user.runCommand('!{cmd:hug} '..target.id, true)` per pair; recheck both avatars before admission and mark both handled before invoking the command. Unmatched eligible avatars use the fixed quiet jump command. Late arrivals can act once within the same window, paired only with still-unhandled eligible avatars. Reject target IDs outside `[A-Za-z0-9_:-]+` and use the jump fallback rather than interpolating unsafe command text. Never use donor/display names as command targets.

Native hug commands return no success result. A synchronous host exception reports `action-error` and permits a jump fallback while both avatars remain eligible; a silent native permission/cooldown rejection is not retried or reported as a confirmed hug. Hearts/caption continue either way. Do not issue reciprocal hugs or use a global mass command that can override busy viewers.

## Native evidence and limits

Read-only inspection of the installed host confirms `Cmd_Hug.Work` resolves explicit internal IDs and excludes self for random targeting. `HugState` moves the initiator toward its partner and returns to Idle after the native sequence. `FSM.Behavior.Hug` temporarily uses a Targeted state on the partner, bounds the animation to three loops/five seconds, and releases the target as the sequence finishes. This is why each pair receives only one initiating command.

Hug movement/effects can outlast the caption. Let native hugs complete; forcibly exiting an initiator can interrupt the native partner-release sequence. No hug cancellation/cleanup ownership is added. Native movement can encounter a partner whose state changes after admission, so cross-command races and disappearing targets require a real-host acceptance check. Existing dance ownership/cleanup rules remain unchanged. Gear, decorations, Twitch/Discord/markers/Hue and production persistence are untouched.

## Verification and deployment

Tests exercise reducer attribution, checked accumulation, deterministic action choice, strict schemas/capability fencing, both Lua action branches, random pairing, odd/solo crowds, duplicate updates, late joins, busy avatars, unsafe IDs, party suppression across expiry, layer failure and native JSON null. Preserve all existing tests and behavioral mutations.

The temporary integration runner gains `--recognition random|jump|hug` (default random), solely to exercise both native paths without real bot clients. Existing ordinary/anonymous/batch scenarios show $25; batch includes the count of two. All party scenarios keep their current captions. Test with two-plus avatars and a solo caster; verify native hug behavior, target release, cooldown/access settings and existing dance behavior. Run full lint/tests, Lua 5.2 companion tests and deterministic/native package checks before updating PR #72. Preserve private settings when reimporting the regenerated ZIP.
