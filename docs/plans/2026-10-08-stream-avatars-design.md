# Stream Avatars integration design

## Purpose and scope

Give spectators an ambient world and shared celebrations during the 25-hour Extra Life marathon, without requiring the streamer or game participants to operate it. The current audience chats in Twitch but has not adopted Stream Avatars commands or minigames. Automatic, inclusive effects are the first release; no competitive minigames or boss fights are included.

Stream Avatars runs on the gaming/streaming computer. The helper bot runs on a Linux server on the same LAN. Preserve the transparent avatar strip at the bottom of the stream. Its dimensions and safe area must be configurable and verified on the actual streaming setup before final asset production.

## Agreed viewer experience

### Game transitions

Follow the game shown on stream using the existing game-change detection. A Minecraft Realm running separately throughout the event must not hold the overlay in the Minecraft theme.

A transition changes sparse transparent scenery, introduces the game with a short caption and crowd entrance animation, and assigns themed gear. Gear remains for the current game and is applied to late arrivals. Preserve viewers' saved selections and restore them when a temporary theme ends. The same shared theme can cover multiple games. A change between games within one theme updates the caption and entrance without unnecessarily resetting scenery or gear. Unknown games have a neutral fallback.

| Theme | Proposed game mapping | Asset direction |
| --- | --- | --- |
| Block world | Minecraft Bedrock | Blocky plants, torches, mining hats |
| Kitchen | PlateUp! | Counters, utensils, chef hats |
| Outdoor expedition | Big Walk; PEAK; Valheim; Raft; Enshrouded; Core Keeper; How to Fish; RV There Yet? | Rocks, trail signs, lanterns, backpacks |
| Puzzle workshop | Escape Simulator 2; We Were Here; Keep Talking and Nobody Explodes | Keys, locks, dials, detective or technician gear |
| Space and salvage crew | Helldivers 2; Deep Rock Galactic; Void Crew; Jump Space; Arc Raiders; R.E.P.O.; Call of Duty | Crates, machinery, warning lights, helmets |
| Party playground | Party Animals; Ultimate Chicken Horse; MECCHA CHAMELEON; Heave Ho 2; Tricky Towers; Make Way; Goat Simulator 3; Moving Out 2; Gamble With Your Friends; Jackbox Party Packs; Golf with Friends; Wobbly Life | Flags, toys, small obstacles, silly hats |

Minecraft and the kitchen receive the most distinctive treatment. All asset directions are concepts, not existing assets or completed artwork. Game names and aliases must match actual Discord/Twitch reporting during implementation.

### Donations and fundraising milestones

Each new eligible donation gets a short crowd celebration synchronized with the existing Hue donation celebration. Hearts appear above avatars and the crowd jumps. No donor-to-Twitch identity matching is required.

Track confirmed money raised during this broadcast separately from the full campaign total. Pre-stream fundraising and later matching must not advance live milestones. Proposed initial milestone interval: $500, configurable. Every crossed interval produces a larger shared crowd party with gold confetti and the amount raised during this stream. If one donation or polling batch crosses several thresholds, celebrate the highest new threshold once while marking all crossed thresholds handled.

Reaching the participant goal reported by ExtraLife has a separate, once-per-session celebration. This is a bonus: the experience must not depend on reaching that goal. Do not celebrate an already-reached campaign goal merely because the bot started. Preserve the existing campaign goal command and fundraising notifications.

### Marathon time checkpoints

Start automatically when Twitch reports the streamer live. Every elapsed hour produces a brief clock caption and a ripple of jumps. Every five hours produces a larger chapter celebration and sparse decorative additions to the current game theme. At hours 5, 10, 15, 20, and 25, the larger event replaces the ordinary hourly event. Hour 25 has explicit finale treatment.

Game scenery stays the main setting. Chapter decorations add to it rather than replace it. A game switch preserves the current chapter. Occasional prompts can introduce one simple native action, such as `!dance`, without requiring participation to make the celebration work. Existing Stream Avatars spawning rules still determine which viewers have active avatars; the integration must not promise individual watch-time tracking.

### Visual signatures

