# AI Agent Guide

@README.md

## Project summary

- Windy.com plugin that scores cycling routes by combining elevation and wind effects.
- UI is Svelte; logic lives in a single controller.

## Entry points and key files

- `src/plugin.svelte` wires Windy lifecycle hooks (`onmount`, `onopen`, `onclose`, `ondestroy`) to the controller.
- `src/lib/cyclingEffortController.js` contains route detection, scoring, overlay rendering, and Windy API integration.
- `src/lib/uiState.js` is the single UI store (`uiState`, `patchUiState`, `resetUiState`).
- `src/pluginConfig.ts` declares plugin metadata (name, routes, UI mode).

## Architecture and data flow

- Lifecycle:
    - `src/plugin.svelte` calls controller `mount/open/close/destroy`.
    - Controller binds to `@windy/broadcast`, `@windy/store`, and `@windy/map` to react to model/time changes and map layer changes.
- Route detection:
    - `collectTrackCandidates()` scans Leaflet layers for uploaded GPX/KML/GeoJSON routes and picks a best candidate.
- Scoring pipeline (controller):
  - Elevation and weather results are cached in IndexedDB stores (`elevation`, `weather`) with TTL-based expiration managed by the controller.
    - Renders a colored overlay layer, then updates `routeGraphSegments` for the Svelte UI.
- Caching:
    - Elevation and weather results are cached in IndexedDB stores (`elevation`, `weather`) with TTL-based expiration managed by the controller.

## Build and run

- Node.js 18+.
- Commands:
    - `npm install`
    - `npm run start` (Rollup watch + dev server; serves `dist/` on `https://localhost:9999`)
    - `npm run build`
- `rollup.config.mjs` copies `index.html` and optional `static/` assets into `dist/`.
- `dist/` is generated output; do not edit by hand.

## Debugging and tools

- `wind-angle-visualizer.html` is a standalone tool to visualize wind direction vs route bearing.
- Controller debug toggles live in `src/lib/cyclingEffortController.js`:
    - `DEBUG_LOGS`, `ENABLE_SEGMENT_DEBUG_TOOLTIP`.

## Conventions

- UI reads only from `uiState`; controller owns updates via `patchUiState`.
- Segment tuning constants live near the top of `src/lib/cyclingEffortController.js` (e.g., `SEGMENT_*`). Keep new knobs there.
