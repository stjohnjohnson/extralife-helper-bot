# Stream Avatars foundation verification

## Automated evidence

The shipped companion is exercised through a Lua stub harness with coroutine/mailbox behavior, authentication, moving positions, density caps, expiry, duplicates, generation changes, synthetic crowd ownership, missing-image handling, reconnects and cleanup. Node integration tests use real localhost WebSocket connections and temporary persistent production/rehearsal stores. They cover authentication failures, current-state reconnects, real-time transient expiry metadata, virtual-clock isolation, real-live preemption, stale observations and shutdown.

Local verification: `npm run lint` passes; complete `npm test -- --runInBand` passes **45 suites / 667 tests** with unchanged coverage thresholds (94.38% statements, 88.43% branches); `npm run audit:prod` reports **zero vulnerabilities**. CI installs Lua 5.4 and builds the Docker image. Local checks use Node 24.19.0 and run all 49 Lua checks under Lua 5.2.4 and 5.5.0. CI adds native Windows and Linux runs under checksum-verified upstream Lua 5.2.4 and 5.4.9; those runtimes are portability checks, not a claim about Stream Avatars' embedded engine version.

The fresh whole-branch review identified three defects, now covered by failing-then-passing regressions: corrupt-state recovery must remain required across repeated restarts (including a crash before quarantine), coalesced valid client frames must be processed in order, and pending/active rehearsal Hue effects must cancel on preemption, stop, reset or Hue-off while preserving production Hue.

GitHub CI runs the complete Linux suite and Docker image build, plus the native Windows/Linux Lua matrix, for each PR revision. Required checks are rerun before handoff.

The shared-listener refactor adds real concurrent HTTP/SSE/WebSocket tests on a single ephemeral port. They cover independent integration shutdown and re-registration, bad authentication and upgrade routes, duplicate route registration, incomplete HTTP sockets, aborted/bind-failed startup, and late application shutdown. Service-level tests cover failed Discord voice readiness and preservation of another route when Stream Avatars stops. Deliberately removing listener forwarding makes both composition regressions fail; restoring it passes. A fresh focused review found no functional defects and corrected one stale Docker comment.

## Lua confidence and Windows portability

The harness executes the **shipped** companion in a sandbox with no `os`, `io`, `package`, shell, or dynamic code access. Its API doubles check the documented method names and required arguments, and exported callbacks exchange copied state through `get`/`set`. A pinned MIT-licensed test-only JSON codec exercises real JSON strings; an additional test feeds actual validated Node protocol JSON, including UTF-8 and null fields, into Lua. The application still supplies its own codec in production.

The 49 Lua tests include 34 behavior scenarios, Node-to-Lua JSON and CRLF/path-with-spaces checks, and **13 deliberate broken-script mutations** that the suite must reject. Scenarios cover moving/late/disappearing avatars, empty/100-user crowds, rotating density, negative-coordinate bounds, duplicates/expiry, unchanged and changed sessions, stale generations, disconnect/open races, errors, async open/backoff, ordered/bounded mailboxes, malformed inputs, clock changes, owned-user cleanup/reload, missing images and bad configuration. Missing Lua fails rather than skipping tests.

The strengthened tests caught and fixed stale clear/snapshot handling, a close/open cleanup race, fractional render counts and nonnumeric/infinite image geometry. Mutation checking also exposed an expired-message fixture that previously failed an unrelated timestamp guard; it now independently verifies expiry.

Windows does not require a separate companion: production uses standard Lua and host APIs, without OS paths, shell commands or native modules. Native Windows CI verifies the same contract tests; CRLF and paths containing spaces are checked explicitly. Windows firewall/LAN reachability and the Stream Avatars-specific image import remain operator setup concerns.

These checks establish executable logic, API-call expectations and language/OS portability. They cannot establish pixel appearance, performance inside the application, exact embedded-codec semantics, or the actual application's reload behavior. See primary references for [WebSockets](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/events/websockets), [active users](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips/global-functions/getusers), and [coroutine/JSON semantics](https://docs.streamavatars.com/lua-scripting-api/api-reference-and-tips).

## Outstanding real-environment verification

**Pending:** Linux-to-gaming-computer LAN preview in real Stream Avatars and OBS. No real overlay dimensions, image-import measurements or OBS screenshots have been verified by this implementation session. The private companion's 32×32 world dimensions and 40-unit avatar offset are starting values requiring measurement. Do not treat test stubs or the generated spritesheet as real visual evidence.

**Local Docker build unavailable:** the Docker daemon is not running on this computer. CI is responsible for checking the container build; actual persistent-volume operation should also be included in the Linux acceptance run.

Follow the [acceptance run](stream-avatars-setup.md#real-lan-and-obs-acceptance-run), record the measured values, and attach real preview evidence to the PR before accepting issue #65. The full theme library remains outside this issue.

## Local Mac startup verification (2026-10-08)

A real Stream Avatars startup failed because the installed MoonSharp serializer emits escaped slashes (`\/`) while its lexer rejects them. The host's `get()` helper internally serializes and parses tables, so reading the settings table failed even though the settings JSON was valid. The companion now wraps its script-local `json.parse` to normalize only slash escapes with odd backslash counts; literal backslashes remain unchanged. No private settings or host application binaries are changed.

A temporary .NET probe using the installed `Assembly-CSharp-firstpass.dll` reproduced the original URL round-trip exception and passed after executing the shipped compatibility code. The portable regression reproduces the host's table round trip, authentication and queued messages, checks literal backslash/slash preservation, and rejects mutations that omit normalization or normalize even backslash runs. A near-limit JSON string with 30,000 literal backslashes checks that runs without a following slash are consumed without quadratic retries.

After installing the companion and pressing F5, the real Mac application opened an authenticated loopback connection to the rehearsal server at port 3000 and accepted `crowd 3` and `hearts` commands. The application console reported game bounds **(-480, 0) to (480, 460.5)**. The connection later closed during local testing and re-established after F5; continuous connection stability is still being investigated. This verifies local startup and initial transport; it does not yet verify the imported image, crowd appearance, rendering geometry, Linux LAN connection, or OBS acceptance. The previous startup stack trace remains in the console history until cleared.
