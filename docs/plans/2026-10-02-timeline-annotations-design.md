# Timeline Axes and Event Markers Design

## Goal

Make the report timeline readable as a quantitative chart and let a viewer relate audience changes to game transitions and confirmed live donations without implying causation.

## Layout

The report will use one coordinated, self-contained SVG with a shared time scale and three aligned regions:

1. A viewer plot with horizontal gridlines, a numeric viewer Y-axis, and a local-time X-axis. Each X tick also shows elapsed time from the selected event start.
2. A game lane beneath the viewer plot. Game segments are drawn as labeled bands, and each boundary after the initial segment has a vertical transition marker spanning the viewer plot.
3. A donation lane beneath the game lane. Each confirmed live donation is drawn as a gold marker at its timestamp.

This separation keeps donation markers off the viewer scale, so marker position cannot be mistaken for viewer count or donation value. All regions use the detected or manually selected event window rather than evenly spacing available samples.

## Labels and Interaction

The X-axis uses deterministic tick intervals selected from the event duration. Each tick displays local 24-hour clock time and an elapsed label such as `+6h`. The Y-axis starts at zero and uses a rounded upper bound with five intervals.

Game labels are clipped to their segment width where necessary. Native SVG `<title>` elements provide complete transition details and donation details on hover, including local time, donor name, amount, and message. A visible legend identifies the viewer line, game lane, transition markers, and donation markers.

## Data and Safety

The renderer consumes the existing 15-minute timeline bins, `sessions.gameSegments`, `metrics.donations.items`, event window, and configured timezone. It does not change the JSON contract or metric calculations.

Every dynamic SVG string is HTML-escaped, including game names, donor names, and donation messages. Rendering remains deterministic and offline with no remote assets.

## Verification

Renderer tests will prove that both axes, game segments, transition markers, donation markers, local and elapsed X labels, hostile-text escaping, and empty optional lanes behave correctly. The 2025 acceptance report will then be regenerated and visually checked before running the full lint and test suites.
