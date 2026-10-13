# Family celebration recordings

These original recordings were supplied by the project maintainer for this companion. They replace the earlier synthesized cue auditions.

| Native sound name | Recording | Prepared duration |
| --- | --- | --- |
| `sa_donation` | Quinn donation 1 | 0.88 seconds |
| `sa_donation_2` | Zac donation 1 | 1.35 seconds |
| `sa_donation_3` | Quinn donation 2 | 1.42 seconds |
| `sa_donation_4` | Zac donation 2 | 0.87 seconds |
| `sa_milestone` | Quinn milestone | 4.36 seconds |
| `sa_milestone_2` | Zac milestone | 2.90 seconds |
| `sa_goal` | Zac goal | 4.56 seconds |

Donations cycle through the four listed options. Milestones alternate between their two options. Each recording plays once at its natural length; no music, repetition, pitch changes or time stretching were added. Internal pauses remain intact. Visual celebration timing remains unchanged.

`recordings/` holds generically named, metadata-free copies of the supplied 44.1 kHz mono, signed 16-bit PCM recordings. The supplied files are unchanged. The preparation catalog records each source digest, conservative outer trims and volume reduction. Brief boundary fades avoid clicks. Some supplied recordings reach full scale; volume reduction supplies playback headroom without claiming to recover source clipping. The final Oggs decode with peaks below -8 dBFS. Donation RMS levels are about -23 dBFS; milestone and goal levels retain their natural speech dynamics and pauses. Native sound volume remains adjustable.

To reproduce the seven Oggs, install FFmpeg with its native Vorbis encoder and run:

```sh
node scripts/sa-sounds.js
```

FFmpeg is an authoring dependency only. Normal packaging uses Node alone. The committed files were encoded with FFmpeg 8.0.1 using bit-exact flags and removed metadata. Regeneration with that encoder matches the catalog digests. Different encoder versions can change encoded bytes. `node scripts/sa-sounds.js --check` verifies source integrity and preparation bounds without FFmpeg. Use `--wav-only --output /path/to/scratch` to create prepared PCM previews with FFmpeg.

Packaging includes only the seven catalogued Oggs, not source WAVs or preparation files. It validates container structure, Ogg CRCs, codec headers, duration bounds and catalog SHA-256 digests. `npm run sa:package` writes the companion ZIP and an adjacent `sounds/` folder. Import all seven Oggs through Stream Avatars' **Sounds** screen with the exact names above. Replace existing registered files for the three original names. Companion reimport alone preserves the native sound library and old registered audio. Leave chat/soundboard triggering disabled. See [sound setup](../../../docs/stream-avatars-setup.md#celebration-sounds) for rotation settings and upgrades.
