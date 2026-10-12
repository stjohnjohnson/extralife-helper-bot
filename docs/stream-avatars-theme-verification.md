# Stream Avatars scenery theme review and acceptance

The user's October 12 design decision removes hats and keeps background events. Active scope is **30 unapproved scenery designs: 24 props and six backdrops**. Each game change retains the welcoming jump and compact caption. Default packaging preserves all 22 campaign images; a scenery candidate package contains 52 script PNGs. Production still requires explicit art approval and checksum-bound native image import proofs. No push or pull request is authorized yet.

## Review artifacts and exact revision

Ignored local artifacts remain in the prepared review workspace:

- [Scenery-only native ZIP](../reports/stream-avatars-artwork/scenery-preview.zip), [portable catalog](../reports/stream-avatars-artwork/scenery-preview-pack/catalog.json) and [explicit thirty-attempt input map](../reports/stream-avatars-artwork/reviewed-scenery-candidate-manifest.json).
- [Source/version/feedback gallery](../reports/stream-avatars-artwork/gallery/task6a-review.html) and [six existing reference scenes](../reports/stream-avatars-artwork/review-ready-previews/index.html). These retained historical reviews also include retired hats, clearly outside active scope.

The scenery pack revision is `5e17bac3e480d569591640a6127bf21cb2b6a8384144c1a6076d9a4ebbf037dc`. Its thirty attempt IDs, image hashes and PNG bytes match the exact retained scenery subset of the older pack. There are no gear/compatibility files or catalog gear entries. The final scenery ZIP SHA256 is `145b662d089f6413c1a837219ac872da64916e76cabc6242d2acfa3b4c9f406c`; packaged Lua SHA256 is `e5fa88937c2c3c0d987976b754910825b4457bcf8a6d040da09eb64978f6d8c5`. A deterministic rebuild matched all 55 entries / 52 PNGs, with no gear or avatar entries. Build/import commands are in [setup](stream-avatars-setup.md#candidate-import-and-matching-integration-runner). The thirty designs remain unapproved, with zero selections.

Placement remains a 1920px reference width, 120px band, 4px baseline offset, four literal 480×64 backdrop repeats and four sparse props per theme. Backdrop visible height is bounded to 40px, top four rows are transparent and the bottom base has alpha ≥128. Guide silhouettes and stream screenshots are composition references. Alpha/seam warnings remain for visual review; no image regeneration or source repair occurred during hat removal.

## Integration preview and native import

Import only the current scenery ZIP for deliberate offline review, then restore the private connection settings. The package contains placeholder credentials and empty avatar/gear metadata envelopes. It assigns no hats, changes no avatar permissions/pivots, and requires no fitting setup.

The isolated runner uses an explicit `--candidate-pack` or `--theme-pack` first, then an approved `STREAM_AVATARS_THEME_PACK`. Otherwise, a run containing themes uses the validated repository-local `reports/stream-avatars-artwork/scenery-preview-pack`. `--scenario all` runs six donation fixtures followed by all ten theme/game steps; `--scenario themes` runs only the theme cycle. Production rejects candidates. Invalid/missing required images or a native world/campaign rendering diagnostic produces actionable import guidance, rather than silently reporting success.

The runner has no Twitch observer or production controller. Keep Twitch offline for operator review, stop with SIGINT before streaming, and restore the normal service/address. Temporary state is removed on exit; it sends no category mutations, chat or markers. Snapshots/reconnects do not replay entrances. Use `--theme kitchen --scenario ordinary` for theme/donation interaction. Node and packaged Lua must use the same scenery revision.

## Regeneration and approval route

Review full sources, exports, warnings and exact attempt history in the gallery. For an active scenery correction, export feedback and revise one identified design:

```sh
npm run sa:art -- revise --asset kitchen.scenery.prep-counter \
  --attempt EXACT_ATTEMPT_ID --feedback-file /private/path/artwork-feedback.json
```

The new job preserves its parent, original bytes, references and feedback. Use the established [artwork workflow](stream-avatars-artwork.md#prepare-and-generate) to generate/record/validate/review it. A geometry-only reexport uses `record --from-attempt EXACT_ATTEMPT_ID --fit` without another generation call. No hat generation/revision/reexport jobs are active.

Update the deliberate thirty-attempt map for a revised candidate, preserve old versions and publish a new portable destination. No latest-attempt auto-selection occurs. Publication locks serialize cooperating publishers; maintain exclusive destination ownership because the final POSIX rename is not an atomic no-replace guarantee against another process creating an empty directory.

After explicit user approval, record exact selections and genuine checksum-bound native image proofs, then pass `sa:art release --check`. Promotion revalidates all thirty selections, image names/checksums, source/reference integrity and staging inputs. See [strict promotion](stream-avatars-artwork.md#production-promotion-after-review-and-native-acceptance). Native graphical image acceptance, Linux LAN/OBS measurements, artwork approvals, production promotion and final readiness remain separate from automated dispatch checks.

## Acceptance evidence

Final Node 24.21.0 / Lua 5.4.9 verification passed `npm run lint` and the complete `npm test -- --runInBand`: **61 suites / 1,320 tests**. The separate native companion/protocol suite passed **284 tests** under Lua 5.4 and Lua 5.2. Removed hat-only tests accompany removal of their feature; scenery, donation and production-proof checks remain active.

After the final package was installed and F5 reloaded the companion, a real local `themes` run with 20 viewers completed all ten steps with exit 0 and no diagnostic. The visible Minecraft scene showed continuous backdrop and props behind ordinary avatars, with no added hats. This is local visual evidence, not acceptance of every theme's joins, clipping, LAN/OBS geometry or dense performance.

| Criterion | Executable evidence | Real-environment acceptance |
| --- | --- | --- |
| Detection, actual game names, aliases, streamed-category priority and neutral | Themes/session/state/integration tests | Manual Twitch category changes with background Realm running |
| Scenery change, compact caption and welcoming jump | Protocol/events/companion entrance tests | Crowd jump, native glyphs/width and world switch |
| Sparse transparent bottom-strip scenery | Shared layout, PNG/alpha/geometry and literal repeats | Tile joins, sort order, clipping and measured OBS geometry |
| Same-theme games retain world with a new entrance | State/events/integration and owner-continuity tests | Raft → PEAK scenery continuity with a new caption/jump |
| Donation/campaign and chapter owners remain independent | Owner cleanup, accounting and celebration tests | Confirm clear/reconnect does not remove unrelated decorations |
| Reconnect/restart restores without replay | Stores/lifecycle/server/companion tests | Socket reconnect, F5 and restarts in the native scene |
| Missing images fail visibly; small/dense crowds remain bounded | Package/renderer/runner diagnostics and geometry tests | 0/1/20/100 viewers, missing imports, resized bounds and frame time |
| Scenery-only portable release | Thirty-design selection gate, deterministic 52-PNG package and no gear entries | Native import/render of all six worlds and thirty exact art approvals |

Record the archive checksum/revision, application build, native resolution, OBS crop/transform and evidence hashes. Keep credentials and raw settings private. For each world, test late join/leave, both neutral forms, same-theme switches, reconnect/F5, missing images, narrow/resized bounds, ordinary hearts and all six donation scenarios. Compare dense-scene frame time/FPS with a baseline. Automated tests and dispatch logs do not prove graphical acceptance.

## Retired hat and package history

All twelve former active hats and three earlier backpack/goggles definitions remain unchanged in `inventory.retiredAssets`, with recipes, original/candidate PNGs, exact prompt provenance, selection/import history and fitting evidence preserved. The historical gallery still exposes their details. Active release/catalog/package commands exclude them and cannot use a retired approval to fill missing scenery. The `sa:fit` helper and runtime hat feature are removed.

The old `rehearsal-pack` remains unchanged at revision `293087deb6e6f1455a6cf6af0b481caf65641d0b0072e78e4d9db2101fe90dad`; it is a preserved 42-design historical pack, not the active fallback. The preserved `rehearsal-review.zip` has SHA256 `b3e786e1e45bd956bfbeafe851a58ab98159fa336c748044c09ff0fe6c207ebd`. Earlier archive and native-proof reports remain historical. Prior reports naming `d1227960...` describe their recorded build; that filename/checksum is not the current scenery artifact. No old pack or ZIP was overwritten to create the scenery pack. See [historical verification](stream-avatars-verification.md#historical-pre-rebase-issue-66-verification-2026-10-09) and the [native contract](stream-avatars-native-contract.md) for their evidence limits.
