# Stream Avatars verification

## Automated evidence

The companion harness executes the shipped Lua in a sandbox with no filesystem, shell, package or OS APIs. Host doubles enforce API names/arguments, copied mailbox state and coroutine behavior. A pinned MIT-licensed **test-only** JSON codec exercises real messages, including validated Node protocol JSON with UTF-8/null fields. Production uses Stream Avatars' own codec; the vendored test library is absent from the ZIP and Docker runtime.

Tests cover authentication and address configuration, movement, empty/dense crowds, rotating density, expiry/duplicates, mode/session/generation changes, disconnect races, reconnect/backoff, bounded mailboxes, malformed packets, owned-user cleanup, missing/delayed images, cancellation and dynamically resized/negative game bounds. Behavioral mutations verify caps, deadlines, cancellation, following and owned action cleanup. CRLF source and paths containing spaces are checked. Missing Lua fails instead of skipping coverage.

Node tests use real localhost HTTP/SSE/WebSocket connections and temporary production stores. They cover shared-listener lifecycle, authentication, current-state reconnects, transient expiry, stale observations, session isolation, shutdown, durable recovery and original-start persistence. Temporary runner process tests cover all synthetic scenarios, no external application clients, signal cleanup, readiness timeouts, port conflicts and untouched production paths. ZIP tests verify native layout, animation metadata, generated image dimensions, catalog expansion, deterministic bytes, placeholders and malformed/bounded PNG inputs.

CI runs the complete suite, lint, production dependency audit and Docker build on Linux with Lua 5.4. A separate Linux job checks Lua 5.2 companion contracts. Windows compilation jobs were removed because stock Windows Lua adds little evidence about the application's embedded runtime. There is no Windows-specific companion code or system Lua installation requirement.

These checks verify executable logic and host API expectations. Actual application rendering, firewall/LAN access, image imports, chosen avatar spacing, OBS cropping and performance still need a real-environment run.

Local checks pass `npm run lint`, the complete `npm test -- --runInBand` suite (**52 suites / 802 tests**, local Lua 5.5.0 plus 88 companion checks under locally compiled Lua 5.2.4; CI separately verifies 5.4 and 5.2), and `npm run audit:prod` with zero vulnerabilities. The regenerated ZIP passes the installed Stream Avatars ZIP-reader/import-type probe; the shipped parser compatibility code also passes against the installed MoonSharp codec.

## Outstanding verification

**Pending for this change:** Import/render the v2 donation package on the destination computer and verify Linux-to-gaming-computer LAN connectivity, OBS transparency/cropping, window resize behavior and dense-crowd frame rate. Local Mac animated hearts and a 100-viewer crowd were previously observed, as recorded below. Fixed 40-unit avatar-top spacing is suitable for the supplied art but needs visual checking for other avatar sizes. Reported avatar teleporting remains unresolved.

