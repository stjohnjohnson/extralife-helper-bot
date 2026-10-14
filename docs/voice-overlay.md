# OBS voice overlay

[README](../README.md) · [Configuration](configuration.md)

The overlay shows eligible participants in `DISCORD_LIVE_ROOM_CHANNEL` and highlights speaking activity.
It hides `DISCORD_GAME_UPDATE_USER_ID` and the helper bot.
It does not record or decode audio.

## Configure the overlay

1. Complete the [core bot setup](setup.md).
2. Grant the Discord bot **View Channel** and **Connect** permissions in the live room.
3. Add these settings to `.env`:

   ```dotenv
   WEB_HOST=0.0.0.0
   WEB_PORT=3000
   ```

4. Start the bot.
5. Allow the OBS computer to reach the configured port on your private network.

The voice overlay and Stream Avatars start with the bot and share the HTTP listener.
For Docker, publish that port:

```sh
docker run --rm -it --env-file .env -p 3000:3000 \
  ghcr.io/stjohnjohnson/extralife-helper-bot:latest
```

The overlay has no login.
Anyone who can reach its listener can view participant identities and speaking activity.
Restrict access to trusted computers; do not expose the port directly to the internet.
For a local Node.js run on the OBS computer, set `WEB_HOST=127.0.0.1` to limit listener access.
For Docker on the OBS computer, keep `WEB_HOST=0.0.0.0` inside the container.
Publish its port with `-p 127.0.0.1:3000:3000` to limit access to that host.
Binding `WEB_HOST=127.0.0.1` inside Docker prevents the published port from reaching the listener.

## Add an OBS source

1. Add a Browser Source in OBS.
2. Set its URL to `http://<bot-lan-ip>:3000/voice`.
3. Use the dimensions below for your scene.
4. Position the source near the camera.

| Scene | Source size | Suggested position |
| --- | --- | --- |
| Compact or large camera | 460 × 64 pixels | Below the camera, or inset at its lower-left corner |
| Right-side camera | 540 × 64 pixels | Below the camera |

Use separate source instances for different dimensions.
Keep donation displays and the bottom Stream Avatars area clear.
Avoid scaling a larger browser canvas down.
Avatars remain centered, grow to at most 48 pixels, and shrink to fit larger groups.

Idle avatars use static images at 60% opacity.
Animated avatars animate while speaking and show a cyan ring.
They return to static images after a 180-millisecond release delay.

## Preview the layout

Use `http://<bot-lan-ip>:3000/voice?preview=5` for sample avatars and simulated speaking.
The `preview=1` and `preview=10` values provide other group sizes.
Remove the preview query before displaying live participants.

## Connection behavior

The helper joins self-muted only while `DISCORD_GAME_UPDATE_USER_ID` is in the live room.
It remains undeafened to detect speaking.
It leaves when the monitored user disconnects or moves to another room.
The Browser Source remains available while the user is away, but its live display is blank.

The display is also blank when no eligible participants are present or voice service is unavailable.
The bot logs connection errors.
A manual move or disconnect pauses automatic return until bot restart.
Other transient failures reconnect while the monitored user remains in the live room.
An ordinary departure permits a fresh connection when that user returns.

Voice participation sampling follows the monitored user, including other rooms in the configured guild.
The overlay always uses the fixed live room.
Sampling excludes the helper; the overlay also hides the monitored user.
Overlay member identities and speaking activity are not added to voice analytics logs.
