# Stream Avatars verification

Campaign-progress celebrations supersede the original broadcast-total and simultaneous-party requirements in issue #67. Bot and companion now use protocol v3; reimport the ZIP and restore private address/token together with the bot update.

## Verified behavior

Fresh donations, including matching records, receive five seconds of hearts, their combined amount/Thank you caption and a random jump or paired hug. Nearby gifts extend recognition only to ten seconds from its original start. A qualifying campaign milestone follows recognition for 18 seconds; a goal follows for 20 seconds and wins its simultaneous milestone. The participant's fresh `sumDonations` supplies the actual campaign banner, never an estimated sum of gifts. Delayed API totals can leave a gap after thanks without repeating it.

Startup/restart/reset independently baseline donations and campaign totals silently. Accounted IDs and thresholds persist before output. A final ready-companion disconnect cancels visual work and correlation; reconnect publishes current totals without replay. Gifts during a party wait in one combined next thank-you. Late goal confirmation for the existing batch retains its sequence and dance attempts, with a 38-second maximum from the original party start. Campaign controls need confirmed admin authorization, with no Twitch offline requirement. Legacy broadcast `state.json` is untouched for rollback.

## Automated evidence (2026-10-11)

Using Node.js 24.19.0:

```sh
npm ci
npm run lint
npm test -- --runInBand
npm run audit:prod
LUA_BIN=/path/to/lua5.2 npm test -- --runInBand --coverage=false --runTestsByPath tests/streamAvatarsCompanion.test.js
npm run sa:package
```

The complete coverage-enforced suite passes 996 tests across 54 suites; lint is clean. All 171 companion contracts and behavioral mutations pass with Lua 5.2.4 and local Lua. Production dependency audit reports zero vulnerabilities. No tests are disabled to obtain these results. Retired stream-session tests were replaced with campaign, shared Twitch-validation and integration coverage.

| Behavior | Evidence |
| --- | --- |
| Silent baselines, exact cents, thresholds, goal/interval edits, decreases, stale/repeated input, confirmation expiry | `campaignProgressState`, `campaignProgressLifecycle`, `donationMoney` |
| Atomic writes, locks, symlink/hardlink rejection, failed persistence, backups/quarantine, identity changes, legacy isolation | `campaignProgressStore`, `campaignProgressLifecycle` |
| Prompt thanks before delayed totals, batch/epoch correlation, unchanged announcements/Hue/markers/summary/goal commands | `app`, `donationIntegration`, `commands`, `hueControl`, `streamMarkers` |
| 100+ gifts, backdated rows behind known IDs, missing/changing counts, invalid/registration rows, repeated pages, cancellation/pacing | `campaignDonationSource`, `donationSource` |
| Recognition before parties, combined pending gifts, delayed same-party goal upgrades and bounded timers | `campaignCelebrations`, `campaignAvatarLifecycle` |
| Reset/disconnect/reject/shutdown cleanup, multiple clients, late readiness, no reconnect replay | Real WebSocket `campaignAvatarLifecycle`, `streamAvatarsServer`, `streamAvatarsIntegration` |
| Strict v3 vocabulary, no arbitrary captions/commands/donor IDs, native JSON null compatibility | `campaignProtocol`, `streamAvatarsProtocol`, companion contracts and installed MoonSharp probe |
| Random pair admission, busy states/gear, quiet native targeting, action ownership/cooldown guards, bounds and object budgets | `streamAvatarsCompanion` with 101-avatar and mutation fixtures |
| Six independent campaign fixtures, real CLI signals, readiness/port errors, temp-state isolation, no real clients, opt-in Hue | `streamAvatarsDevelopmentRunner`, `streamAvatarsIntegrationCli` |

Regression checks were observed failing before fixes for split-response duplicate recognition, rejected-client readiness loss, repeat-ready updates, delayed initial-request cutoff and service abort cleanup. A deliberate mutation that assigns party-time gifts to the active batch fails the delayed-goal/pending-recognition regression; restoring the implementation passes. Existing Lua mutations detect phase/action/admission regressions.

The source now diagnoses contradictory duplicate facts within one scan while retaining the first normalized record and never adding a duplicate ID twice. This resolves the previously recorded same-scan diagnostic omission.

## Package and native-format evidence

The final ZIP is deterministic, with 22 images and 25 entries, placeholder credentials and portable Node-only packaging. `sa_raised` is a transparent 143×23 image reading ` RAISED!`; its dimensions are derived from the manifest. The native Stream Avatars ZIP reader/import types accept the generated package, frame metadata and placeholder settings. The installed MoonSharp interpreter accepts the exact v3 recognition/party validator, native JSON null values and authoritative campaign money. These are import/runtime checks, not a graphical acceptance pass.

