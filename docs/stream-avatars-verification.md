# Stream Avatars verification

Campaign-progress celebrations supersede the original broadcast-total and simultaneous-party requirements in issue #67. Bot and companion now use protocol v3; reimport the ZIP and restore private address/token together with the bot update.

## Rebased issue #66 evidence (2026-10-12)

Node.js 24.21.0 and Lua 5.4.9 passed `npm ci`, `npm run lint`, and the complete `npm test -- --runInBand`: 1,314 tests across 63 suites. Coverage is 93.64% statements, 89.52% branches, 95.94% functions and 97.51% lines, against unchanged 85/80/80/85 thresholds. The complete companion suite also passed 256 tests using Lua 5.2.4. `npm run audit:prod` found zero vulnerabilities; the full install audit still reports development dependency vulnerabilities.

Real isolated loopback WebSockets exercised the new `sa:integration` runner with the exact candidate pack: all six themes, Raft → PEAK, Minecraft Bedrock alias and neutral; kitchen with an ordinary donation; and the puzzle game with a milestone recognition/party sequence. Every temporary state directory was removed. The suite also checks exact old-v3 donation-only negotiation, no entrance replay, independent game recovery, stale-observation fencing, native-action owner precedence, temporary hats, and all existing behavioral mutations. These checks establish dispatch and contracts; native graphical rendering and fitting remain pending.

Default ZIP SHA256 is `771483758e67633de7de24e64a834612b4d5a2e13d3f8cbb13836b880d078fbf` (25 entries, 22 PNGs). Candidate ZIP SHA256 is `5f9e51999ca30f62c260015b885d8ea83887b43ac093aa6e2b9c2ee3d326f43d` (67 entries, 64 PNGs; 52 script images and 12 gear pieces). Both builds are deterministic, contain placeholder credentials and no avatar definitions. All 22 base PNGs and 42 candidate PNGs match their sources. Hash verification preserved 1,182 historical non-ZIP artwork/report files and the previous 43-PNG ZIP. Strict `sa:art release --check` exits 1 with zero selected assets, as required.

## Verified behavior

Fresh donations, including matching records, receive five seconds of hearts, their combined amount/Thank you caption and a random jump or paired hug. Nearby gifts extend recognition only to ten seconds from its original start. A qualifying campaign milestone follows recognition for 18 seconds; a goal follows for 20 seconds and wins its simultaneous milestone. The participant's fresh `sumDonations` supplies the actual campaign banner, never an estimated sum of gifts. Delayed API totals can leave a gap after thanks without repeating it.

Startup/restart/reset independently baseline donations and campaign totals silently. Accounted IDs and thresholds persist before output. A final ready-companion disconnect cancels visual work and correlation; reconnect publishes current totals without replay. Gifts during a party wait in one combined next thank-you. Late goal confirmation for the existing batch retains its sequence and dance attempts, with a 38-second maximum from the original party start. Campaign controls need confirmed admin authorization, with no Twitch offline requirement. Game lifecycle uses its own legacy-migrating `state.json`; its retained donation fields are inert and never feed campaign accounting.

## Historical campaign evidence (2026-10-11)

Using Node.js 24.19.0:

```sh
npm ci
npm run lint
npm test -- --runInBand
npm run audit:prod
LUA_BIN=/path/to/lua5.2 npm test -- --runInBand --coverage=false --runTestsByPath tests/streamAvatarsCompanion.test.js
npm run sa:package
```

The current issue #66 verification record is below. Earlier local Mac heart observations establish only the earlier bridge behavior. The installed native reader/type and parser probes are component evidence; they do not establish graphical import, theme rendering or native fitting.

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

