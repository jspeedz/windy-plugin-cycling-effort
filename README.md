# Windy Cycling Effort Plugin

Windy.com plugin that evaluates cycling trip effort/difficulty for uploaded GPX/KML/GeoJSON route tracks.

Route segments are color-coded from green (easy) to red (hard) directly on the map, with a single effort score in the panel. Use it to compare forecast conditions and pinpoint the best time — and direction — to ride.

Factors affecting effort which are evaluated:

- Route length
- Elevation profile (ascent/descent)
- Wind speed, gust speed, and wind direction relative to route direction based on the current selected windy.com weather model weather predictions.

## Route segment / graph colours representing 'effort' / 'difficulty'

The segments of the route, and the colours in the graph range from green (easy) to red (difficult) to visualize effort along the route.
These are the rules:

Slow wind has low impact, high windspeed has high impact.
Tailwind makes cycling progressively more easy the higher the wind/gust speeds go.
Headwind does the opposite, makes cycling progressively more difficult the higher wind/gust speeds go.
So: The faster the wind/gust speeds, the easier and respectively more difficult the effort gets.

Going up or downhill always has the same impact regardless of weather.

And thus colours should reflect this by using the entire range going from dark to light green, light to dark yellow, light to dark orange, light to dark red. The center point should be no wind/gust or elevation change at all.

## Requirements

- Node.js 20.19+ (or >= 22.12.0)

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

## Wind Angle Debugger/Visualizer

Use `src/wind-angle-visualizer.html` to experiment with wind direction vs route bearing and visualize the six buckets.

Quick open:

```zsh
open src/wind-angle-visualizer.html
```

Notes:

- Input must be in degrees (0–359.9).
- The colored ring is aligned to the route bearing; arrows show route (blue) and wind-from (purple).
- Interpolator is not used. Unfortunately, we need to fetch wind data instead of using the interpolated data. That interpolated data is not accurate enough for our purposes. Using it causes segments to flip the wind direction 180 degrees sometimes resulting in segment colours/data that do not make sense.

## Documentation sources

- https://docs.windy-plugins.com/api/interfaces/broadcast.BasicBcastTypes.html
- https://docs.windy-plugins.com/api/modules/interpolator.html
- https://docs.windy-plugins.com/api/modules/fetch.html
- Icons: https://docs.windy-plugins.com/styles/section-icons.html
- Icons list: https://docs.windy-plugins.com/styles/iconfont/demo.html
