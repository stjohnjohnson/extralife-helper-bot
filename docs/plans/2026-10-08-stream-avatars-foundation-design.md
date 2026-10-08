# Stream Avatars foundation design for issue #65

Status: planning only. The user approved Twitch-chat rehearsal controls and automatic shutdown when the real channel becomes live on 2026-10-08. No feature implementation is authorized by this planning task.

Source requirements: [issue #65](https://github.com/stjohnjohnson/extralife-helper-bot/issues/65) and the [approved integration design in PR #69](https://github.com/stjohnjohnson/extralife-helper-bot/blob/codex/stream-avatars-design/docs/plans/2026-10-08-stream-avatars-design.md). PR #69 is open at planning time; use its design as context without merging its branch into the implementation branch.

## Scope

Build the optional authenticated Linux-to-Stream-Avatars LAN bridge, resumable broadcast session, one moving-heart preview, and an extensible offline rehearsal foundation. Game themes/outfits (#66), real donation classification and milestones (#67), and hourly/chapter/finale rendering (#68) remain separate issues. Reserve their persisted state fields and scenario registration interfaces here, without implementing their celebrations.

Use Node.js 24.x, at least 24.15.0, CommonJS modules, existing Jest/ESLint conventions, and a direct locked `ws` dependency for the WebSocket server. Keep production services independent of avatar availability. Production observation comes from the existing viewer monitor, not a second poller and not log parsing.

## Rehearsal experience

Recommended and approved: admin-only `!sa` commands in the existing Twitch chat connection. A browser panel adds an unnecessary interface; a dedicated rehearsal process as the only interface requires switching processes and is less convenient. Keep an interactive local `npm run sa:rehearse` entry point for the issue's credential-free requirement. Both adapters dispatch the same typed actions.

The foundation commands are `!sa status`, `!sa rehearsal start|stop|reset`, `!sa crowd <count>`, `!sa crowd join <id>`, `!sa crowd leave <id>`, `!sa hearts`, `!sa clock advance <duration>`, `!sa clock seek <duration>`, `!sa scenario <name>`, and `!sa hue on|off`. Scenario names are a registered allowlist, not executable payloads. Register reconnect, changed-stream, api-error, sustained-offline, and restart scenarios now; dependent issues register their own controls later.

Rehearsal has its own session store, virtual clock, synthetic IDs, event namespace, and output policy. Real credentials may be used for chat control, but simulated inputs never enter the production donation poller, marker service, or Discord announcements. Short replies to explicit admin commands are permitted; simulated Twitch/Discord celebration messages are suppressed. Hue defaults off and requires explicit admin opt-in, plus valid Hue configuration. Real ordinary services continue their existing behavior.

In integrated mode, require a recent confirmed offline observation before entering rehearsal. A real successful live observation immediately clears rehearsal effects and synthetic crowd, switches rendering to the current production snapshot, and replies once with a reminder to restore Stream Avatars' normal Twitch service. Keep observing production throughout rehearsal. Standalone credential-free mode cannot observe real Twitch; it is an explicit local rehearsal process that must be exited before broadcasting. Reset/stop cannot modify production state. Bot restart restores rehearsal progress but leaves visual rehearsal inactive until explicitly resumed.

Synthetic crowd requires Stream Avatars' custom Lua service, selected manually on the gaming computer. The helper bot still receives Twitch chat independently. Document backing up configuration, switching service, spawning synthetic users, and restoring the normal service. Never inject arbitrary chat strings into Stream Avatars to perform crowd actions.

## Session continuity

Use a pure reducer for `online`, `offline`, and `unknown` observations with injected time and session ID generation. The first validated online sample starts a stable UUID session using Twitch's `started_at`, including startup midway through a broadcast. Later Twitch IDs/start timestamps are metadata and never replace the retained session start during continuity.

Default confirmed-offline grace: 900 seconds, configurable. Elapsed time uses wall-clock time and continues through short interruptions. End only on evidence of a sustained confirmed offline run, not a wall timer alone. Unknown/error observations break the offline confirmation run while retaining the session. A sampling gap exceeding twice the configured sampling cadence also breaks confirmation. Persist offline evidence across a short restart; a longer unobserved shutdown cannot prove continuous offline. After an unobserved long gap followed by live status, conservatively retain the session and expose admin recovery/reset rather than invent an end time. At an evidenced grace boundary, end the old session and let a later live sample begin a new UUID session.

Persist schema version, channel/mode, revision, stable session ID, original start, observed Twitch metadata, offline evidence, end time, processed donation IDs, integer-cent live total, reached donation/time checkpoints, chapter, and campaign-goal flag. The latter fields are contracts for subsequent issues; initialize neutrally and preserve values on reload. Loading state produces a snapshot, never historical transient effects. Recovery and virtual seeks establish a baseline so later checkpoint handlers do not replay old celebrations.

Use serialized atomic writes: temporary file in the same directory, flush, rename, and directory flush on supported Linux filesystems. Preserve the last good file on a failed write. Reject mismatched channel/mode/version and quarantine corrupt state; suspend new avatar celebrations until explicit recovery. Do not silently replace corrupt progress with an empty session. Admin reset archives the previous state; recovery restores only a validated server-side backup, never a chat-supplied path. Keep production/rehearsal files distinct even through symlinks or normalized paths. Document a single owner process and persistent writable Docker storage.

## LAN and Lua rendering

Configure enabled flag (default false), bind host, port (default 3001), shared token, persistent directory, grace, and measured strip bounds. Optional integration errors disable this service with sanitized diagnostics; they must not stop ordinary bot services. Defaults for rendering and transport limits are pinned in the implementation plan and remain tunable after real preview.

Authenticate in the first JSON WebSocket message; send no snapshot before authentication. Use a versioned finite schema for snapshots, hearts, clear, and rehearsal crowd instructions. Include session identity, rendering generation, event ID, issued time, and expiry. Never accept shell/Lua commands, dynamic script names, arbitrary asset paths, or arbitrary Stream Avatars command text. Bound payloads, queues, duplicate caches, retry timing, and slow-client buffers. Disconnected clients receive only a fresh snapshot; discard undelivered transient events.

The Lua on-connect companion loads a private local JSON settings file, opens the outbound socket, authenticates, applies snapshots, and renders a locally allowlisted heart sprite. Use Stream Avatars' documented coroutine `get`/`set` state access and a single render owner. A mode-generation change clears old effects. Every object has explicit cleanup for expiry, vanished avatars, socket loss, script reload, reset, and shutdown.

For normal crowds, display one heart above each active avatar. Update positions from the real avatar coordinates and clamp whole frames to the safe area. Dense crowds use deterministic rotating selection up to the configured simultaneous-object cap; document and demonstrate this density limit rather than promise unlimited simultaneous effects. Missing assets report an actionable diagnostic and skip the preview safely. No full theme library is produced here.

## Validation and hardware gate

Use deterministic Jest tests for session lifecycle, persistence faults, auth, payload schemas, duplicate/expired events, reconnect snapshots, command admission, virtual time, production isolation, and shutdown. Add a Lua stub harness invoked by Jest to exercise the shipped companion's protocol, movement, cap, and cleanup; its standard Lua execution does not prove Stream Avatars compatibility.

Prove the companion early on the actual gaming computer. Record Stream Avatars version, image-import frame metadata, actual source resolution, OBS scaling/crop, safe rectangle, and 1/10/50/100-avatar previews. Capture transparency, movement, edge clamping, late join/leave, density cap, cleanup, authentication rejection, reconnect, and virtual restart. Production session continuity can be tested with recorded/synthetic observations; do not start a real broadcast merely to test it. The final foundation acceptance requires a real authenticated LAN/Stream Avatars/OBS preview; unit tests and documentation alone cannot satisfy it.

## References

- [Existing viewer monitor](../../src/viewerMonitoring.js), [application lifecycle](../../app.js), [admin commands](../../src/commands.js), [configuration](../../src/config.js).
- [WebSocket callbacks](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/events/websockets).
- [Lua coroutine and JSON guidance](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips).
- [Private script settings via load](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/global-functions/load).
- [Sprite image import](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/global-functions/applyimage).
- [Avatar position](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/classes/user/getposition).
- [Synthetic users](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/events/servicecontroller).
- [ws server API](https://github.com/websockets/ws/blob/master/doc/ws.md).
