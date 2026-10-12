# Extra Life connection indicator source

The user supplied `extra-life-idle.gif` for the host's connection indicator.
The GIF contains eight 64 × 64 frames with 200 ms per frame.

`../assets/sa_bridge_healthy.png` contains those frames in one horizontal row.
Conversion preserves every original RGB value and the frame order.
Pure black pixels have alpha zero; all other pixels have alpha 255.
`extra-life-idle.json` records the source checksum and each original frame's RGB checksum.
The package tests verify those checksums, transparency, frame geometry and native looping metadata.

The source GIF and provenance are not exported to Stream Avatars.
The PNG and its manifest are checked in; packaging needs no GIF conversion tools.
`node scripts/sa-assets.js` regenerates the companion's question mark in the existing bitmap style.
