# Stream Avatars foundation verification

## Automated evidence

The shipped companion is exercised through a Lua stub harness with coroutine/mailbox behavior, authentication, moving positions, density caps, expiry, duplicates, generation changes, synthetic crowd ownership, missing-image handling, reconnects and cleanup. Node integration tests use real localhost WebSocket connections and temporary persistent production/rehearsal stores. They cover authentication failures, current-state reconnects, real-time transient expiry metadata, virtual-clock isolation, real-live preemption, stale observations and shutdown.

Local verification: `npm run lint` passes; complete `npm test -- --runInBand` passes **43 suites / 600 tests** with unchanged coverage thresholds (94.41% statements, 88.41% branches); `npm run audit:prod` reports **zero vulnerabilities**. CI installs Lua 5.4 and builds the Docker image. Local tests use Node 24.19.0 and Lua 5.5.0; the harness remains compatible with Lua 5.4.

The fresh whole-branch review identified three defects, now covered by failing-then-passing regressions: corrupt-state recovery must remain required across repeated restarts (including a crash before quarantine), coalesced valid client frames must be processed in order, and pending/active rehearsal Hue effects must cancel on preemption, stop, reset or Hue-off while preserving production Hue.

The initial implementation revision passed GitHub CI, including Linux tests with Lua 5.4 and the Docker image build. Required checks are rerun on the review-fix revision before handoff.

## Outstanding real-environment verification

**Pending:** Linux-to-gaming-computer LAN preview in real Stream Avatars and OBS. No real overlay dimensions, image-import measurements or OBS screenshots have been verified by this implementation session. The private companion's 32×32 world dimensions and 40-unit avatar offset are starting values requiring measurement. Do not treat test stubs or the generated spritesheet as real visual evidence.

**Local Docker build unavailable:** the Docker daemon is not running on this computer. CI is responsible for checking the container build; actual persistent-volume operation should also be included in the Linux acceptance run.

Follow the [acceptance run](stream-avatars-setup.md#real-lan-and-obs-acceptance-run), record the measured values, and attach real preview evidence to the PR before accepting issue #65. The full theme library remains outside this issue.