The local Docker daemon is unavailable; CI checks the image build. Persistent-volume operation still belongs in the Linux acceptance run. Follow the [acceptance checklist](stream-avatars-setup.md#real-lan-and-obs-acceptance-run) before accepting issue #65.

## Local Mac startup verification (2026-10-08)

A real Stream Avatars startup failed because the installed MoonSharp serializer emits escaped slashes (`\/`) while its lexer rejects them. The host's `get()` helper internally serializes and parses tables, so reading the settings table failed even though the settings JSON was valid. The companion now wraps its script-local `json.parse` to normalize only slash escapes with odd backslash counts; literal backslashes remain unchanged. No private settings or host application binaries are changed.

A temporary .NET probe using the installed `Assembly-CSharp-firstpass.dll` reproduced the original URL round-trip exception and passed after executing the shipped compatibility code. The portable regression reproduces the host's table round trip, authentication and queued messages, checks literal backslash/slash preservation, and rejects mutations that omit normalization or normalize even backslash runs. A near-limit JSON string with 30,000 literal backslashes checks that runs without a following slash are consumed without quadratic retries.

After installing the companion and pressing F5, the real Mac application opened an authenticated loopback connection to the rehearsal server at port 3000 and accepted `crowd 3` and `hearts` commands. The application console reported game bounds **(-480, 0) to (480, 460.5)**. The subsequent connection drop was traced to an unimported `sa_heart`: a missing-image CLR exception escapes Lua `pcall` and stops the main coroutine. After the image was imported, repeated previews and multiple heartbeat intervals kept the connection alive. A pink heart was observed above the real local avatar with the measured game bounds. This verifies local startup and initial transport; it does not verify dense crowd appearance/performance, Linux LAN connection, or OBS acceptance. The local avatar teleporting reported by the operator remains under investigation. The previous startup stack trace remains in the console history until cleared.

## Host image-loading recovery

A temporary probe registered a host object with the installed MoonSharp interpreter and verified that a missing-image `KeyNotFoundException` escapes Lua `pcall`. The companion therefore loads each image in a separate exported `async` worker, preserving the main heartbeat, effect expiry and message loop. A load that has not completed within two game seconds clears the preview and sends `missing-heart-image`.

The host's image callback cannot be cancelled with `stopAsync`. Pending objects remain alive after cancellation until that callback completes; the worker then destroys them without publishing a stale image. Cleanup also handles completion immediately before a clear message, before the parent acknowledges the loaded image. Failed Lua loads and already loaded objects are destroyed immediately.

If a CLR failure prevents the callback from ever returning, a blank pending object and completion marker remain until F5 reload. The foundation preview capped outstanding loads at 100; donation rendering caps them at 128, so repeated failures cannot create an unbounded collection. After repairing an image import, press F5; the host destroys the prior script objects. This host limitation is not equivalent to successful cancellation of an image request.

Six new scenarios cover missing-host exceptions, delayed and indefinitely pending images, callback completion after cancellation, the 100-load cap, and completion immediately before clear. Five additional mutations verify deadline, cancellation, cap, acknowledgment handling and hiding images before the host completes loading. Pending images stay at zero scale until the parent has acknowledged their load and positioned them for an active effect, preventing a late callback from flashing a cancelled heart. These scenarios and mutations remain in the executable harness.

## Imported animation loop setting

The local imported `sa_heart` had eight 32×32 frames at 12 FPS, but its saved loop count was `1`. Inspection of the installed application's image loader and animator confirmed that Lua playback uses this saved count and holds the last frame after a single cycle, explaining a still heart that continued to follow its avatar. The image editor's preview forces infinite looping independently of the saved count. Its infinity button stores `loopTotal = 61`; the local image setting was changed to this value with a private backup and a semantic check that every other saved setting was preserved. Setup instructions now name the infinity button explicitly. This is an image-import setting correction; the Lua companion did not need a change.

## Dense crowd and portable packages

After saving infinite looping, the operator confirmed that the animated heart looked correct. A subsequent local Mac rehearsal selected the actual Custom Lua streaming service and allowed 101 avatars. A dense 100-viewer synthetic crowd, including `sa_rehearsal_100`, and many simultaneous pink hearts were visually observed. The earlier renderer capped each preview at 50 hearts and rotates eligible users between previews. This establishes local dense appearance, without measuring frame rate or verifying LAN/OBS behavior. The reported avatar teleporting remains unresolved.

`npm run sa:package` generates an import ZIP from the shipped Lua and repository image manifests. Automated tests unzip the real archive and check native command settings, image bytes, frame/FPS/loop metadata, automatic catalog expansion, deterministic output, placeholder-only settings, invalid inputs, path/symlink rejection, full PNG decoding with bounded inflation, malformed IHDR/IDAT with valid checksums, multi-row sheets, and CLI output paths with spaces. A temporary .NET probe used the installed application's `StreamAvatars.Zip.dll` and deserialized `data.txt` into its actual `SA_ImportExport.BuildExportFiles` type. It accepted all four foundation entries, the On Connect command, 32×32 frames, eight frame timings at 12 FPS, the native infinite loop value `61`, and placeholder credentials. This is a native import-format check, not a completed graphical import: the application was not running and the available UI launcher did not start it. Import and rendering of the generated package on the destination computer remain part of acceptance.

### Donation action and asset evidence (2026-10-09)

Read-only inspection of the installed macOS host's `Assembly-CSharp.dll` verifies `User.runCommand(string cmd, bool runQuietly=false)` forwards `true` to the command system's `preventOutput`. The companion uses fixed localized jump/dance commands with `true`, never donor text. `User.getState()`/`getAnimation()` expose the current action; `User.exitState()` transitions to idle without touching equipment. Native dance plays the avatar's configured dance animation and may return to idle; the companion repeats eligible idle dances within the party and exits only its still-matching dance on expiry/clear. Native animation availability, command restrictions/cooldowns, visual behavior and performance remain deployment acceptance checks.

The installed `LuaScriptFunctions.MainGetUsers()` iterates the active-character map, which includes the active caster. No donor-to-Twitch identity association is needed. Automated fixtures cover 101 active hearts, bounded confetti/captions, layer failures, absolute deadlines, generation changes, duplicate/older events and preserving another avatar action. Deterministic transparent PNGs and native animation metadata are generated by `scripts/sa-assets.js`; the ZIP contains no private settings.

References: [User runCommand](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/classes/user/runcommand), [getUsers](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/global-functions/getusers), [native dance](https://docs.streamavatars.com/stream-avatars/commands/minigames-and-fun-commands/dance). Host inspection resolves the contradictory quiet-flag prose in the global runCommand documentation. It confirms signatures and control flow, not a completed visual test.


## Issue #67 acceptance coverage

| Acceptance | Automated evidence | Deployment check |
| --- | --- | --- |
| Timestamp/session eligibility, registration/participant exclusions, exact cents | donationSource, donationMoney and broadcastDonations tests | Production session/grace behavior |
| API version/order/conditional pagination, failed/unstable pages | donor fixture contract and donationSource tests; official DonorDrive docs linked in design | Inspect sanitized poll errors if API unavailable |
| Once-only IDs, unknown-to-known/conflicting amounts, out-of-order gifts | broadcastDonations and broadcastDonationLifecycle tests | Reconnect/restart without replay |
| Mid-session reconciliation/migration and persisted thresholds | broadcastDonationLifecycle and donationIntegration tests | Preserve Linux volume during restart |
| Hearts, jump, batching, caster/anonymous recognition | ordinary-101, movement, late join and real Node-to-Lua harness; runner ordinary/anonymous/batch | Checklist steps 2–3 |
| Configurable intervals, cumulative banners, multi-cross coalescing | streamAvatarsConfig, celebrations, reducer and milestone-banner tests | $500 / $1,550 runner scenarios |
| Once-only live campaign-goal crossing; silent baseline/goal change | reducer, delayed-goal integration and goal-banner tests | goal scenario |
| Existing Hue, chat, markers, summary and goal command | app, hueControl, commands and streamMarkers regression suites | Optional --hue and existing production outputs |
| Gear/decor ownership, stale effects, failures/disconnect | gear-preservation, celebration-faults/missing layers, mutations, protocol/server and reconnect tests | Checklist steps 4–5 |
| Complete fixture preview without external clients or production writes | DevelopmentRunner and IntegrationCli tests, actual child processes/localhost sockets | Checklist steps 1–6 |

The approved temporary subsystem runner replaces issue #67's reference to #65's interactive rehearsal. It covers the same preview cases with synthetic inputs through shared production code. It requires no game theme, donor identity linking or fresh-online check per effect; it displays no special incomplete-total caption. A normal CLI run never initializes physical Hue, even if Hue environment settings exist.

The automated transport fixture is not a visual pass on the destination deployment. Existing foundation Mac observations above remain historical; they do not establish that the new confetti/captions/actions passed LAN/OBS acceptance. Native command restrictions, animation availability, teleporting, dense performance and persistent-volume deployment remain explicit manual checks.

The v2 ZIP also passes the installed native Stream Avatars ZIP reader/import-type probe: 22 entries, 19 images, the 431×23 goal caption, four confetti frame timings and placeholder credentials. This is import-format evidence, not graphical acceptance. Production audit reports zero vulnerabilities.

## Final branch review

A fresh whole-branch review found two accounting edge cases, both fixed with failing-then-passing regression tests: campaign reconciliation now waits independently for its first fresh observation after startup/recovery, and revealed historical amounts no longer suppress unrelated new-gift milestones. Mixed scans are tested in both input orders; revelation-only crossings remain silent. Production's separate donation-accept/campaign-refresh sequence is covered.

Deferred minor: the source collapses repeated IDs within one scan before reducer conflict diagnostics, so contradictory duplicate rows in that scan retain the first accepted amount without a warning. Conflicts against previously persisted facts are still diagnosed; no duplicate ID adds money twice.
