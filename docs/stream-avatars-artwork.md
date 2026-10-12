# Stream Avatars artwork workflow

This developer workflow prepares 30 independent scenery designs, preserves generated originals, exports review sprites, and collects targeted feedback. Generation is performed by a Codex agent through built-in `image_gen`, with `transparent_background: true`; the CLI never calls an image API. Artwork is separate from the game/theme runtime and native Stream Avatars rendering.

Use Node **24.15.0 or newer within 24.x**, then `npm ci`. `pngjs@7.0.0` is the shared pinned production dependency for artwork decoding and native package generation, following its [primary decoder documentation](https://github.com/pngjs/pngjs): real PNG decoding, RGBA pixels, and CRC checking. Use `sa:package` to build portable archives and `sa:integration` for explicit candidate preview alongside the campaign scenarios.

The portable specification lives in `integrations/stream-avatars/artwork/`: `style.json`, the 30-active-entry `inventory.json`, and one exact prompt in `recipes/` for each asset. Active IDs have the form `<theme>.scenery.<subject>` or `<theme>.backdrop.minimal-strip`. Each theme has four props (96×64, 64×64, 32×64, 32×32) and one 480×64 horizontal backdrop tile. Scenery padding is 4 pixels. The fifteen retired gear definitions and their recipes remain unchanged for historical review; new active jobs do not include gear.

Backdrops provide continuous, quiet ground or architectural hints beneath separate scattered props. Four literal tiles span a 1920-pixel stream. Their visible height is at most 40 pixels, the top four rows remain transparent, and the bottom row must carry a continuous base with alpha at least 128 across the whole width. Tiles have no horizontal or bottom padding. Background candidates use the same immutable generation, revision and selection workflow as props; rejecting one tile does not regenerate foreground assets. All six themes have briefs; the initial backdrop pilot contains only block-world and kitchen.

All jobs, original images, candidate exports, exact executed prompts, references, validation reports, selection history and galleries stay in ignored `reports/stream-avatars-artwork/`. No initial candidate is approved. Recipes contain no machine paths or secrets. Working records may contain local image paths.

## Prepare and generate

```sh
npm run sa:art -- prepare --theme kitchen
npm run sa:art -- prepare --asset block-world.scenery.torch-post
```

Save the returned `jobId` and use its exact prompt/reference inputs in the image tool. Each object is one generation call. Jobs are immutable; repeated prepare skips pending, successful, and uncertain jobs. Confirmed failures allow another job. A failed PNG check requires targeted revision; prepare does not silently regenerate existing output. Never interpret a timeout as confirmed failure.

Record a timeout or confirmed failure without inventing an image:

```sh
npm run sa:art -- record --job JOB_ID --status uncertain --note 'Tool outcome unknown; recover before retry'
npm run sa:art -- record --job JOB_ID --status failed --note 'Confirmed tool failure'
```

Recover an uncertain attempt by recording its existing output into the same job. Both the uncertain and recovered records are retained. Each job accepts only one successful output.

## Ingest the actual generated output

```sh
npm run sa:art -- record --job JOB_ID --file /path/to/generated.png --fit --metadata-file /path/to/executed.json
```

`executed.json` records what the worker actually ran:

```json
{
  "assetId": "kitchen.scenery.prep-counter",
  "styleRevision": "pixel-v1",
  "executedPrompt": "The exact prompt passed to built-in image_gen",
  "actualReferences": [
    {
      "file": "/path/to/reference.png",
      "sha256": "64 lowercase hexadecimal characters",
      "role": "style"
    }
  ],
  "toolMetadata": {}
}
```

Use `actualReferences: []` when there were no references. Metadata with an executed prompt must identify the same asset/style revision as its job. Reference bytes are copied and checksum-checked so later deletion of the external file does not destroy provenance. Record only tool metadata actually returned, never an invented seed/model. `plannedPrompt` retains the job brief; `exactPrompt` retains the executed prompt. If metadata is omitted, the caller attests that the job's exact prompt and references were used unchanged.

Without `--fit`, bytes are copied as an exact-canvas export; validation still requires a valid logical-canvas PNG. With `--fit`, the CLI crops visible bounds, preserves aspect ratio, uses deterministic nearest-neighbor sampling, and aligns the result at the padded baseline. Original bytes always remain intact. Crop, scale, target dimensions, position and decoder version are recorded.

Backdrop fitting scales uniformly to the full 480-pixel width and aligns to the bottom of its 64-pixel canvas. Sources that would exceed the visible-height limit are rejected rather than compressed. Validation reports differing left/right edge rows and their maximum premultiplied RGBA difference as `tileSeam`; any difference warns for visual inspection. These measurements do not certify seamless art or alter pixels. Review the joins in the literal repeat preview before approval.

The default crop includes every pixel with alpha greater than zero. Low-alpha edge haze or specks can cause clipping checks or reduce visible scale. For an explicitly reviewed geometric crop, use `--alpha-threshold 128` with `--fit`. That threshold chooses the crop bounds; it does **not** rewrite alpha within the crop. The export records its threshold and discarded nonzero pixel count, and validation warns that a crop excluded source pixels. Review the full raw source before approving. This is not matte removal or artistic cleanup; true art repairs use image generation.

For later sizing changes, reuse an existing valid candidate without another generation call:

```sh
npm run sa:art -- record --from-attempt ATTEMPT_ID --fit --alpha-threshold 128
```

This creates a new immutable job/attempt with `operation: reexport`, the parent ID and original `sourceGenerationAttemptId`. It checks the parent's freshness/checksums, copies its original source and actual reference files, retains its exact executed prompt, and leaves existing selection unchanged. It records that no new image-generation call occurred. Do not combine `--from-attempt` with `--job`, `--file`, or failure status.

All twelve former active hats and the three previously retired backpack/goggles definitions remain unchanged under `inventory.retiredAssets`. Their recipes, original bytes, prompt provenance, historical hashes, candidates, imports and fitting evidence remain available. Retirement is separate review metadata: prepare/select/revise/reexport reject retired IDs, active composition excludes them, and known retired selections remain immutable history ignored by the 30-design release check. Unknown selection IDs still fail. Review details label retired versions and retain source comparison and feedback. Existing 42-design packs and ZIPs are preserved; the scenery-only pack is published to a fresh destination rather than migrating or overwriting history.

## Validate and review

```sh
npm run sa:art -- validate --attempt ATTEMPT_ID
npm run sa:art -- review --theme kitchen
npm run sa:art -- review
```

Validation decodes PNG pixels, checks checksums of originals/exports/references, recipe/style freshness, static frames, dimensions, visible height and transparent border padding. Animated PNGs, opaque rectangular backgrounds, missing sources and path/symlink escapes fail. Partial alpha and haze are surfaced for manual review, never silently repaired. PNG validity does not establish good pixel art, visual approval, or native import compatibility.

Open the generated HTML locally. A compact overview groups the latest candidate for each asset by theme and links to its full version history below. Asset/candidate counts, dates and generation/reexport labels identify the versions being compared. It embeds original sources, crisp 1×/4× exports on dark/light/busy backdrops, prompts/checksums/export metadata, selected-version comparison and feedback fields. Its stream-scale mockup uses a 1920×1080 scene with dark/light or supplied overlay backdrops, a configurable theme filter and representative silhouettes/name labels; these are size guides, not imported avatars. Root may supply original reference JPGs under `reference-layouts/ambient.jpg`, `framed-game.jpg`, and `full-game.jpg`; they are embedded locally. Band height defaults to 120 pixels and baseline offset to 4 pixels. The mockup controls clamp height to 64–360 pixels and baseline offset to 0–240 pixels (also at least 16 pixels below the band top). They only change the HTML preview, never recipes, exports, runtime configuration or native rendering evidence. No remote script or image service is required. At browser zoom 100%, a 1× pixel corresponds to a CSS pixel.

Enter specific feedback and click **Export feedback**. The downloaded JSON lists `assetId`, exact `attemptId`, and `feedback` for each edited candidate. Feedback is retained per exact attempt in browser local storage when available; denied storage does not prevent editing or JSON export. The gallery does not approve assets or write repository files.

The stream mockup uses the latest structurally valid candidate for each asset. Backdrop tiles sit beneath foreground props, which sit beneath avatar guides. Props are distributed across the full width with small deterministic offsets per theme/asset; redrawing or switching away and back preserves their positions. The preview does not impose exclusions for donation meters, QR codes or other changing stream layouts. Wider backdrop cards show scrollable 1×/4× exports. This composition is a review tool; it does not implement native backdrop rendering or runtime placement.

## Revise, select, and roll back

```sh
npm run sa:art -- revise --asset kitchen.scenery.prep-counter --feedback-file /path/to/artwork-feedback.json
```

If feedback contains several candidates for one asset, add `--attempt ATTEMPT_ID` to choose its exact entry; ambiguous feedback is rejected. Revision checks parent source/reference integrity, while allowing export/canvas defects to be revised. Revision creates a new immutable job with the parent attempt, edit-target checksum and exact feedback in its prompt. Generate/record/validate/review that job normally. Existing selection is preserved until explicit selection. To approve after the user's art review:

```sh
npm run sa:art -- select --asset kitchen.scenery.prep-counter --attempt ATTEMPT_ID --approve
```

Selection rejects cross-asset or stale candidates and failed validation. Immutable selection events retain rollback history; selecting an earlier still-valid approved candidate uses the same command. Only the coordinator should select assets after review. `--approve` records visual approval, not native import proof.

Once native image import/rendering is actually proven, add `--proof-file /path/to/import-proof.json` to selection. Proof must include `importedAndProven: true`, matching `attemptId` and `sha256`, a tested nonempty `importName`, and concrete nonempty `notes` describing backdrop/prop import, image scale, layer order and tile joins. Do not fabricate this evidence from an HTML preview.

```sh
npm run sa:art -- release --check
```

The release check fails until all 30 required scenery designs have fresh, checksum-bound visual selections and native import proof. It rechecks that every proof is bound to the selected attempt and checksum. It does not package speculative runtime assets or update game logic. This workflow currently has zero approved/proven assets; a failing release check is expected until real art review/import work is complete.

The `--workspace /absolute/path` option supports a separate local review workspace. Files created beneath it are fenced against traversal and symlink components; use canonical filesystem paths on macOS. External generated input/reference files are read and copied deliberately; generated working output paths cannot escape the workspace.

## Explicit candidate review pack

The review path consumes a deliberate map of all 30 active scenery asset IDs to exact `attemptId` values. It never auto-picks the latest version or creates selections. Optional supplied export/source/recipe checksums must match the retained record. Retired assets cannot enter this pack. A new destination is required; existing directories and symlink components are rejected.

```sh
npm run sa:art -- candidate-pack --workspace reports/stream-avatars-artwork \
  --manifest-file reports/stream-avatars-artwork/reviewed-scenery-candidate-manifest.json \
  --destination reports/stream-avatars-artwork/scenery-preview-pack
npm run sa:package -- --candidate-pack reports/stream-avatars-artwork/scenery-preview-pack \
  --output reports/stream-avatars-artwork/scenery-preview.zip
npm run sa:integration -- --scenario themes --theme all --candidate-pack reports/stream-avatars-artwork/scenery-preview-pack
```

The portable pack contains exact PNG exports, a sanitized manifest, catalog and checksum provenance. `previewOnly` and `rehearsalOnly` are true. Its derived 64-hex `packRevision` binds asset IDs, hashes and geometry, and is shared by Node snapshots and packaged Lua. The ZIP has 52 script PNGs: all 22 campaign images plus 30 scenery designs. It contains no gear entries, avatar definitions or permission/pivot updates. Candidate sources, machine paths, private settings and arbitrary notes are excluded. Changing approval booleans cannot authorize production.

## Production promotion after review and native acceptance

After the user approves each exact attempt, select it with checksum-bound native import proof and run `sa:art release --check`. Promotion requires tested canonical image import names: `sa_` plus the asset ID with dots/hyphens replaced by underscores. Every proof must bind the current selected attempt and image checksum; no avatar fitting proof is required for scenery-only themes.

```sh
npm run sa:art -- promote --workspace reports/stream-avatars-artwork \
  --destination /local/new-approved-pack
npm run sa:package -- --theme-pack /local/new-approved-pack --output /local/approved-pack.zip
```

Per-selection native import evidence covers backdrop/prop import, actual scale, layer order and joins. A proof JSON is an operator evidence record; synthetic tests do not establish native acceptance.

Promotion rechecks source/export/reference bytes, recipes, selections and proofs, stages and validates the complete pack, then atomically publishes a fresh directory. Missing or stale proof and changed inputs leave no partial destination. An adjacent exclusive publication lock serializes cooperating publishers; the final existence check and POSIX rename are not an atomic no-replace guarantee against another local process creating an empty destination in that interval. Keep destination ownership exclusive. An existing nonempty pack is protected by directory rename semantics. A terminated process can leave a stage/lock: inspect it and confirm no publisher is active before removing it and retrying. Consumers independently revalidate hashes and proof bindings. Configure `STREAM_AVATARS_THEME_PACK=/local/new-approved-pack` for the normal bot; local `sa:integration -- --scenario themes --theme all --theme-pack /local/new-approved-pack` and `sa:package -- --theme-pack ...` use the same catalog revision. With no configured approved pack, packaging retains all 22 campaign images and excludes unapproved theme assets. Keep private tokens out of the pack; the ZIP contains only placeholder connection settings.

Final release work remains: user review and exact selections; genuine native graphical image import/geometry evidence; successful strict promotion; complete lint/tests and deterministic production packaging; commit the approved exports/provenance; then the user's final readiness gate before pushing and opening the MR. Review PNGs/ZIPs and raw history remain ignored until approval.