| Event | Signature | Crowd behavior | Proposed duration |
| --- | --- | --- | --- |
| Game change | New scenery and Now playing caption | Apply game gear; welcoming jump | 5-8 seconds; theme persists |
| Donation | Hearts and Thank you caption | Quick group jump with existing Hue celebration | 4-6 seconds |
| Live fundraising milestone | Gold confetti and live amount banner | Crowd dance | 15-20 seconds |
| Hourly checkpoint | Clock marker and Hour N caption | Ripple of jumps | 3-5 seconds |
| Five-hour chapter | Chapter sign and lantern/star/sunrise accents | Crowd dance | 10-15 seconds; chapter decorations persist |
| Campaign goal / 25-hour finale | Expanded gold celebration | Shared celebration with distinct goal/finale captions | Tune in preview |

Icons, motion, and captions distinguish events; color reinforces them. Celebration graphics do not replace game gear. Reuse a small set of heart, confetti, clock, sign, and chapter assets across the six themes.

## Integration architecture

An optional bot-hosted WebSocket endpoint accepts an outbound connection from an on-connect Lua companion in Stream Avatars. Use a shared authentication token configured outside committed assets. The endpoint provides a bounded vocabulary of events and state; it must not accept arbitrary executable commands from the network. Keep ordinary bot services independent of the avatar connection.

The bot owns authoritative game identity, broadcast session identity, donation eligibility/totals, milestone history, elapsed time, and checkpoint history. Lua owns rendering, current avatar positions, themed temporary gear, late-avatar appearance, and transient effect cleanup.

On connection or reconnection, send a current-state snapshot with the game theme, chapter, elapsed time, and live fundraising total. Do not replay expired animation events. Event IDs, bounded queues, and expiry prevent duplicate effects and a celebration backlog. Combine overlapping effects and captions coherently; give donations timely recognition, let five-hour checkpoints supersede hourly checkpoints, and combine donation/milestone events from the same batch where appropriate. Missing avatar assets degrade to an available neutral visual and are logged.

Hearts and confetti require custom transparent sprite animations. Documented Lua primitives allow creating image objects, reading avatar positions, and positioning objects. Following moving avatars, keeping animations in bounds, clipping/capping effect density, and reliably removing objects need a real Stream Avatars proof. Do not treat documentation alone as visual verification.

## Broadcast continuity and persistence

A short Twitch network blip must remain part of the same long stream, even if Twitch changes its stream ID or reported start timestamp. Preserve the original session start, live donation total, processed donation IDs, reached fundraising milestones, reached time checkpoints, and current chapter across reconnects and bot restarts.

Use a configurable grace period after confirmed offline observations before ending a session; proposed initial default is 15 minutes, to be tuned during implementation. Collection errors or missing samples are unknown states, not evidence of offline status. Elapsed wall-clock time continues across brief interruptions. In production, render checkpoint celebrations only when the streamer is confirmed online. Offline rehearsal supplies simulated live status. Summarize current state instead of replaying a backlog after recovery.

Store session state atomically in a configurable persistent location on Linux, with deployment guidance for persistent Docker volumes where applicable. Use donation timestamps and the retained broadcast window to classify donations and deduplicate late or out-of-order poll results. Initial historical donations must not trigger effects. If the bot starts midway through a broadcast, use Twitch's original start time and reconcile available in-window donations into the total without replaying old celebrations. API failures must not create duplicate money or reset progress. Any unresolved timestamp semantics are investigated before claiming correct live totals.

Provide an admin recovery/reset path. A sustained confirmed offline period ends the session; a later broadcast begins a new session. Keep session history and checkpoints sufficient to prevent duplicate celebrations. Ending, reconnecting, and reset behavior must be exercised explicitly in tests and preview.

## Offline rehearsal

All four slices must be testable without starting an OBS broadcast or requiring Twitch to report the channel live. Rehearsal uses the real Linux-to-gaming-computer LAN connection and the same event, scheduling, and rendering paths, with simulated inputs and separate test state.

