# Windy Cycling Effort Plugin

Windy.com plugin that evaluates cycling trip effort/difficulty for uploaded GPX/KML/GeoJSON route tracks.

Route segments are color-coded from green (easy) to red (hard) directly on the map, with a single effort score in the panel. Use it to compare forecast conditions and pinpoint the best time to ride.
The 'invert' option is there, so you can compare setting off in one or the other direction. Useful for routes that start and end at or near the same point.

Factors affecting effort which are evaluated:

- Route length
- Elevation profile (ascent/descent)
- Wind speed, wind gust speed, and wind direction relative to the direction of travel based on the current selected windy.com weather model weather predictions.

This plugin was made with The (flat) Netherlands in mind where wind is your biggest enemy on the bicycle.
It might be less useful for mountains (or very hilly areas) without much wind. As the weather factors taken into account have less effect on the 'total effort' than large changes in elevation.

Please note that this plugin is in beta. I have no clue how well these calculations will perform under different circumstances, as I can only validate and compare plugin output with my own experience on bike rides.
It might need more fine-tuning and/or balancing of the calculations.
If you have any feedback or suggestions, please feel free to reach out!

## Route segment / graph colours representing 'effort' / 'difficulty'

The segments of the route, and the colours in the graph range from green (easy) to red (difficult) to visualize effort along the route.
These are the rules:

Slow wind has low impact, high wind speed has high impact.
Tailwind makes cycling progressively easier the higher the wind(-gust) speeds go.
Headwind does the opposite, makes cycling progressively more difficult the higher wind(-gust) speeds go.
So: The faster the wind/gust speeds, the easier and respectively more difficult the effort gets.

Going up or downhill always has the same impact regardless of weather.

And thus colours should reflect this by using the entire range going from dark to light green, light to dark yellow, light to dark orange, light to dark red. The center point should be no wind/gust or elevation change at all.

## Plugin usage within windy.com UI

Please see the [Windy plugin usage instructions](docs/USAGE.md)

---

---

---

## Development

### Requirements

- Node.js 20.19+ (or >= 22.12.0)

### Install

```bash
npm install
```

### Run in dev mode

```bash
npm run start
```

The local dev server serves `dist/` on `https://localhost:9999`.

Navigate to [windy.com/developer-mode](https://www.windy.com/developer-mode) to launch Windy.com in developer mode, and load the plugin from the local server.

### Build

```bash
npm run build
```

### Wind Angle Debugger/Visualizer

Use `src/wind-angle-visualizer.html` to experiment with wind direction vs route bearing and visualize the six buckets.

Quick open:

```zsh
open src/wind-angle-visualizer.html
```

Notes:

- Input must be in degrees (0–359.9).
- The colored ring is aligned to the route bearing; arrows show route (blue) and wind-from (purple).
- Interpolator is not used. Unfortunately, we need to fetch wind data instead of using the interpolated data. That interpolated data is not accurate enough for our purposes. Using it causes segments to flip the wind direction 180 degrees sometimes resulting in segment colours/data that do not make sense.

### Production deployment

Deployment should automatically happen via github action when pushing to the main branch via the [publish-plugin.yml](.github/workflows/publish-plugin.yml) workflow.
Just make sure you bump the version in the [package.json](package.json) and [pluginConfig.ts](src/pluginConfig.ts) files before pushing.

After deploying, create a new release on github.

The direct file after deploying a new version of the plugin can be found here:

`https://windy-plugins.com/9417045/windy-plugin-cycling-effort/<version>/plugin.min.js`

Replace `<version>` with the plugin version you want to load.

### Documentation sources

- https://docs.windy-plugins.com/api/interfaces/broadcast.BasicBcastTypes.html
- https://docs.windy-plugins.com/api/modules/interpolator.html
- https://docs.windy-plugins.com/api/modules/fetch.html
- Icons: https://docs.windy-plugins.com/styles/section-icons.html
- Icons list: https://docs.windy-plugins.com/styles/iconfont/demo.html

### Project todos

- Add docs to USAGE.md
- Add route hover tooltip with some info about the segment, but not as expanded as the debug tooltip.
- Automatically create a new release on github after deployment of a new version #.
