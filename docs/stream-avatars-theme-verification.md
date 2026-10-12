# Stream Avatars scenery theme review and acceptance

The October 12 user decisions remove hats and game-title text and ship the reviewed scenery as static bot assets. The current release includes **24 props and six continuous backdrops**, plus the existing 22 campaign images. Game changes retain welcoming jumps. No theme configuration or pack environment variables are required.

## Review artifacts and exact revision

The tracked default lives in `integrations/stream-avatars/themes/bundled/`, with static game mappings in `integrations/stream-avatars/themes.json`. Bot, Docker, normal packaging and integration previews use this same pack, independently of ignored artwork history. All thirty PNGs, attempt IDs and image hashes match the retained reviewed scenery subset; no imagery was regenerated during packaging or hat removal.

The pack revision is `5e17bac3e480d569591640a6127bf21cb2b6a8384144c1a6076d9a4ebbf037dc`. The default deterministic ZIP contains 55 entries / 52 PNGs; SHA256 is `8d6bcc67a53cbe1de78b9b4a07a1e42f79bb6837b8277bc5d9edebae0f1c4c9f`, and its Lua SHA256 is `675652dc4cd7f16e6483e05dcfaf49504522903584d3583ebea3df617c4205a7`. It contains placeholder credentials and empty avatar/gear metadata envelopes. Import instructions are in [setup](stream-avatars-setup.md#generate-and-import-the-companion).

Placement uses a 1920px reference width, 120px band, 4px baseline offset, four literal 480×64 backdrop repeats and four sparse props per theme. Backdrop visible height is bounded to 40px. Alpha/seam warnings remain for visual review; source/version galleries and previous packs remain in ignored `reports/stream-avatars-artwork/` history.

## Integration preview and native import

Build with `npm run sa:package`, import `dist/stream-avatars/sa-helper-bridge.zip` in Stream Avatars, and restore the existing private address/token. No avatar permissions, pivots or fitting setup are needed. `npm run sa:integration -- --scenario all --crowd 20` covers six donation fixtures followed by all ten theme/game steps; `--scenario themes` runs only the theme cycle. Missing images or native rendering diagnostics fail visibly.

The isolated runner does not observe Twitch or mutate real categories, chat or markers. Stop it before streaming and restore the normal service/address. Explicit development `--candidate-pack` and `--theme-pack` overrides remain available and must match the imported ZIP. Invalid overrides fail rather than falling back.

## Regeneration and approval route

For a scenery correction, use the [artwork workflow](stream-avatars-artwork.md#prepare-and-generate) to revise an exact attempt with feedback, generate/record/validate it, and review a new portable candidate. Original bytes, references, feedback and prior packs remain preserved. No latest-attempt auto-selection occurs. Retired generation, revision, selection and reexport are blocked.

The checked-in pack is trusted repository data shipped at the user's request after local review. Image hashes, catalog geometry and provenance are still validated. This decision supersedes the earlier local-only production-promotion hold for the bundled pack; it does not claim per-image native import proofs. External production packs still require exact approvals and checksum-bound native proofs, including `sa:art release --check`. Copying bundled metadata outside its repository location cannot bypass that gate. See [external promotion](stream-avatars-artwork.md#external-development-pack-promotion-after-review-and-native-acceptance).

## Acceptance evidence

Default-package, production WebSocket, integration CLI, configuration and Docker regressions cover static shipping without local review state. Deterministic builds match byte-for-byte. Full-suite and CI evidence is recorded on [issue #66](https://github.com/stjohnjohnson/extralife-helper-bot/issues/66) and [PR #88](https://github.com/stjohnjohnson/extralife-helper-bot/pull/88).

Earlier native macOS previews completed the ten-step theme cycle with 20 viewers, and focused kitchen previews showed continuous scenery without hats or game-title text. The bundled default companion was also installed with private settings unchanged; a kitchen/large integration run with 20 viewers exited successfully without diagnostics, and a live view showed scenery alongside the campaign caption. These are local visual observations; all-theme seam/crop checks, Linux LAN/OBS measurements and dense-scene performance remain deployment acceptance checks.

| Criterion | Executable evidence | Real-environment acceptance |
| --- | --- | --- |
| Detection, actual game names, aliases, streamed-category priority and neutral | Themes/session/state/integration tests | Manual Twitch category changes with background Realm running |
| Scenery change and welcoming jump without game title text | Protocol/events/companion entrance tests | Crowd jump, title-free view and world switch |
| Sparse transparent bottom-strip scenery | Shared layout, PNG/alpha/geometry and literal repeats | Tile joins, sort order, clipping and measured OBS geometry |
| Same-theme games retain world with a new entrance | State/events/integration and owner-continuity tests | Raft → PEAK scenery continuity with a new jump and no title |
| Donation/campaign and chapter owners remain independent | Owner cleanup, accounting and celebration tests | Confirm clear/reconnect does not remove unrelated decorations |
| Reconnect/restart restores without replay | Stores/lifecycle/server/companion tests | Socket reconnect, F5 and restarts in the native scene |
| Missing images fail visibly; small/dense crowds remain bounded | Package/renderer/runner diagnostics and geometry tests | 0/1/20/100 viewers, missing imports, resized bounds and frame time |
| Scenery-only portable release | Bundled checksum validation, deterministic 52-PNG package and no gear entries | Native import/render of all six worlds; exact approvals required for external replacement packs |

Record the archive checksum/revision, application build, native resolution, OBS crop/transform and evidence hashes. Keep credentials and raw settings private. For each world, test late join/leave, both neutral forms, same-theme switches, reconnect/F5, missing images, narrow/resized bounds, ordinary hearts and all six donation scenarios. Compare dense-scene frame time/FPS with a baseline. Automated tests and dispatch logs do not prove graphical acceptance.

## Retired hat and package history

The fifteen original gear recipes and inventory are removed from tracked shipping files. Their exact specification bytes remain in optional ignored `reports/stream-avatars-artwork/history/retired-spec/`, alongside original/candidate images, prompts, feedback and old packs. Generic history validation/gallery can inspect that archive; active generation/release cannot use it. Runtime hats and the fitting helper are removed.

Earlier 42-design packs, scenery candidate ZIPs and 22-image default ZIPs are preserved locally as historical artifacts. Their hashes and native observations describe their recorded builds, not the current bundled release. See [historical verification](stream-avatars-verification.md#historical-pre-rebase-issue-66-verification-2026-10-09) and [native contract](stream-avatars-native-contract.md).
