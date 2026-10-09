# Stream Avatars artwork workflow

This developer workflow prepares 42 independent designs, preserves generated originals, exports review sprites, and collects targeted feedback. Generation is performed by a Codex agent through built-in `image_gen`, with `transparent_background: true`; the CLI never calls an image API. Artwork is separate from the game/theme runtime and native Stream Avatars gear fitting.

Use Node **24.15.0 or newer within 24.x**, then `npm ci`. `pngjs@7.0.0` is the shared pinned production dependency for artwork decoding and native package generation, following its [primary decoder documentation](https://github.com/pngjs/pngjs): real PNG decoding, RGBA pixels, and CRC checking. The artwork port retains the foundation `sa:package` and `sa:rehearse` commands, with no runtime behavior changes.

The portable specification lives in `integrations/stream-avatars/artwork/`: `style.json`, the 42-active-entry `inventory.json`, and one exact prompt in `recipes/` for each asset. IDs have the form `<theme>.scenery.<subject>`, `<theme>.gear.<subject>` or `<theme>.backdrop.minimal-strip`. Each theme has four props (96×64, 64×64, 32×64, 32×32), two 32×32 gear canvases and one 480×64 horizontal backdrop tile. Scenery padding is 4 pixels; gear padding is 2. Gear has substantial empty space: visible height at most 16 pixels, or 24 for the chef hat. All active gear designs are head-mounted hats or helmets; native compatibility and fitting remain unproven.

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

Three original gear definitions remain unchanged under `inventory.retiredAssets`: `outdoor.gear.backpack`, `puzzle.gear.technician-goggles`, and `space-salvage.gear.work-goggles`. Their recipes, historical hashes and candidates remain reviewable and valid. Their new replacements are `outdoor.gear.trail-cap`, `puzzle.gear.technician-cap` and `space-salvage.gear.utility-hardhat`. Retirement is separate review metadata: prepare/select reject retired IDs, active composition excludes them, and old selections cannot satisfy the 42-design release gate. Review details label retired versions and retain source comparison and feedback.

## Validate and review

```sh
npm run sa:art -- validate --attempt ATTEMPT_ID
npm run sa:art -- review --theme kitchen
npm run sa:art -- review
```

Validation decodes PNG pixels, checks checksums of originals/exports/references, recipe/style freshness, static frames, dimensions, visible height and transparent border padding. Animated PNGs, opaque rectangular backgrounds, missing sources and path/symlink escapes fail. Partial alpha and haze are surfaced for manual review, never silently repaired. PNG validity does not establish good pixel art, visual approval, or native import compatibility.

Open the generated HTML locally. A compact overview groups the latest candidate for each asset by theme and links to its full version history below. Asset/candidate counts, dates and generation/reexport labels identify the versions being compared. It embeds original sources, crisp 1×/4× exports on dark/light/busy backdrops, prompts/checksums/export metadata, selected-version comparison and feedback fields. Its stream-scale mockup uses a 1920×1080 scene with dark/light or supplied overlay backdrops, a configurable theme filter and representative silhouettes/name labels; these are size guides, not imported avatars. Root may supply original reference JPGs under `reference-layouts/ambient.jpg`, `framed-game.jpg`, and `full-game.jpg`; they are embedded locally. Band height defaults to 120 pixels and baseline offset to 4 pixels. The mockup controls clamp height to 64–360 pixels and baseline offset to 0–240 pixels (also at least 16 pixels below the band top). They only change the HTML preview, never recipes, exports, runtime configuration or native fit evidence. No remote script or image service is required. At browser zoom 100%, a 1× pixel corresponds to a CSS pixel.

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

Once native import/fitting is actually proven, add `--proof-file /path/to/import-proof.json` to selection. Proof must include `importedAndProven: true`, matching `attemptId` and `sha256`, a tested nonempty `importName`, and concrete nonempty `notes` (for gear: enabled packs/slot, both directions, idle/run/jump/sit, saved appearance restoration). Do not fabricate this evidence from an HTML preview.

```sh
npm run sa:art -- release --check
```

The release check fails until all 42 required designs have fresh, checksum-bound visual selections and native import proof. It rechecks that every proof is bound to the selected attempt and checksum. It does not package speculative runtime assets or update game logic. This workflow currently has zero approved/proven assets; a failing release check is expected until real art review/import work is complete.

The `--workspace /absolute/path` option supports a separate local review workspace. Files created beneath it are fenced against traversal and symlink components; use canonical filesystem paths on macOS. External generated input/reference files are read and copied deliberately; generated working output paths cannot escape the workspace.