The local Docker daemon is unavailable; CI checks the image build. Persistent-volume operation still belongs in the Linux acceptance run. Follow the [bridge acceptance checklist](stream-avatars-setup.md#real-lan-and-obs-acceptance-run) for issue #65 and the [six-theme acceptance matrix](stream-avatars-theme-verification.md#acceptance-evidence) before accepting issue #66.

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

Failed or two-second timed-out world images skip only the affected tile/prop and send the allowlisted `missing-theme-image` diagnostic. A shared 30-second cooldown coalesces repeated backdrop tiles and rapid world reloads. This diagnostic contains no image path or extra metadata; surviving scenery, hearts and the transport continue independently. Zero-viewer regressions cover failures and timeouts, avoiding unrelated gear diagnostics, and check late callback cancellation and the cooldown.

If a CLR failure prevents the callback from ever returning, a blank pending object and completion marker remain until F5 reload. The companion caps outstanding loads at 100, so repeated failures cannot create an unbounded collection. After repairing an image import, press F5; the host destroys the prior script objects. This host limitation is not equivalent to successful cancellation of an image request.

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


## Historical pre-rebase issue #66 verification (2026-10-09)

The review candidate has 42 valid but unapproved designs, 118 provisional avatar mappings and no approved native fits. At that pre-campaign revision, the default package contained one animated heart; the current default preserves all 22 campaign images. The exact [candidate artifacts and revision](stream-avatars-theme-verification.md#review-artifacts-and-exact-revision), [offline import instructions](stream-avatars-setup.md#candidate-import-and-matching-integration-runner), [read-only fitting review](stream-avatars-theme-verification.md#read-only-fitting-review) and [regeneration route](stream-avatars-theme-verification.md#regeneration-and-approval-route) are available for operator review.

Local checks use a supported Node 24.x runtime and explicit Lua versions matching CI. Task 7 completed `npm ci`; its full development-dependency audit reported 34 findings (21 moderate, 12 high, one critical). `npm run audit:prod` separately passed with zero production vulnerabilities. No dependency or lockfile change was made. After the final review corrections, full lint passed and the exact existing Lua 5.2 CI compatibility command passed all **149 companion contracts and mutations**, with no skips. With Node 24.19.0 (npm 11.5.1) and explicit Lua 5.4.9, the complete `npm test -- --runInBand` suite plus a test-start diagnostic reporter passed **50 suites / 1,007 tests**, zero skips, in 114.658s. Coverage was 94.41% statements / 89.86% branches / 95.96% functions / 97.63% lines; existing full-suite thresholds and tests remain unchanged. The reporter only records suite start/result and does not change execution or coverage. The compatibility job uses its established `--coverage=false` command to exercise Lua; the complete Lua 5.4 run supplies the required JavaScript coverage evidence.

`npm run sa:package` passed and regenerated the default heart-only ZIP. Two fresh candidate builds were byte-identical to each other and the updated saved review ZIP: SHA256 `9b3969b5ab128ebadfb390268de0f39d62be351568ac3aa35fb94dc18addc7fc`, 46 archive members / 43 PNGs (heart + 30 world designs + 12 hats), revision `293087deb6e6f1455a6cf6af0b481caf65641d0b0072e78e4d9db2101fe90dad`. The prior ZIP (`5136b558c3f2ceee58b140f8c0383bcb8a68718cf341f950430eb0bd9325ab09`) is preserved as an ignored historical version before replacement. Hash/file-set checks confirmed all 457 snapshotted artwork source/export/history, portable catalog and preview files unchanged, including all 42 assets and 118 provisional mappings. Preview metadata carries the same revision. Task 7's `npm run sa:art -- release --check` exited 1 with 42 required / zero selected assets; this is the expected production refusal and leaves all approvals pending.

The exact updated review ZIP passed 97 fresh checks through the installed `Ionic.Zip.ZipFile.Read`, `SA_ImportExport.BuildExportFiles` deserializer and native serializer round trip. Independent byte checks passed 393 assertions, covering archive/PNG CRCs, decompression, dimensions and every candidate PNG's equality to its portable export/hash; heart bytes match the repository source. Native metadata contains an empty `avatar` root, one reserved nonrandom gear set, twelve 32×32 PPU-1 hats and 31 script-image settings (heart + world) with center pivots and metadata scale 1. Packaged caption source retains SHA256 `dfae1eabb951f2ed8891591761dd6b815b01ad1b4ca2fdf481f5c1e1086a4818`, matching the shipping function that passed 18 installed-interpreter Unicode checks. These checks did not execute the command or invoke the native import entrypoint, apply permissions/pivots, enumerate live users or produce graphical evidence. Probe sources/results remain ignored under `reports/stream-avatars-theme-proof/final-pack-native-check/`, with the previous ZIP's outputs/report preserved in `history/zip-5136b558/`; no installed DLLs or private settings are committed.

Native graphical import, all six theme renders, both-direction/action hat fitting and restoration, Linux-to-destination LAN, measured OBS geometry/dense performance, all 42 approvals, production promotion and supported variant proof remain pending. Docker CLI 29.8.1 could not connect because the local daemon socket was absent; the required CI image build remains pending. No push/PR or required CI run occurred in this ready-for-review stage, and no #67/#68 completion is claimed. This historical movement report was subsequently resolved by display settings on main.


### Unresolved local Node process crash

The first fresh Task 7 full-suite invocation exited 139 before any suite result. macOS recorded `EXC_BAD_ACCESS` / `SIGSEGV` at address `0x0e`, with V8 `ClearStaleLeftTrimmedPointerVisitor` → `InternalFrame::Iterate` → `MarkCompactCollector` garbage-collection frames. An earlier local Node diagnostic has the same stack. The next complete run, on the same Node 24.19.0 / V8 13.6.233.17-node.51 runtime with a suite-start reporter, passed all 1,001 tests; its first suite was `streamAvatarsArtwork.test.js`. No runtime flags, dependencies, assertions or coverage settings were changed to obtain the pass. The process crash's trigger/root cause is still unknown; it is not claimed fixed or dismissed as a unique event. Task 5's earlier transient exit 139 remains part of this history. A future recurrence needs preserved process diagnostics and a supported-runtime comparison before further release claims.