Previous host inspection established that native `User.runCommand(..., true)` suppresses output, active users include the caster, ordinary moving avatars remain in Wander, and native Dance/Hug per-user cooldowns are ten seconds on this host. The companion remembers its own requests across clears/reconnects/reloads using real time; it does not inspect native timers or observe every manual command. Customized timers must be mirrored in private companion settings. A recent manual command can still make the first companion request hit a native cooldown. Mapped/tween dances follow native animation settings and may need manual stopping if configured to loop; ambiguous custom actions are never forcibly exited. Native hugs release under their own control.

## Bundled audio evidence (2026-10-12)

Issue #76 adds original donation, milestone and goal cues. Using Node.js 24.21.0, the complete coverage-enforced suite passes 1,030 tests across 57 suites after the listening revision; lint is clean, the production audit reports zero vulnerabilities, and packaging succeeds. Both companion suites pass all 185 checks with Lua 5.2.4. Audio tests cover settings, duplicate suppression, upgrades, reload/reconnect, campaign/generation changes, missing sounds, host exceptions and cancellation. Review identified an accepted-but-expired phase update that could leave a longer custom sound playing; recognition and party regressions were observed failing before cleanup was corrected.

The current deterministic ZIP has 28 entries: the existing 22 images plus three Ogg files under `scripts/sa_helper_bridge/sounds/`. The CLI also writes an adjacent `sounds/` folder for one-time import. The installed Stream Avatars ZIP reader and `BuildExportFiles` deserializer pass nine format/API checks, including the audio paths and GUID-based play/stop/query signatures. Inspection establishes that the native content format has no sound-library catalog: importing the companion extracts the files but cannot register them as playable sounds. Use **Sounds > Import Sound** as documented in [setup](stream-avatars-setup.md#celebration-sounds), keeping chat/soundboard triggering disabled. Reimporting the companion preserves that separate sound library; restore private companion settings after reimport.

After listening feedback, donation audio is a three-second attention flourish and milestone/goal audio carries through the normal 18/20-second parties. The longer compositions use 150 BPM phrases, changing chords, bass and synthesized percussion with resolving endings. Audio lifecycle behavior and names remain unchanged; existing users must replace the registered native sound files to hear the revision.

FFmpeg 8.0.1 decodes all committed clips as stereo Vorbis at 44.1 kHz. Measured durations are 3.001, 18.001 and 20.001 seconds, with peaks from -13.0 to -12.9 dBFS and no clipping. RMS levels are -27.0, -27.9 and -28.4 dBFS respectively; native volume remains adjustable. PCM tests verify deterministic samples, prompt onset, signal throughout the intended body (not padded silence), ending fades and conservative headroom; duration and presence regressions failed against the original cues before revision. Regeneration with the same encoder produces identical catalog digests. Packaging validates bounded container structure, CRCs, codec headers and digests, rather than implementing a complete Vorbis decoder.

The entire companion also compiles in the installed MoonSharp interpreter. These checks establish asset and native-format compatibility. Audible playback, import UI behavior and OBS capture of these new cues have not been verified in a live graphical session. Listen to all three through the integration scenarios before deployment, including a long custom cue interrupted by clear/expiry, a goal upgrade and unrelated manually played audio. No installed private settings or sound-library entries were changed during verification.

## Deployment acceptance still required

Earlier local native observations verified the previous companion's hearts, confetti and mapped dancing. They do not establish visual acceptance of this revised campaign sequence. No installed scripts, private settings or credentials were changed for this redesign. The operator's earlier teleporting/“Height is fixed in settings” issue was resolved by display settings.

Follow [setup and acceptance](stream-avatars-setup.md#real-lan-and-obs-acceptance-run). With the matching private token already in your environment and companion address set to `BOT_LAN_IP:3010`:

```sh
WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20 --recognition hug
WEB_PORT=3010 npm run sa:integration -- --scenario all --crowd 20 --recognition jump
WEB_PORT=3010 npm run sa:integration -- --scenario ordinary --crowd 0 --recognition hug
WEB_PORT=3010 npm run sa:integration -- --scenario ordinary --crowd 100 --recognition hug
```

Observe thanks before `$2,500 RAISED!`, `$3,550 RAISED!` and the distinct goal party; matching-equivalent gifts use the same path. Check one initiating hug per eligible pair, odd-avatar jumps, native partner release, busy/departing targets, gear preservation and no repeated companion UserCD warnings. Windows/LAN/OBS capture, native action access, dense performance, persistent-volume deployment and optional physical Hue remain operator checks. Dispatch logs alone are not a visual pass.

## Final independent review

The fresh whole-branch review found two delayed-goal timing bugs. Both were reproduced before correction: local visual expiry could reset dance attempts, and completed campaign parties could restart with a new start time or transfer their goal into newer work. Party identity/action history now survives local expiry; the composer retains the original party start and 38-second maximum. A late goal may resume that same sequence only while its original bound remains open and no newer phase owns the display. Otherwise the old upgrade is discarded rather than interrupting a newer celebration. Five added regressions plus a behavioral mutation cover these boundaries. The full 996-test suite, lint and all 171 Lua 5.2 contracts pass after fixes; the rebuilt package passes deterministic/native-format and full installed-MoonSharp compilation checks. No minor findings remain deferred.
