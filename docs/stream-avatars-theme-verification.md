# Stream Avatars theme review and acceptance

The issue #66 build is ready for artwork and operator review. Production release remains gated: **42 valid candidate designs, zero approved selections, 118 provisional avatar mappings, zero native-approved fits**. Default packaging retains all 22 campaign images and excludes unapproved theme assets. Candidate flags do not authorize production, and `npm run sa:art -- release --check` currently refuses release as intended. No private settings were applied during this review stage; no push or pull request is authorized yet.

## Review artifacts and exact revision

Generated artifacts are ignored local files, available in the prepared review workspace rather than committed assets:

- [Six reference scenes and hat review index](../reports/stream-avatars-artwork/review-ready-previews/index.html): block-world, kitchen, outdoor, puzzle, space-salvage and party, each at 1920×1080.
- [All twelve head hats](../reports/stream-avatars-artwork/review-ready-previews/all-12-hats-contact-sheet.png): unchanged 32×32 exports at 1×/4× against dark, light and checker backgrounds.
- [Source/version/feedback gallery](../reports/stream-avatars-artwork/gallery/task6a-review.html) and [preview metadata](../reports/stream-avatars-artwork/review-ready-previews/metadata.json).
- [Candidate native import ZIP](../reports/stream-avatars-artwork/rehearsal-review.zip) and [portable catalog](../reports/stream-avatars-artwork/rehearsal-pack/catalog.json).

The exact Node, Lua, portable catalog and preview revision is `293087deb6e6f1455a6cf6af0b481caf65641d0b0072e78e4d9db2101fe90dad`. After the main/v3 rebase and native-null correction, review ZIP SHA256 is `d12279609ef0db0146002c7c7ce5d018f9f1762c1f9f6165c29116411e1ca2e3` (67 entries, 64 PNGs: 22 campaign images plus 42 theme candidates). All 42 assets, 118 provisional mappings, geometry and previews retain this revision. The previously reviewed 64-PNG ZIP remains in `history/reviewed-52f6f81-5f9e51999ca3.zip`, SHA256 `5f9e51999ca30f62c260015b885d8ea83887b43ac093aa6e2b9c2ee3d326f43d`. The previous 43-PNG ZIP remains byte-identical in local history as `pre-v3-rebase-9b3969b5ab12.zip`, SHA256 `9b3969b5ab128ebadfb390268de0f39d62be351568ac3aa35fb94dc18addc7fc`. Changing a candidate, geometry or compatibility changes the revision; regenerate the ZIP and use a matching integration runner afterwards.

Previews use shared runtime placement: 1920px reference width, 120px band, 4px baseline offset, four literal 480×64 backdrop repeats and four sparse props per theme. Backdrop visible height is bounded to 40px, top four rows are transparent and the bottom base has alpha ≥128. Guide silhouettes and supplied stream screenshot content are composition references; no hat is shown as a proved native fit. Alpha/seam warnings are preserved for visual review. No silent image repair, approval or source/history replacement occurred. The twelve active gear designs are hats/helmets; retired backpack and standalone goggles remain in historical records only.

## Integration preview and native import

