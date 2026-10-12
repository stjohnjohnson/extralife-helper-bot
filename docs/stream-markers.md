# Donation stream markers

[README](../README.md) · [Configuration](configuration.md)

The bot can create Twitch stream markers for new donations at or above a configured amount.
Markers identify points in the recording for later review.

## Enable markers

1. Complete [broadcaster API authorization](setup.md#broadcaster-api-access) with `channel:manage:broadcast`.
2. Enable **Store past broadcasts** in the broadcaster's Twitch VOD settings.
3. Set `STREAM_MARKER_DONATION_THRESHOLD` in `.env`:

   ```dotenv
   STREAM_MARKER_DONATION_THRESHOLD=100
   ```

4. Restart the bot.

This example marks donations of $100.00 or more.
The threshold accepts positive USD amounts with at most two decimal places, such as `25.50`.
An unset or blank value disables markers.
An invalid value prevents startup.
Twitch requires a live stream and available VOD storage; see the [marker API](https://dev.twitch.tv/docs/api/reference/#create-stream-marker).

## Marker descriptions

A marker uses this format:

```text
Donation: $100.00 from Full Display Name
```

Missing or blank names appear as `Anonymous`.
Long names are shortened with an ellipsis to fit Twitch's 140-character description limit.
Donation messages are not included.
Separate qualifying donations receive separate markers.
The application adds no per-stream marker cap or cooldown; Twitch API rate limits still apply.

## Timing and failures

Markers use the existing 30-second donation poll.
They identify the current stream position when Twitch processes the request.
They cannot mark the original donation time retrospectively.
The bot creates donation markers only; Twitch already tracks category changes as VOD chapters.

The first successful donation load is silent, including after earlier fetch failures.
Historical donations and repeated donation IDs create no markers.
Offline or VOD-unavailable donations are skipped.
Failures are logged without interrupting announcements or Hue celebrations.
Requests expire after ten seconds and are cancelled during shutdown.
Failed and skipped requests are not retried or replayed after restart.
