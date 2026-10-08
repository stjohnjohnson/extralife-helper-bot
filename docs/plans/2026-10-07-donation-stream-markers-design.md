# Donation stream markers design

Approved on 2026-10-07. Twitch automatically records category changes as VOD chapters; this feature creates stream markers only for large Extra Life donations.

## Behavior

- `STREAM_MARKER_DONATION_THRESHOLD` is a positive USD amount with up to two decimal places. Unset or blank disables the feature. Invalid values reject configuration. Compare in integer cents, inclusively.
- Create one marker for every newly announced donation at or above the threshold, including multiple qualifying donations in a polling batch. There is no application-imposed per-stream cap or cooldown.
- Description: `Donation: $100.00 from Full Display Name`. Preserve the amount and full donor display name unless the description exceeds Twitch's 140-character limit. Shorten only the name with an ellipsis, without splitting Unicode characters. Missing/blank names use `Anonymous`. Donation messages are not included.
- Request markers alongside donation announcements, using the existing 30-second polling interval. Twitch records the current stream position, not the original donation time.
- Skip the first successful donation baseline (including after startup fetch failures) and repeated IDs. Do not replay skipped or failed markers on a later stream or after restart.
- Marker errors must not block announcements, Hue celebrations, summary refreshes, or subsequent donations. Offline or missing VOD storage is a logged skip. Other errors, including rate limiting, are logged failures. Do not retry ambiguous writes, since Twitch provides no idempotency key and a retry can create duplicates or an inaccurate later marker.
- Bound each marker operation to 10 seconds. Stop cancels pending marker requests and prevents writes after shutdown, including late authentication results. Reuse existing Twitch broadcaster authentication and scope; do not log credentials.

## Architecture

A dedicated `src/streamMarkers.js` service owns threshold matching, description formatting, broadcaster lookup caching, marker requests, timeouts, and shutdown. It reuses the existing Twitch request and token helpers in `src/gameUpdates.js`, extending the request helper with optional cancellation and structured HTTP status codes without changing existing callers. Application startup creates one service; only newly announced donations reach it; application stop cancels it.

The alternative is a durable retry queue. It is rejected because persisted donations would produce markers at the wrong time. Authentication and broadcaster lookup can be shared across concurrent donations, but individual marker writes remain independent.

## Verification

Configuration tests cover opt-in, invalid amounts, and decimal precision. Service tests cover inclusive boundaries, full/anonymous/long Unicode names, exact Helix request bodies, offline/VOD errors, auth/network/429 failures, malformed responses, timeouts, cancellation, and at least 100 qualifying donations. App tests cover silent startup, deduplication, batches, nonblocking celebrations, and shutdown. Complete lint and tests must pass before commits and PR creation; required CI must pass before handoff.

## References

- [Twitch VOD chapters](https://help.twitch.tv/s/article/video-on-demand)
- [Create Stream Marker](https://dev.twitch.tv/docs/api/reference#create-stream-marker)
- [Twitch rate limits](https://dev.twitch.tv/docs/api/guide/#twitch-rate-limits)

Twitch publishes no per-stream marker count cap in these docs. The Get Stream Markers limit of 100 is a pagination limit, not a creation quota. Live streaming with VOD storage enabled is required.