Follow [candidate import and matching integration runner](stream-avatars-setup.md#candidate-import-and-matching-integration-runner). Import the candidate ZIP only for deliberate offline review, privately restore connection settings after reimport, and reserve `sa_helper_theme_hats` exclusively for this integration. Fresh gear import does not add `CanUseGear` or per-frame pivots. Native graphical import and live activation are still pending.

The candidate catalog is loaded only with explicit `sa:integration -- --scenario themes --theme all --candidate-pack <directory>`. Approved packs use `--theme-pack`; production rejects candidate directories. The temporary runner has no Twitch observer or production controller. Keep Twitch offline for operator review, stop with SIGINT before streaming, and restore the normal service/address. Its temporary directory is removed on exit; it sends no Twitch category mutations, chat or markers. Snapshots and reconnects never replay entrances. Use `--theme kitchen --scenario ordinary` to verify theme/donation interaction. Candidate and packaged Lua revisions must match for themes and hats to activate.

## Read-only fitting review

Use explicit private settings and a **new** private plan path, keeping both outside Git:

```sh
npm run sa:fit -- --settings /private/path/streamavatars_json.txt \
  --plan /private/path/new-theme-fitting-plan.json
```

This is dry-run by default and does not change settings. It accepts the native settings `avatarData` root and one leading UTF-8 BOM. Its raw checksum binds original bytes; proposed coordinates are starter values, not measured head locations. The actual read-only review produced 118 eligible avatars and zero skipped; all remain provisional (`graphicsVerified:false`). Review permissions, canvas dimensions, animation/frame coverage and every pivot in the plan. Use optional `--overrides /private/path/fit-overrides.json` to propose measured frame coordinates in a new plan; see [native fitting schema and apply contract](stream-avatars-native-contract.md#temporary-head-hats-and-operator-fitting-task-5). Existing owned-set data is skipped intact. Never publish raw settings or avatar metadata in review artifacts.

Private application of a plan remains outside this review authorization. The separate explicit apply route requires an app-closed confirmation, unchanged source checksum and verified private backup; synthetic tests alone do not authorize an operator apply. A real fit must cover both directions and idle/run/jump/sit, every supported primary/alternate hat and latest saved appearance restoration. Only the twelve canonical 32×32 pieces at PPU 1 are supported; if another fitted variant is required, that avatar's production support remains blocked until schema/runtime support and native proof are added.

## Regeneration and approval route

Review the full source, export, warnings and exact attempt history in the gallery. Export feedback and revise one identified design:

```sh
npm run sa:art -- revise --asset kitchen.scenery.prep-counter \
  --attempt EXACT_ATTEMPT_ID --feedback-file /private/path/artwork-feedback.json
```

The new job preserves parent attempt, original bytes, references and feedback. Use built-in image generation with its exact prompt/reference inputs, then record, validate and review the new job as described in the [artwork workflow](stream-avatars-artwork.md#prepare-and-generate). Do not silently edit alpha/seams or reuse a failed output as approval. A geometry-only reexport uses `record --from-attempt EXACT_ATTEMPT_ID --fit`; it creates a new immutable attempt without a new generation call or selection change.

For a revised candidate, update the explicit 42-attempt input map deliberately, preserve its old version and build a **new** portable candidate destination with `sa:art candidate-pack`; package that directory and refresh the shared-geometry previews. Optional compatibility remains provisional. No automatic latest-attempt selection occurs. Publication locks serialize cooperating publishers, but the final POSIX check/rename can replace an empty directory created concurrently by a different local process; maintain exclusive destination ownership. Inspect abandoned stage/lock files after process termination before retrying.

After explicit user artwork approval, record exact selections and genuine checksum-bound native import proofs, then pass `sa:art release --check`. Production promotion additionally requires all twelve canonical native hat proofs, matching fit revisions, finite measured positions/scales, actions/directions and restoration evidence for every supported avatar. See [strict promotion](stream-avatars-artwork.md#production-promotion-after-review-and-native-acceptance). Commit approved exports/provenance only after those gates. User final readiness, push/PR and required CI remain later steps; no #67/#68 completion is claimed.

## Acceptance evidence

The table maps the current issue #66 checklist to local evidence and the remaining real-environment check. Later user design direction restricts gear to head hats and adds minimal continuous backdrops; the issue's older backpack direction is superseded. Local tests do not close graphical criteria.

| Issue criterion | Executable evidence | Pending acceptance |
| --- | --- | --- |
| Existing detection, actual names, configurable aliases/mappings, neutral unknown/Just Chatting | `streamAvatarsThemes`, `broadcastSessionState`, `broadcastSessionLifecycle`, `streamAvatarsIntegration` tests | Real manual Twitch category change without Discord; observe correct caption/theme |
| Streamed game wins over background Minecraft Realm | Lifecycle/integration streamed-category priority, fallback and out-of-order poll tests | Keep Realm running while switching streamed category and verify no stale Minecraft world |
| Scenery/gear switch, compact caption and welcoming jump | Events/protocol/companion tests: 6000ms entrance, 10000ms expiry; installed caption passes 18 scalar checks | Actual crowd jump, caption glyphs/width, image sorting and hat switch |
| Sparse transparent scenery within bottom strip | Shared theme layout, PNG/alpha/geometry checks and six literal-repeat mockups | Native tiles/seams/order/clipping on measured strip and transparent OBS scene |
| Gear lasts, covers late arrivals, preserves saved appearance and restores | Companion lease/ownership/mutation tests: 30s lease, 10s renewal, conditional 1s release; 1002 synthetic users/caster and avatar changes | Real late arrival, saved-avatar/palette/hat change, disable, expiry and restoration clips |
| Same-theme games get caption/entrance without reset | State/events/integration/companion same-theme generation and owner-continuity tests | Big Walk → PEAK native scene/hat continuity with new caption/entrance |
| Game layer separate from additive marathon decoration | Session/world/transient owner tests and protocol capability gates | Confirm owner cleanup leaves independent decorations intact; no chapter feature in this scope |
| Reconnect/restart restores without entrance replay | Store/lifecycle/server/integration/companion snapshots, schema migration and recovery tests | Socket reconnect, F5, bot restart and companion restart in native scene |
| Missing assets/unavailable gear fall back; bounded small/large crowds | Package/gear/layout/companion missing/delayed image, permission, revision, capability and resized/negative-bound tests | Missing native import, unsupported avatar, narrow/resized strip, 0/1/20/100 crowds and performance |
| Six reusable sets, configuration, import and per-theme preview | 42 valid candidates, 12 hats, six preview controls, deterministic ZIP and installed typed reader | Approve all 42 exact designs; graphically import/finally fit supported avatars |
| Offline rehearsal with real LAN, late avatars and restoration without saved writes | Real loopback socket and temporary-state isolation tests; earlier local Mac hearts/crowd observations | Linux → gaming-computer LAN/OBS run with all six candidate themes while Twitch offline |

## Real-environment run and recording

Keep Twitch offline and record the exact archive checksum/catalog revision, Stream Avatars build, enabled avatar packs, tested avatar keys and native evidence hashes. Keep credentials and raw settings out of recordings. For **each of six themes**, test 0/1/20/100 viewers, late join/leave and avatar/saved-gear changes. Record each hat in both directions and idle/run/jump/sit, actual finite expiry/renewal/release and latest-choice restoration. Test shared-theme game switches, unknown/Just Chatting/neutral, missing assets, occupied reserved namespace and independent foreign sets. Test narrow/resized bounds, reconnect/F5 and bot/companion restart without old entrances; ordinary hearts must still animate.

Measure native canvas bounds and OBS source/crop/transform against the 1920×1080, 120px-band, 4px-baseline reference before production fitting. Script images use metadata scale 1 (PPU 1) and center pivots; installed static geometry proves those inputs, but transparency/tight-mesh bounds, scene-parent/camera scale and OBS transforms need actual measurement. Record resolution, frame rate, crop, scale, strip dimensions and dense-scene frame time/FPS against a baseline. The earlier teleporting/“Height is fixed in settings” issue was resolved by display settings on main; distinguish any new movement regression.

Historical build-25169902 evidence comprises API/collection/clock component probes, 18 unchanged shipping-caption interpreter checks and the pre-rebase ZIP’s 97 typed-reader / 393 byte checks. On current build 25831299, the retained format report for reviewed ZIP `5f9e51999ca30f62c260015b885d8ea83887b43ac093aa6e2b9c2ee3d326f43d` passes 330 native metadata and 3,643 byte/source checks. Eight additional isolated decoder expressions establish native-null representation and safe normalization; they do not execute the whole companion. The core assembly changed, so prior behavior proofs remain historical. Each changed ZIP requires a new exact-hash format check. These results establish neither graphical import nor runtime fit/restoration. Linux LAN, native graphics, OBS geometry/performance, all artwork approvals, supported native fits/variants, production promotion, Docker build and required CI remain pending. See [verification record](stream-avatars-verification.md).
