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

The local imported `sa_heart` had eight 32×32 frames at 12 FPS, but its saved loop count was `1`. Inspection of the installed application's image loader and animator confirmed that Lua playback uses this saved count and holds the last frame after a single cycle, explaining a still heart that continued to follow its avatar. The image editor's preview forces infinite looping independently of the saved count. Its infinity button stores `loopTotal = 61`; the local image setting was changed to this value with a private backup and a semantic check that every other saved setting was preserved. Setup instructions now name the infinity button explicitly. This is an image-import setting correction; the Lua companion did not need a change.

## Dense crowd and portable packages

After saving infinite looping, the operator confirmed that the animated heart looked correct. A subsequent local Mac rehearsal selected the actual Custom Lua streaming service and allowed 101 avatars. A dense 100-viewer synthetic crowd, including `sa_rehearsal_100`, and many simultaneous pink hearts were visually observed. The renderer still caps each preview at 50 hearts and rotates eligible users between previews. This establishes local dense appearance, without measuring frame rate or verifying LAN/OBS behavior. The reported avatar teleporting remains unresolved.

`npm run sa:package` generates an import ZIP from the shipped Lua and repository image manifests. Automated tests unzip the real archive and check native command settings, image bytes, frame/FPS/loop metadata, automatic catalog expansion, deterministic output, placeholder-only settings, invalid inputs, path/symlink rejection, full PNG decoding with bounded inflation, malformed IHDR/IDAT with valid checksums, multi-row sheets, and CLI output paths with spaces. A temporary .NET probe used the installed application's `StreamAvatars.Zip.dll` and deserialized `data.txt` into its actual `SA_ImportExport.BuildExportFiles` type. It accepted all four current entries, the On Connect command, 32×32 frames, eight frame timings at 12 FPS, the native infinite loop value `61`, and placeholder credentials. This is a native import-format check, not a completed graphical import: the application was not running and the available UI launcher did not start it. Import and rendering of the generated package on the destination computer remain part of acceptance.


## Temporary hats and fitting review build (2026-10-09)

Task 5 adds a reserved `sa_helper_theme_hats` namespace, finite 30s leases with 10s renewal and conditional 1s release, and dry-run-by-default `sa:fit` setup plans. The compatibility manifest remains empty pending native fitting. Explicit candidate packs include allowlisted native gear metadata/images without existing avatar metadata; candidate activation requires active rehearsal and the exact semantic revision. The helper's generated compatibility/pivots are explicitly provisional and cannot count as native proof.

Observed installed contracts: `getUsers` enumerates all active characters without a 100-user/caster exclusion and creates fresh `User` wrappers; ordinary Lua collection conversion remains confirmed. An actual installed `new Script()` clock probe matches the application's script initialization and proves numeric fractional `os.time()` wall time; game `yield()` deltas use scaled Unity time. Paused-game, expired-identical-selection and invalid/backward-clock regression tests enforce conservative ownership. Existing component proofs confirm finite renewal, latest saved choice restoration, same-set overwrite risk and independent other sets. See [native contract and fitting workflow](stream-avatars-native-contract.md#temporary-head-hats-and-operator-fitting-task-5) for evidence limits and the pending graphics checklist.

Synthetic Lua tests cover 1,002 users including a caster, late joins, supported/unsupported avatar changes, stable alternates, stale generations, reserved-set occupancy, finite script-failure restoration, disconnect/reconnect and rehearsal gates, with 32 user reconciliations per render tick. Tests reject ownership, expiry, duration, renewal, revision, permission, wrapper-identity and truncation mutations. Helper tests exercise real temporary files for backup/checksum/atomic namespace-only apply. No private settings were applied, no avatars have an approved fit, and native graphical lease/restoration/animation acceptance remains pending.


The Task5 review also corrected a proved native Unicode caption defect: installed MoonSharp uses UTF16 units and lossy `string.byte`/pattern classes, while standard Lua uses UTF8 bytes. The unchanged updated shipping sanitizer passed18 actual installed-interpreter cases against independent .NET Rune expectations, with zero unpaired surrogate output. Complete CJK/emoji and the48-scalar boundary are preserved. Native font rendering/width remain pending; see the [installed Unicode correction](stream-avatars-native-contract.md#installed-caption-unicode-correction).
