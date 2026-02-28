# Windy Cycling Effort Plugin

Windy.com plugin that evaluates cycling route difficulty for uploaded GPX/KML/GeoJSON tracks by combining:

- Route length
- Elevation profile (ascent/descent)
- Wind speed, gust speed, and wind direction relative to route direction

It visualizes per-segment difficulty directly on map (green = easier, red = harder) and shows one total effort score in the plugin panel.

## Requirements

- Node.js 18+

## Install

```bash
npm install
```

## Run in dev mode

```bash
npm run start
```

The local dev server serves `dist/` on `https://localhost:9999`.

Now you can navigate to [windy.com/developer-mode](https://www.windy.com/developer-mode) to launch Windy.com in developer mode.

## Build

```bash
npm run build
```

## Usage in Windy

1. Open the plugin in Windy as an external plugin.
2. Upload a GPX/KML/GeoJSON route using Windy's native upload feature.
3. The plugin auto-detects the route, computes difficulty, and colors the route segments.
4. Change forecast model/time in Windy UI and the score is recalculated automatically.
