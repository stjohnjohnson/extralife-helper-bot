# Companion celebration sounds

These original synthesized cues are covered by the repository's MIT license:

| Native sound name | Duration | Cue |
| --- | --- | --- |
| `sa_donation` | 0.8 seconds | Gentle ascending chime |
| `sa_milestone` | 1.5 seconds | Success flourish |
| `sa_goal` | 2.5 seconds | Victory fanfare |

No recordings, samples, or third-party melodies are used. `scripts/sa-sounds.js` generates the notes, attack/decay envelopes, harmonics, fades, and PCM deterministically. Each PCM file has 44.1 kHz mono, 16-bit samples and a peak of 0.32 (about -9.9 dBFS). The checked-in Ogg Vorbis files duplicate that signal into two channels for FFmpeg's native Vorbis encoder. Packaging checks container structure, Ogg CRCs, codec headers, duration bounds, and the catalog's SHA-256 digests. The committed clips have also been decoded with FFmpeg; the packager does not need FFmpeg.

To author the files again, install FFmpeg with its native Vorbis encoder and run:

```sh
node scripts/sa-sounds.js
```

This refreshes all three Oggs and `catalog.json`. The checked-in files were encoded with FFmpeg 8.0.1. PCM is reproducible across platforms; encoded bytes may change with encoder versions. The bit-exact encoding flags give identical files when regenerated with the same encoder version. To inspect PCM without an encoder, run `node scripts/sa-sounds.js --wav-only --output /path/to/scratch`.

`npm run sa:package` includes only catalogued Ogg files in the companion ZIP and writes an adjacent `sounds/` folder. Stream Avatars' content importer extracts script files but does not register sound-library entries. Import each Ogg once in its **Sounds** screen with the name above, and leave chat/soundboard triggering disabled. Adjust volume there. See [the setup guide](../../../docs/stream-avatars-setup.md#celebration-sounds) for configuration and upgrades.