- Open OBS preview or record locally; broadcasting is not required.
- Use Stream Avatars' custom Lua service to create a simulated crowd, with configurable crowd size and late join/leave scenarios. No actual viewers or Twitch extension are required. Document setup and restoration of the normal streaming configuration.
- Provide preview controls for selecting games/themes, injecting fake donations, setting a simulated campaign goal, crossing live fundraising milestones, and advancing or seeking a virtual marathon clock.
- Provide lifecycle scenarios for brief disconnect/reconnect, changed Twitch stream identifiers, API errors, bot restart, and a sustained disconnect beyond the grace period.
- Preview works while the real Twitch channel is offline and without real Twitch, Discord, or ExtraLife credentials. The shared LAN connection still requires its configured token.
- Store preview session state separately. Fake donations and reached checkpoints cannot alter production fundraising totals, donation deduplication, sessions, or milestone history. Resetting or exiting rehearsal does not modify live state.
- Suppress Twitch/Discord messages and stream-marker writes. Hue output is disabled by default and can be explicitly enabled for physical-light rehearsals.
- The foundation slice supplies offline crowd/session/heart previews and extensible scenario controls. Each feature slice wires its own visual scenarios into that shared mode when implemented.

Verification must include a complete offline run: Minecraft theme, a $25 fake donation, a $500 milestone crossing, hour 7, hour 5, hour 25, and a brief reconnect preserving progress. Preview is a future implementation requirement, not a currently available command.

## Published GitHub issues

1. [#65 — LAN bridge and resumable sessions](https://github.com/stjohnjohnson/extralife-helper-bot/issues/65): LAN bridge, resumable broadcast session, and moving-heart visual proof. Demo: authenticated Linux-to-Stream-Avatars connection, automatically tracked session, and a preview effect over moving avatars. No blockers.
2. [#66 — Game themes and outfits](https://github.com/stjohnjohnson/extralife-helper-bot/issues/66): Six transparent game themes and persistent themed gear. Demo: real game change updates scenery/outfits and late arrivals receive them. Blocked by #65.
3. [#67 — Donations and fundraising milestones](https://github.com/stjohnjohnson/extralife-helper-bot/issues/67): Live donation hearts, $500 crowd-party milestones, and campaign-goal bonus. Demo: eligible donations advance live totals and produce distinct, deduplicated effects. Blocked by #65.
4. [#68 — Hourly checkpoints and chapters](https://github.com/stjohnjohnson/extralife-helper-bot/issues/68): Hourly and five-hour marathon chapters with a 25-hour finale. Demo: session checkpoints decorate the current game world and survive reconnects. Blocked by #65 and #66; donation implementation is not a prerequisite.

The issues include observable acceptance criteria, failure/recovery cases, preview instructions, and native GitHub blocking relationships. All four carry enhancement and ready-for-agent labels; blocked tickets must wait for their prerequisites. No feature implementation is authorized by this planning task.

## Validation for future implementation

- Complete `npm run lint` and `npm test` for each implementation slice; do not weaken existing tests.
- Use deterministic clock, Twitch lifecycle, and donation fixtures for before/during/after-stream donations, reconnect grace, bot restart, changed Twitch stream IDs, duplicate polls, large donations, failed API calls, and overlapping checkpoints.
- Exercise the actual Lua companion in Stream Avatars on the gaming computer, with representative avatar counts and the actual OBS strip dimensions. Verify transparency, captions, moving-avatar alignment, temporary gear restoration, late spawns, cleanup, and reconnect snapshots.
- Include a preview mode for all visual signatures and an end-to-end Linux/LAN demonstration before accepting the foundation.
- Report prototype limitations rather than asserting untested visual behavior.

## Sources

- Approved choices from this brainstorming conversation.
- User-supplied current game survey: https://docs.google.com/forms/d/e/1FAIpQLSe5zb3nG2xY4wk7lFchByWUIPbJc8wCGvVsmBJwhJCcVdI2Bg/viewform
- User-supplied prior-year timeline: qualitative pacing context only; donation amounts are not shown.
- External communication: https://docs.streamavatars.com/lua-scripting-api/introduction
- WebSocket events: https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/events/websockets
- Custom sprite animation: https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/global-functions/applyimage
- Avatar positions: https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/classes/user/getposition
- Object positioning: https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/classes/gameobject/setposition
- Temporary gear: https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/classes/user/settemporarygear
- Offline simulated viewers and activity: https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/events/servicecontroller
