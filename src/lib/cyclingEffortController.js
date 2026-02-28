import broadcast from "@windy/broadcast";
import { getElevation } from "@windy/fetch";
import interpolator from "@windy/interpolator";
import { map } from "@windy/map";
import store from "@windy/store";

import { patchUiState, resetUiState } from "./uiState";

const OVERLAY_CLASS = "cycling-effort-overlay";
const MAX_POINTS_FOR_COMPUTE = 500;
// How heavy does the weather count towards effort relative to elevation change?
const WEATHER_WEIGHT_PERCENTAGE = 75;
const MIN_TRACK_KM = 0.08;
const DEBUG_LOGS = true;
const LOG_PREFIX = "🚴 [plugin-cycling-effort]";
const STATUS_NO_FILE_LOADED =
  'Please select a route using "Menu" > "Display KML, GPX, or GeoJSON".';

const EARTH_RADIUS_METERS = 6371000;
const WEATHER_WEIGHT_BASELINE = WEATHER_WEIGHT_PERCENTAGE / 100;
const ELEVATION_WEIGHT_BASELINE = 1 - WEATHER_WEIGHT_BASELINE;

// Core static modifiers for effort behavior.
const SEGMENT_EFFORT_MODIFIERS = Object.freeze({
  baseEffortPerKm: 1.15,
  climbEffortPerMeter: 0.052,
  descentPenaltyPerMeter: 0.0025,
  descentReliefPerMeter: 0.0065,
  maxDownhillReliefShare: 0.28,
  minEffortShareOfBase: 0.3,
  headwindEffortPerMsPerKm: 0.52,
  headCrosswindEffortPerMsPerKm: 0.34,
  tailCrosswindReliefPerMsPerKm: 0.2,
  tailwindReliefPerMsPerKm: 0.34,
  maxTailwindReliefShare: 0.24,
});

// Positive/negative mountain-gradient influence on segment difficulty.
const SEGMENT_GRADIENT_FACTORS = Object.freeze({
  uphillDifficultyWeight: 1,
  downhillDifficultyWeight: 0.18,
  downhillReliefWeight: 0.62,
});

// Wind speed/gust/direction influence on segment difficulty.
const SEGMENT_WIND_FACTORS = Object.freeze({
  headwindDifficultyWeight: 1.25,
  headCrosswindDifficultyWeight: 0.9,
  tailCrosswindReliefWeight: 0.16,
  gustDifficultyWeight: 0.68,
  tailwindReliefWeight: 0.42,
});

// Relative influence of effort intensity, mountain gradient and wind in final score.
const SEGMENT_FINAL_SCORE_WEIGHTS = Object.freeze({
  effortIntensity: 0.24,
  gradientDifficulty: 0.28,
  windDifficulty: 0.48,
});

// Absolute references to avoid route-relative color skew on flat or mountainous tracks.
const SEGMENT_NORMALIZATION_REFERENCES = Object.freeze({
  effortPerKm: 7.2,
  uphillSlopeMPerKm: 70,
  downhillSlopeMPerKm: 90,
  headwindSpeed: 7.5,
  headCrosswindSpeed: 6.5,
  tailCrosswindSpeed: 6.5,
  tailwindSpeed: 8,
  gustDeltaSpeed: 4.5,
});

const SEGMENT_EFFORT_NORMALIZATION_MIX = Object.freeze({
  relative: 0.4,
  absolute: 0.6,
});

const SEGMENT_COLOR_INTENSITY_MIX = Object.freeze({
  weather: 0.7,
  terrain: 0.3,
});

const ELEVATION_CACHE_STORAGE_KEY = "plugin-cycling-effort-elevation-cache";

// How much the weather slider shifts terrain-vs-weather contribution in final score.
const SEGMENT_WEIGHT_BLEND = Object.freeze({
  weatherSliderInfluence: 0.45,
  minDomainWeight: 0.06,
});

const SEGMENT_COLOR_TUNING = Object.freeze({
  baseSaturation: 52,
  saturationBoost: 38,
  baseLightness: 58,
  lightnessDropFromIntensity: 20,
  lightnessDropFromDifficulty: 12,
  downhillLightnessLift: 4,
  minLightness: 24,
  maxLightness: 66,
});

// Visual wind calibration target: Beaufort 7+ should read as darkest red
// for adverse full-headwind conditions.
const SEGMENT_WIND_COLOR_CALIBRATION = Object.freeze({
  darkRedAtWindMs: 12.5,
  headCrosswindPenaltyShare: 0.72,
  gustPenaltyShare: 0.58,
  tailCrosswindReliefShare: 0.45,
  tailwindReliefShare: 1.05,
});

const ENABLE_SEGMENT_DEBUG_TOOLTIP = true;
const SHOW_SEGMENT_DEBUG_TOOLTIPS = ENABLE_SEGMENT_DEBUG_TOOLTIP;
const SEGMENT_DEBUG_CONSOLE_LOG_DEBOUNCE_MS = 250;
const SEGMENT_DEBUG_TOOLTIP_MIN_WIDTH_PX = 500;
const SEGMENT_DEBUG_TOOLTIP_MAX_WIDTH_PX = 1320;
const SEGMENT_DEBUG_POPUP_OPTIONS = Object.freeze({
  closeButton: false,
  autoClose: false,
  closeOnClick: false,
  autoPan: false,
  interactive: false,
  offset: [0, -10],
  opacity: 0.95,
  className: "cycling-effort-debug-tooltip",
});

const safeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const consoleLog = (message, level = "info", ...data) => {
  if (!DEBUG_LOGS && level === "debug") return;

  const consoleMethod = (() => {
    switch (level) {
      case "debug":
        return console.debug;
      case "info":
        return console.info;
      case "warn":
        return console.warn;
      case "error":
        return console.error;
      case "log":
      default:
        return console.log;
    }
  })();
  const colors = (() => {
    switch (level) {
      case "debug":
        return {
          bg: "#ececec",
          fg: "#6b6b6b",
        };
      case "info":
        return {
          bg: "#d49500",
          fg: "white",
        };
      case "warn":
        return {
          bg: "#946051",
          fg: "white",
        };
      case "error":
        return {
          bg: "#9d0300",
          fg: "white",
        };
      case "log":
      default:
        return {
          bg: "#026f00",
          fg: "white",
        };
    }
  })();

  const css = `
      color: ${colors.fg};
      background-color: ${colors.bg};
      display: inline-block;
      line-height: normal;
      position: relative;
      font-weight: 600;
      text-align: center;
      padding: 0.15em 0.5em;
      border-radius: 1em;
      white-space: nowrap;
    `;

  consoleMethod(`%c${LOG_PREFIX} `, css, message, ...data);
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeToUnit = (value, reference) =>
  clamp(value / Math.max(1e-6, reference), 0, 1);

const normalizeDegrees = (degrees) => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const angularDistance = (a, b) => {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
};

const haversineDistanceKm = (start, end) => {
  const lat1 = (start.lat * Math.PI) / 180;
  const lon1 = (start.lon * Math.PI) / 180;
  const lat2 = (end.lat * Math.PI) / 180;
  const lon2 = (end.lon * Math.PI) / 180;

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (EARTH_RADIUS_METERS * c) / 1000;
};

const bearingBetween = (start, end) => {
  const lat1 = (start.lat * Math.PI) / 180;
  const lon1 = (start.lon * Math.PI) / 180;
  const lat2 = (end.lat * Math.PI) / 180;
  const lon2 = (end.lon * Math.PI) / 180;
  const dLon = lon2 - lon1;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
};

const midpointBetween = (start, end) => ({
  lat: (start.lat + end.lat) / 2,
  lon: (start.lon + end.lon) / 2,
});

const round = (value, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const signed = (value, decimals = 1) => {
  const numeric = safeNumber(value) ?? 0;
  const rounded = round(numeric, decimals);
  return `${rounded >= 0 ? "+" : ""}${rounded}`;
};

const toPercent = (value) => `${Math.round(clamp(value, 0, 1) * 100)}%`;

const toKmSpan = (segment) =>
  `${round(Math.max(0, segment.cumulativeKm - segment.distanceKm), 2)}-${round(
    segment.cumulativeKm,
    2,
  )} km`;

const formatSegmentDebugTooltipHtml = (segment, index) => {
  const debug = segment.debug ?? {};
  const lines = [
    `<strong>Segment ${index + 1}</strong>`,
    `Range: ${toKmSpan(segment)}`,
    `Distance: ${round(segment.distanceKm, 3)} km`,
    `Elevation: ${signed(segment.elevationDiff, 1)} m (${signed(segment.slopeRateMPerKm, 1)} m/km)`,
    `Wind H/HC/TC/T/G: ${round(segment.headwindEffectiveSpeed, 1)} / ${round(segment.headCrosswindEffectiveSpeed, 1)} / ${round(segment.tailCrosswindEffectiveSpeed, 1)} / ${round(segment.tailwindEffectiveSpeed, 1)} / ${round(segment.gustDelta, 1)} m/s`,
    `Points: base ${round(debug.baseEffort ?? 0, 2)} + terrain ${round(debug.terrainComponent ?? 0, 2)} + weather penalty ${round(debug.weatherPenaltyComponent ?? 0, 2)} - weather relief ${round(debug.weatherReliefComponent ?? 0, 2)} = ${round(segment.effort, 2)}`,
    `Norm E/G/W: ${toPercent(debug.normalizedEffort ?? 0)} / ${toPercent(debug.gradientDifficultyNorm ?? 0)} / ${toPercent(debug.windDifficultyNorm ?? 0)}`,
    `Weights E/G/W: ${toPercent(debug.effortWeight ?? 0)} / ${toPercent(debug.terrainWeight ?? 0)} / ${toPercent(debug.weatherWeight ?? 0)}`,
    `Score parts E/G/W: ${round(debug.effortContribution ?? 0, 2)} / ${round(debug.gradientContribution ?? 0, 2)} / ${round(debug.windContribution ?? 0, 2)}`,
    `Final score: ${toPercent(segment.normalizedEffort ?? 0)}`,
    `<span style="opacity:0.7;">---</span>`,
    `Legend:<br/>H = Headwind, HC = Head crosswind, TC = Tail crosswind, T = Tailwind, G = Gust (delta), E = Effort, G = Gradient, W = Wind`,
  ];
  return `<div style="font-size:11px; line-height:1.35; min-width:${SEGMENT_DEBUG_TOOLTIP_MIN_WIDTH_PX}px; max-width:${SEGMENT_DEBUG_TOOLTIP_MAX_WIDTH_PX}px; white-space:normal;">${lines.join(
    "<br/>",
  )}</div>`;
};

const buildSegmentDebugConsolePayload = (segment, index, latlng) => ({
  segmentNumber: index + 1,
  latlng: {
    lat: safeNumber(latlng?.lat) ?? null,
    lng:
      safeNumber(latlng?.lng) ??
      safeNumber(latlng?.lon) ??
      safeNumber(latlng?.longitude) ??
      null,
  },
  segment: segment,
  debug: segment?.debug ?? {},
});

const blendedDomainWeights = (
  weatherWeightPercent = WEATHER_WEIGHT_PERCENTAGE,
) => {
  const weatherWeight = clamp(weatherWeightPercent / 100, 0, 1);
  const sliderDelta = weatherWeight - WEATHER_WEIGHT_BASELINE;
  const effortBase = SEGMENT_FINAL_SCORE_WEIGHTS.effortIntensity;
  const terrainBase = SEGMENT_FINAL_SCORE_WEIGHTS.gradientDifficulty;
  const weatherBase = SEGMENT_FINAL_SCORE_WEIGHTS.windDifficulty;
  const terrainAdjusted = clamp(
    terrainBase - sliderDelta * SEGMENT_WEIGHT_BLEND.weatherSliderInfluence,
    SEGMENT_WEIGHT_BLEND.minDomainWeight,
    1,
  );
  const weatherAdjusted = clamp(
    weatherBase + sliderDelta * SEGMENT_WEIGHT_BLEND.weatherSliderInfluence,
    SEGMENT_WEIGHT_BLEND.minDomainWeight,
    1,
  );
  const sum = effortBase + terrainAdjusted + weatherAdjusted;
  if (sum <= 1e-6) {
    return { effort: 1 / 3, terrain: 1 / 3, weather: 1 / 3 };
  }
  return {
    effort: effortBase / sum,
    terrain: terrainAdjusted / sum,
    weather: weatherAdjusted / sum,
  };
};

const compositeSegmentDifficulty = ({
  normalizedEffort = 0.5,
  windDifficultyNorm = 0.5,
  gradientDifficultyNorm = 0.5,
  weatherWeightPercent = WEATHER_WEIGHT_PERCENTAGE,
}) => {
  const weights = blendedDomainWeights(weatherWeightPercent);
  return clamp(
    clamp(normalizedEffort, 0, 1) * weights.effort +
      clamp(gradientDifficultyNorm, 0, 1) * weights.terrain +
      clamp(windDifficultyNorm, 0, 1) * weights.weather,
    0,
    1,
  );
};

const colorForSegmentDifficulty = (
  difficultyNorm,
  intensityNorm = 0.5,
  downhillReliefNorm = 0,
) => {
  const difficulty = clamp(difficultyNorm, 0, 1);
  const intensity = clamp(intensityNorm, 0, 1);
  const downhillLift = clamp(downhillReliefNorm, 0, 1);
  const hue =
    difficulty <= 0.5
      ? 120 - (120 - 32) * (difficulty / 0.5)
      : 32 - 32 * ((difficulty - 0.5) / 0.5);
  const saturation =
    SEGMENT_COLOR_TUNING.baseSaturation +
    intensity * SEGMENT_COLOR_TUNING.saturationBoost;
  const lightness = clamp(
    SEGMENT_COLOR_TUNING.baseLightness -
      intensity * SEGMENT_COLOR_TUNING.lightnessDropFromIntensity -
      difficulty * SEGMENT_COLOR_TUNING.lightnessDropFromDifficulty +
      downhillLift * SEGMENT_COLOR_TUNING.downhillLightnessLift,
    SEGMENT_COLOR_TUNING.minLightness,
    SEGMENT_COLOR_TUNING.maxLightness,
  );
  return `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;
};

export const effortLegendStops = (
  weatherWeightPercent = WEATHER_WEIGHT_PERCENTAGE,
) => {
  const clampedWeight = clamp(
    Number(weatherWeightPercent) || WEATHER_WEIGHT_PERCENTAGE,
    0,
    100,
  );
  return Array.from({ length: 11 }, (_unused, index) => {
    const t = index / 10;
    const uphillNorm = t;
    const downhillNorm = 1 - t;
    const gradientDifficultyNorm = clamp(
      uphillNorm * SEGMENT_GRADIENT_FACTORS.uphillDifficultyWeight +
        downhillNorm * SEGMENT_GRADIENT_FACTORS.downhillDifficultyWeight -
        downhillNorm * SEGMENT_GRADIENT_FACTORS.downhillReliefWeight,
      0,
      1,
    );
    const windDifficultyNorm = clamp(t, 0, 1);
    const normalizedEffort = clamp(0.18 + t * 0.82, 0, 1);
    const difficulty = compositeSegmentDifficulty({
      normalizedEffort,
      windDifficultyNorm,
      gradientDifficultyNorm,
      weatherWeightPercent: clampedWeight,
    });
    const intensityNorm = clamp(0.32 + t * 0.6, 0, 1);
    return colorForSegmentDifficulty(difficulty, intensityNorm, downhillNorm);
  });
};

export const effortLegendGradient = (
  weatherWeightPercent = WEATHER_WEIGHT_PERCENTAGE,
) => {
  const stops = effortLegendStops(weatherWeightPercent);
  return `linear-gradient(to right, ${stops.join(", ")})`;
};

const parseScalarFromInterpolatedValue = (value) => {
  if (value == null) {
    return 0;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (Array.isArray(value) && value.length) {
    const a = safeNumber(value[0]);
    const b = safeNumber(value[1]);
    const c = safeNumber(value[2]);

    // Windy interpolator often returns [direction, speed, flag].
    if (
      a != null &&
      b != null &&
      c != null &&
      a >= 0 &&
      a <= 360 &&
      b >= 0 &&
      b <= 250 &&
      c >= 0 &&
      c <= 1
    ) {
      return b;
    }

    const arrScalar = safeNumber(value[0]);
    return arrScalar == null ? 0 : Math.max(0, arrScalar);
  }
  if (typeof value === "object") {
    const candidates = [
      value.value,
      value.scalar,
      value.speed,
      value.wind,
      value.ws,
      value.gust,
    ];
    for (const candidate of candidates) {
      const n = safeNumber(candidate);
      if (n != null) {
        return Math.max(0, n);
      }
    }
  }
  return 0;
};

const parseWindFromInterpolatedValue = (value) => {
  if (value == null) {
    return { speed: 0, directionFrom: null };
  }

  if (Array.isArray(value) && value.length >= 2) {
    const a = safeNumber(value[0]);
    const b = safeNumber(value[1]);
    const c = safeNumber(value[2]);

    // Windy interpolator frequently returns [directionFrom, speed, flag].
    if (
      a != null &&
      b != null &&
      c != null &&
      a >= 0 &&
      a <= 360 &&
      b >= 0 &&
      b <= 250 &&
      c >= 0 &&
      c <= 1
    ) {
      return {
        speed: b,
        directionFrom: normalizeDegrees(a),
      };
    }

    if (a != null && b != null) {
      // Fallback: interpret as vector components [u, v].
      const u = a;
      const v = b;
      const speed = Math.hypot(u, v);
      const directionToward = normalizeDegrees(
        (Math.atan2(u, v) * 180) / Math.PI,
      );
      return {
        speed,
        directionFrom: normalizeDegrees(directionToward + 180),
      };
    }
  }

  if (typeof value === "object") {
    const u = safeNumber(value.u);
    const v = safeNumber(value.v);
    if (u != null && v != null) {
      const speed = Math.hypot(u, v);
      const directionToward = normalizeDegrees(
        (Math.atan2(u, v) * 180) / Math.PI,
      );
      return {
        speed,
        directionFrom: normalizeDegrees(directionToward + 180),
      };
    }

    const speed = safeNumber(
      value.speed ?? value.ws ?? value.wind ?? value.value,
    );
    const directionFrom = safeNumber(
      value.direction ?? value.dir ?? value.wd ?? value.angle,
    );
    if (speed != null) {
      return {
        speed: Math.max(0, speed),
        directionFrom:
          directionFrom == null ? null : normalizeDegrees(directionFrom),
      };
    }
  }

  const scalar = safeNumber(value);
  return {
    speed: scalar == null ? 0 : Math.max(0, scalar),
    directionFrom: null,
  };
};

const windComponentFromRoute = (windDirectionFrom, routeBearing) => {
  if (windDirectionFrom == null) {
    return {
      headwind: 0,
      headCrosswind: 0,
      tailCrosswind: 0,
      tailwind: 0,
      angleFromRoute: 0,
    };
  }

  // Signed relative "from" angle where:
  // 0 = straight ahead, +90 = from right, +/-180 = from behind.
  // 220.5 degree offset because the circle starts at 0 degrees, and we need to offset it to point 'forward' in the correct direction.
  const rawDelta = normalizeDegrees(windDirectionFrom - routeBearing + 220.5);
  const angleFromRoute = rawDelta > 180 ? rawDelta - 360 : rawDelta;
  const absoluteAngle = Math.abs(angleFromRoute);

  // 360deg partition in 6 buckets:
  // headwind (90deg), cross-headwind (45deg), cross-tailwind (45deg),
  // tailwind (90deg), cross-tailwind (45deg), cross-headwind (45deg).
  if (absoluteAngle <= 45) {
    return {
      headwind: 1,
      headCrosswind: 0,
      tailCrosswind: 0,
      tailwind: 0,
      angleFromRoute,
    };
  }
  if (absoluteAngle <= 90) {
    return {
      headwind: 0,
      headCrosswind: 1,
      tailCrosswind: 0,
      tailwind: 0,
      angleFromRoute,
    };
  }
  if (absoluteAngle <= 135) {
    return {
      headwind: 0,
      headCrosswind: 0,
      tailCrosswind: 1,
      tailwind: 0,
      angleFromRoute,
    };
  }
  // Remaining angles are rear-aligned and treated as tailwind.
  return {
    headwind: 0,
    headCrosswind: 0,
    tailCrosswind: 0,
    tailwind: 1,
    angleFromRoute,
  };
};

const flattenLatLngArray = (latLngs, output = []) => {
  if (!Array.isArray(latLngs)) {
    return output;
  }
  for (const entry of latLngs) {
    if (Array.isArray(entry)) {
      flattenLatLngArray(entry, output);
      continue;
    }
    const lat = safeNumber(entry?.lat);
    const lon = safeNumber(entry?.lng ?? entry?.lon);
    const ele = safeNumber(
      entry?.ele ??
        entry?.alt ??
        entry?.altitude ??
        entry?.z ??
        entry?._alt ??
        entry?.meta?.ele ??
        entry?.meta?.alt ??
        entry?.meta?.altitude,
    );
    if (lat != null && lon != null) {
      output.push({
        lat,
        lon,
        ele,
      });
    }
  }
  return output;
};

const normalizePoints = (points) => {
  const normalized = [];
  for (const point of points) {
    const lat = safeNumber(point?.lat);
    const lon = safeNumber(point?.lon ?? point?.lng);
    if (lat == null || lon == null) {
      continue;
    }
    const previous = normalized[normalized.length - 1];
    if (
      previous != null &&
      Math.abs(previous.lat - lat) < 1e-7 &&
      Math.abs(previous.lon - lon) < 1e-7
    ) {
      continue;
    }
    normalized.push({
      lat,
      lon,
      ele: safeNumber(point?.ele),
    });
  }
  return normalized;
};

const routeDistanceKm = (points) => {
  if (points.length < 2) {
    return 0;
  }
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineDistanceKm(points[i - 1], points[i]);
  }
  return total;
};

const pointsFingerprint = (points) => {
  if (!points.length) {
    return "";
  }
  const first = points[0];
  const middle = points[Math.floor(points.length / 2)];
  const last = points[points.length - 1];
  return [
    points.length,
    round(first.lat, 5),
    round(first.lon, 5),
    round(middle.lat, 5),
    round(middle.lon, 5),
    round(last.lat, 5),
    round(last.lon, 5),
  ].join("|");
};

const isLeafletPolyline = (layer) => {
  if (layer == null || typeof layer.getLatLngs !== "function") {
    return false;
  }
  if (typeof window === "undefined" || window.L == null) {
    return true;
  }
  const { L } = window;
  if (L.Polygon && layer instanceof L.Polygon) {
    return false;
  }
  return L.Polyline ? layer instanceof L.Polyline : true;
};

const isCyclingOverlayLayer = (layer) =>
  Boolean(
    layer?.__cyclingEffortOverlay ||
    layer?.options?.className?.includes(OVERLAY_CLASS),
  );

const geometryToPointSets = (geometry) => {
  if (!geometry) {
    return [];
  }
  if (geometry.type === "LineString") {
    const points = (geometry.coordinates ?? [])
      .map((coord) => {
        if (!Array.isArray(coord) || coord.length < 2) {
          return null;
        }
        return {
          lon: safeNumber(coord[0]),
          lat: safeNumber(coord[1]),
          ele: safeNumber(coord[2]),
        };
      })
      .filter(Boolean);
    return [normalizePoints(points)];
  }
  if (geometry.type === "MultiLineString") {
    return (geometry.coordinates ?? [])
      .map((segment) =>
        normalizePoints(
          (segment ?? [])
            .map((coord) => {
              if (!Array.isArray(coord) || coord.length < 2) {
                return null;
              }
              return {
                lon: safeNumber(coord[0]),
                lat: safeNumber(coord[1]),
                ele: safeNumber(coord[2]),
              };
            })
            .filter(Boolean),
        ),
      )
      .filter((points) => points.length > 1);
  }
  if (geometry.type === "GeometryCollection") {
    return (geometry.geometries ?? []).flatMap(geometryToPointSets);
  }
  return [];
};

const geoJsonToPointSets = (geoJson) => {
  if (!geoJson) {
    return [];
  }
  if (geoJson.type === "FeatureCollection") {
    return (geoJson.features ?? []).flatMap(geoJsonToPointSets);
  }
  if (geoJson.type === "Feature") {
    return geometryToPointSets(geoJson.geometry);
  }
  return geometryToPointSets(geoJson);
};

const downsamplePoints = (points, maxPoints) => {
  if (points.length <= maxPoints) {
    return points;
  }
  const sampled = [points[0]];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i += 1) {
    sampled.push(points[Math.round(i * step)]);
  }
  sampled.push(points[points.length - 1]);
  return normalizePoints(sampled);
};

const formatForecastTime = (timestamp) => {
  const ts = safeNumber(timestamp);
  if (ts == null) {
    return "unknown";
  }
  const ms = ts > 1e12 ? ts : ts * 1000;
  return new Date(ms).toLocaleString();
};

const OVERLAY_PANE = "cyclingEffortPane";

const activeModel = () => {
  const direct = store.get("product");
  if (direct) {
    return String(direct);
  }
  const preferred = store.get("preferredProduct");
  return preferred ? String(preferred) : "unknown";
};

const safeStoreGet = (key) => {
  try {
    return store.get(key);
  } catch (_error) {
    return undefined;
  }
};

const parseElevationPayload = (payload) => {
  if (typeof payload === "number" && Number.isFinite(payload)) {
    return payload;
  }
  const data = payload?.data;
  if (typeof data === "number" && Number.isFinite(data)) {
    return data;
  }
  const nested = safeNumber(data?.elevation ?? data?.alt ?? data?.value);
  return nested == null ? null : nested;
};

const loadElevationCache = () => {
  try {
    const raw = localStorage.getItem(ELEVATION_CACHE_STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      return new Map(Object.entries(obj));
    }
    consoleLog("Restored local caches", "info");
  } catch (_e) {
    // Ignore parse errors or quota errors
  }
  return new Map();
};

const persistElevationCache = (controller) => {
  try {
    const obj = Object.fromEntries(controller.elevationCache);
    localStorage.setItem(ELEVATION_CACHE_STORAGE_KEY, JSON.stringify(obj));
    consoleLog("Persisted local caches", "info");
  } catch (_e) {
    // Ignore quota exceeded or other storage errors
  }
};

const summarizeInterpolatedValue = (value) => {
  if (value == null) {
    return value;
  }
  if (typeof value === "number") {
    return value;
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      len: value.length,
      head: value.slice(0, 5),
    };
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).slice(0, 10);
    const sample = {};
    for (const key of ["u", "v", "ws", "wd", "speed", "direction", "value"]) {
      if (value[key] != null) {
        sample[key] = value[key];
      }
    }
    return {
      type: "object",
      keys,
      sample,
    };
  }
  return String(value);
};

const windDataScore = (wind) =>
  (wind?.speed > 0 ? 1 : 0) + (wind?.directionFrom != null ? 1 : 0);

const sampledIndices = (length, maxSamples) => {
  if (length <= 0) {
    return [];
  }
  if (length <= maxSamples) {
    return Array.from({ length }, (_, idx) => idx);
  }
  const indices = new Set([0, length - 1]);
  const step = (length - 1) / (maxSamples - 1);
  for (let i = 1; i < maxSamples - 1; i += 1) {
    indices.add(Math.round(i * step));
  }
  return [...indices].sort((a, b) => a - b);
};

class CyclingEffortController {
  constructor() {
    this.overlayLayer = null;
    this.segmentDebugPopup = null;
    this.segmentDebugCloseTimer = null;
    this.segmentDebugPopupPinned = false;
    this.listenersBound = false;
    this.recomputeTimer = null;
    this.pendingRecomputeTimers = new Set();
    this.recomputeInProgress = false;
    this.recomputeQueued = false;
    this.lastUploadRouteId = null;
    this.elevationCache = loadElevationCache();
    this.dimmedRouteLayers = new Map();
    this.layerMutationSuppressUntil = 0;
    this.lastExternalRouteMutationAt = 0;
    this.weatherSampleDebugCount = 0;
    this.weatherWeightPercent = WEATHER_WEIGHT_PERCENTAGE;

    this.removeCaches = this.removeCaches.bind(this);
    this.onLayerMutation = this.onLayerMutation.bind(this);
    this.onWeatherMutation = this.onWeatherMutation.bind(this);
    this.onMapMoveFinished = this.onMapMoveFinished.bind(this);
    this.onBroadcastRqstOpen = this.onBroadcastRqstOpen.bind(this);
    this.onBroadcastPluginOpened = this.onBroadcastPluginOpened.bind(this);
    this.onBroadcastRqstClose = this.onBroadcastRqstClose.bind(this);
    this.onBroadcastPluginClosed = this.onBroadcastPluginClosed.bind(this);
    this.onBroadcastParamsChanged = this.onBroadcastParamsChanged.bind(this);
  }

  mount() {
    this.movePanelToEmbeddedContainer();
    patchUiState({ weatherWeightPercent: this.weatherWeightPercent });
    this.bindListeners();
    this.scheduleRecompute("plugin mounted");
  }

  open() {
    this.movePanelToEmbeddedContainer();
    patchUiState({ weatherWeightPercent: this.weatherWeightPercent });
    this.bindListeners();
    this.scheduleRecompute("plugin opened");
  }

  setWeatherWeightPercent(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clampedValue = clamp(Math.round(parsed / 10) * 10, 0, 100);
    if (clampedValue === this.weatherWeightPercent) {
      return;
    }
    this.weatherWeightPercent = clampedValue;
    patchUiState({ weatherWeightPercent: clampedValue });
    this.scheduleRecompute("weight changed");
  }

  close() {
    this.unbindListeners();
    this.clearOverlay();
    this.restoreOriginalRouteStyle();
    consoleLog("Plugin closed. Re-open to continue route analysis.");
    patchUiState({
      status: null,
      isComputing: false,
    });
  }

  destroy() {
    this.unbindListeners();
    this.clearOverlay();
    this.restoreOriginalRouteStyle();
    resetUiState();
  }

  suppressLayerMutation(ms = 1200) {
    this.layerMutationSuppressUntil = Math.max(
      this.layerMutationSuppressUntil,
      Date.now() + ms,
    );
  }

  isInternalLayerMutation(layer) {
    if (!layer) {
      return false;
    }
    if (layer === this.overlayLayer || isCyclingOverlayLayer(layer)) {
      return true;
    }
    const pane = layer?.options?.pane;
    const className = String(layer?.options?.className ?? "");
    return pane === OVERLAY_PANE || className.includes(OVERLAY_CLASS);
  }

  isPotentialRouteMutationLayer(layer) {
    if (!layer) {
      return false;
    }
    if (
      typeof layer.getLatLngs === "function" ||
      typeof layer.toGeoJSON === "function"
    ) {
      return true;
    }
    if (typeof layer.getLayers === "function") {
      try {
        const children = layer.getLayers();
        return (
          Array.isArray(children) &&
          children.some(
            (child) =>
              typeof child?.getLatLngs === "function" ||
              typeof child?.toGeoJSON === "function",
          )
        );
      } catch (_error) {
        return false;
      }
    }
    return false;
  }

  removeCaches() {
    try {
      consoleLog("Removing locally cached data", "info");
      localStorage.removeItem(ELEVATION_CACHE_STORAGE_KEY);
    } catch (_e) {
      // Ignore storage errors
    }
  }

  onLayerMutation(evt) {
    const now = Date.now();
    const layer = evt?.layer;

    if (now < this.layerMutationSuppressUntil) {
      return;
    }
    if (this.isInternalLayerMutation(layer)) {
      return;
    }
    if (!this.isPotentialRouteMutationLayer(layer)) {
      return;
    }
    if (now - this.lastExternalRouteMutationAt < 1200) {
      return;
    }
    this.lastExternalRouteMutationAt = now;

    consoleLog("onLayerMutation -> scheduleRecompute", "debug", {
      type: evt?.type,
      layerType: layer?.constructor?.name ?? "unknown",
    });
    this.scheduleRecompute("route changed");
  }

  onWeatherMutation() {
    this.scheduleRecompute("weather changed");
  }

  onMapMoveFinished() {
    this.scheduleRecompute("map moved");
  }

  onBroadcastRqstOpen(pluginName, params) {
    if (pluginName !== "upload" && pluginName !== "uploader") {
      return;
    }
    this.lastUploadRouteId = params?.id ?? this.lastUploadRouteId;
    this.scheduleUploadDrivenRecompute("upload requested");
  }

  onBroadcastPluginOpened(pluginName) {
    if (pluginName !== "upload" && pluginName !== "uploader") {
      return;
    }
    this.scheduleUploadDrivenRecompute("upload opened");
  }

  onBroadcastRqstClose(pluginName) {
    if (pluginName !== "windy-plugin-cycling-effort") {
      return;
    }

    this.removeCaches();
  }

  onBroadcastPluginClosed(pluginName) {
    if (pluginName !== "windy-plugin-cycling-effort") {
      return;
    }

    this.removeCaches();
  }

  onBroadcastParamsChanged(_params, changedParam) {
    if (changedParam === "path") {
      this.scheduleUploadDrivenRecompute("route path changed");
    }
  }

  movePanelToEmbeddedContainer() {
    if (typeof document === "undefined") {
      return;
    }
    const tryMove = () => {
      const host = document.querySelector("#plugin-rhbottom");
      const panel = document.querySelector(".cycling-panel");
      if (!host || !panel) {
        return false;
      }
      if (panel.parentElement !== host) {
        host.appendChild(panel);
      }
      return true;
    };

    if (!tryMove()) {
      setTimeout(() => {
        tryMove();
      }, 0);
      setTimeout(() => {
        tryMove();
      }, 250);
    }
  }

  scheduleUploadDrivenRecompute(reason) {
    this.scheduleRecompute(reason);
    for (const delay of [450, 1300, 2600]) {
      const timer = setTimeout(() => {
        this.pendingRecomputeTimers.delete(timer);
        this.scheduleRecompute(`${reason} (${delay}ms retry)`);
      }, delay);
      this.pendingRecomputeTimers.add(timer);
    }
  }

  bindListeners() {
    if (this.listenersBound) {
      return;
    }
    map.on("layeradd", this.onLayerMutation);
    map.on("layerremove", this.onLayerMutation);
    map.on("moveend", this.onMapMoveFinished);
    map.on("zoomend", this.onMapMoveFinished);
    store.on("timestamp", this.onWeatherMutation);
    store.on("product", this.onWeatherMutation);
    store.on("preferredProduct", this.onWeatherMutation);
    broadcast.on("redrawFinished", this.onWeatherMutation);
    broadcast.on("rqstOpen", this.onBroadcastRqstOpen);
    broadcast.on("pluginOpened", this.onBroadcastPluginOpened);
    broadcast.on("rqstClose", this.onBroadcastRqstClose);
    broadcast.on("pluginClosed", this.onBroadcastPluginClosed);
    broadcast.on("paramsChanged", this.onBroadcastParamsChanged);
    this.listenersBound = true;
  }

  unbindListeners() {
    if (!this.listenersBound) {
      return;
    }
    map.off("layeradd", this.onLayerMutation);
    map.off("layerremove", this.onLayerMutation);
    map.off("moveend", this.onMapMoveFinished);
    map.off("zoomend", this.onMapMoveFinished);
    store.off("timestamp", this.onWeatherMutation);
    store.off("product", this.onWeatherMutation);
    store.off("preferredProduct", this.onWeatherMutation);
    broadcast.off("redrawFinished", this.onWeatherMutation);
    broadcast.off("rqstOpen", this.onBroadcastRqstOpen);
    broadcast.off("pluginOpened", this.onBroadcastPluginOpened);
    broadcast.off("rqstClose", this.onBroadcastRqstClose);
    broadcast.off("pluginClosed", this.onBroadcastPluginClosed);
    broadcast.off("paramsChanged", this.onBroadcastParamsChanged);
    this.listenersBound = false;
    if (this.recomputeTimer != null) {
      clearTimeout(this.recomputeTimer);
      this.recomputeTimer = null;
    }
    for (const timer of this.pendingRecomputeTimers) {
      clearTimeout(timer);
    }
    this.pendingRecomputeTimers.clear();
  }

  scheduleRecompute(reason) {
    consoleLog("scheduleRecompute", "info", { reason });
    if (this.recomputeTimer != null) {
      clearTimeout(this.recomputeTimer);
    }
    this.recomputeTimer = setTimeout(() => {
      this.recomputeTimer = null;
      this.recompute(reason);
    }, 180);
  }

  collectTrackCandidates() {
    const candidates = [];
    const seenLayers = new Set();
    const seenFingerprints = new Set();

    const tryCandidate = (points, layer, hint = "") => {
      const normalizedPoints = normalizePoints(points);
      if (normalizedPoints.length < 2) {
        return;
      }
      const distanceKm = routeDistanceKm(normalizedPoints);
      if (distanceKm < MIN_TRACK_KM) {
        return;
      }
      const fingerprint = pointsFingerprint(normalizedPoints);
      if (!fingerprint || seenFingerprints.has(fingerprint)) {
        return;
      }
      seenFingerprints.add(fingerprint);

      const props = layer?.feature?.properties ?? {};
      const metadata = JSON.stringify(props).toLowerCase();
      const looksLikeUpload = /(gpx|kml|geojson|track|route|upload|file)/.test(
        `${hint} ${metadata}`,
      );
      const hasElevation = normalizedPoints.some((point) => point.ele != null);
      const displayName =
        props.name ??
        props.title ??
        layer?.options?.name ??
        layer?.name ??
        "Uploaded route";

      const score =
        distanceKm +
        (looksLikeUpload ? 4 : 0) +
        (hasElevation ? 2.5 : 0) +
        (layer?.options?.interactive ? 0.2 : 0);

      candidates.push({
        points: normalizedPoints,
        distanceKm,
        looksLikeUpload,
        hasElevation,
        score,
        displayName: String(displayName),
        sourceLayer: layer,
      });
    };

    const walkLayer = (layer) => {
      if (
        layer == null ||
        seenLayers.has(layer) ||
        isCyclingOverlayLayer(layer)
      ) {
        return;
      }
      seenLayers.add(layer);

      if (
        typeof layer.eachLayer === "function" &&
        typeof layer.getLayers === "function"
      ) {
        layer.eachLayer((child) => walkLayer(child));
      }

      if (isLeafletPolyline(layer)) {
        try {
          const flatPoints = flattenLatLngArray(layer.getLatLngs());
          if (flatPoints.length > 1) {
            tryCandidate(flatPoints, layer, "polyline");
          }
        } catch (_error) {
          // Ignore malformed layer geometry.
        }
      }

      if (typeof layer.toGeoJSON === "function") {
        try {
          const geo = layer.toGeoJSON();
          for (const pointSet of geoJsonToPointSets(geo)) {
            if (pointSet.length > 1) {
              tryCandidate(pointSet, layer, "geojson");
            }
          }
        } catch (_error) {
          // Ignore layers with broken GeoJSON export.
        }
      }
    };

    map.eachLayer((layer) => walkLayer(layer));

    const uploaded = candidates.filter(
      (candidate) => candidate.looksLikeUpload,
    );
    const preferred = uploaded.length ? uploaded : candidates;
    consoleLog("collectTrackCandidates", "debug", {
      totalCandidates: candidates.length,
      preferredCandidates: preferred.length,
      sample: preferred.slice(0, 5).map((candidate) => ({
        distanceKm: round(candidate.distanceKm, 2),
        hasElevation: candidate.hasElevation,
        looksLikeUpload: candidate.looksLikeUpload,
        score: round(candidate.score, 2),
        name: candidate.displayName,
      })),
    });
    return preferred.sort((a, b) => b.score - a.score);
  }

  collectStylableRouteLayers(layer, output = []) {
    if (!layer || isCyclingOverlayLayer(layer)) {
      return output;
    }
    if (
      typeof layer.eachLayer === "function" &&
      typeof layer.getLayers === "function"
    ) {
      layer.eachLayer((child) =>
        this.collectStylableRouteLayers(child, output),
      );
    }
    if (
      typeof layer.setStyle === "function" &&
      typeof layer.getLatLngs === "function"
    ) {
      output.push(layer);
    }
    return output;
  }

  restoreOriginalRouteStyle() {
    for (const [layer, style] of this.dimmedRouteLayers.entries()) {
      try {
        layer.setStyle(style);
      } catch (_error) {
        // Route layer might already be removed.
      }
    }
    this.dimmedRouteLayers.clear();
  }

  dimOriginalRouteLayer(layer) {
    this.restoreOriginalRouteStyle();
    if (!layer) {
      consoleLog("dimOriginalRouteLayer: no layer selected", "debug");
      return;
    }
    const stylableLayers = this.collectStylableRouteLayers(layer);
    consoleLog("dimOriginalRouteLayer", "debug", {
      stylableLayerCount: stylableLayers.length,
    });
    for (const routeLayer of stylableLayers) {
      const previousStyle = {
        color: routeLayer.options?.color,
        weight: routeLayer.options?.weight,
        opacity: routeLayer.options?.opacity,
        fillOpacity: routeLayer.options?.fillOpacity,
      };
      this.dimmedRouteLayers.set(routeLayer, previousStyle);
      try {
        routeLayer.setStyle({
          color: "#666666",
          opacity: 0.18,
          weight: Math.max(2, Number(routeLayer.options?.weight) || 2),
          fillOpacity: 0,
        });
        consoleLog("dimOriginalRouteLayer: setStyle", "debug", {
          original: previousStyle,
          updated: {
            color: "#666666",
            opacity: 0.18,
            weight: Math.max(2, Number(routeLayer.options?.weight) || 2),
          },
        });
      } catch (_error) {
        // Ignore layers that do not support style updates.
      }
    }
  }

  async createWeatherSampler() {
    const interpolateCoords =
      typeof interpolator.getLatLonInterpolator === "function"
        ? await interpolator.getLatLonInterpolator()
        : null;
    const interpolateWindDirect =
      typeof interpolator.interpolateWind === "function"
        ? interpolator.interpolateWind.bind(interpolator)
        : null;
    const interpolatePointDirect =
      typeof interpolator.interpolatePoint === "function"
        ? interpolator.interpolatePoint.bind(interpolator)
        : null;

    if (!interpolateCoords) {
      return async (lat, lon) => {
        const directWind = interpolateWindDirect
          ? parseWindFromInterpolatedValue(
              interpolateWindDirect({ lat, lon, alt: "surface" }),
            )
          : { speed: 0, directionFrom: null };
        const directGust = interpolatePointDirect
          ? parseScalarFromInterpolatedValue(
              interpolatePointDirect({ lat, lon }, "gust"),
            )
          : 0;
        return {
          windSpeed: directWind.speed,
          windDirectionFrom: directWind.directionFrom,
          gustSpeed: directGust || directWind.speed,
        };
      };
    }

    const baseParams = {
      timestamp: safeStoreGet("timestamp"),
      product: safeStoreGet("product") ?? safeStoreGet("preferredProduct"),
      level: safeStoreGet("level"),
    };

    return async (lat, lon) => {
      let wind = null;
      let gust = null;
      const windParams = { ...baseParams, overlay: "wind" };
      const gustParams = { ...baseParams, overlay: "gust" };
      let directWindRaw = null;
      let directGustRaw = null;

      try {
        wind = await interpolateCoords({ lat, lon }, windParams);
      } catch (_error) {
        try {
          wind = await interpolateCoords({ lat, lon });
        } catch (_nestedError) {
          // Ignore unavailable wind data.
        }
      }

      try {
        gust = await interpolateCoords({ lat, lon }, gustParams);
      } catch (_error) {
        // Some interpolator variants can only sample currently rendered overlay.
      }

      const parsedWind = parseWindFromInterpolatedValue(wind);
      let gustSpeed = parseScalarFromInterpolatedValue(gust);
      let directWind = { speed: 0, directionFrom: null };

      if (interpolateWindDirect) {
        try {
          directWindRaw = interpolateWindDirect({ lat, lon, alt: "surface" });
          directWind = parseWindFromInterpolatedValue(directWindRaw);
        } catch (_error) {
          // Ignore unavailable direct wind interpolation.
        }
      }
      if (interpolatePointDirect) {
        try {
          directGustRaw = interpolatePointDirect({ lat, lon }, "gust");
          const directGust = parseScalarFromInterpolatedValue(directGustRaw);
          if (directGust > gustSpeed) {
            gustSpeed = directGust;
          }
        } catch (_error) {
          // Ignore unavailable direct gust interpolation.
        }
      }

      let chosenWind =
        windDataScore(directWind) > windDataScore(parsedWind)
          ? { ...directWind }
          : { ...parsedWind };
      if (chosenWind.speed <= 0 && gustSpeed > 0) {
        chosenWind.speed = gustSpeed * 0.7;
      }

      if (this.weatherSampleDebugCount < 5) {
        //   consoleLog("weather sample", "debug", {
        //     lat: round(lat, 4),
        //     lon: round(lon, 4),
        //     fromCoordsRaw: summarizeInterpolatedValue(wind),
        //     fromDirectRaw: summarizeInterpolatedValue(directWindRaw),
        //     gustCoordsRaw: summarizeInterpolatedValue(gust),
        //     gustDirectRaw: summarizeInterpolatedValue(directGustRaw),
        //     parsedFromCoords: parsedWind,
        //     parsedFromDirect: directWind,
        //     chosenWind,
        //     gustSpeed: round(gustSpeed, 2),
        //   });
        this.weatherSampleDebugCount += 1;
      }

      return {
        windSpeed: chosenWind.speed,
        windDirectionFrom: chosenWind.directionFrom,
        gustSpeed: gustSpeed || chosenWind.speed,
      };
    };
  }

  async enrichMissingElevation(points) {
    // const withElevation = points.filter(
    //   (point) => point.ele != null && point.ele !== 0,
    // ).length;
    // if (withElevation >= 2) {
    //   // Do not get elevation from Windy DEM.
    //   // Use the elevation data contained in the data of the GPX track.
    //   return points;
    // }

    const indices = sampledIndices(points.length, 100000);
    const samples = [];

    const fetchOne = async (idx) => {
      const point = points[idx];
      const key = `${round(point.lat, 5)},${round(point.lon, 5)}`;
      if (this.elevationCache.has(key)) {
        return this.elevationCache.get(key);
      }
      try {
        const payload = await getElevation(point.lat, point.lon);
        const elevation = parseElevationPayload(payload);
        if (elevation != null) {
          this.elevationCache.set(key, elevation);
        }
        return elevation;
      } catch (_error) {
        return null;
      }
    };

    for (let i = 0; i < indices.length; i += 1) {
      const idx = indices[i];
      const elevation = await fetchOne(idx);
      if (elevation != null) {
        samples.push({ idx, elevation });
      }
    }
    persistElevationCache(this);

    if (samples.length < 2) {
      return points;
    }

    const enriched = points.map((point) => ({ ...point }));
    for (const { idx, elevation } of samples) {
      enriched[idx].ele = elevation;
    }

    let cursor = 0;
    for (let i = 0; i < enriched.length; i += 1) {
      while (cursor + 1 < samples.length && samples[cursor + 1].idx <= i) {
        cursor += 1;
      }
      if (enriched[i].ele != null) {
        continue;
      }
      const left = samples[cursor];
      const right = samples[Math.min(samples.length - 1, cursor + 1)];
      if (!left || !right) {
        continue;
      }
      if (left.idx === right.idx) {
        enriched[i].ele = left.elevation;
        continue;
      }
      const t = (i - left.idx) / (right.idx - left.idx);
      enriched[i].ele = left.elevation + (right.elevation - left.elevation) * t;
    }

    return enriched;
  }

  async analyze(points) {
    const pointsWithElevation = await this.enrichMissingElevation(points);
    const elevationProfile = [];
    let profileDistanceKm = 0;
    if (pointsWithElevation.length) {
      const firstElevation = safeNumber(pointsWithElevation[0].ele);
      if (firstElevation != null) {
        elevationProfile.push({
          distanceKm: 0,
          elevationM: firstElevation,
        });
      }
      for (let i = 1; i < pointsWithElevation.length; i += 1) {
        const start = pointsWithElevation[i - 1];
        const end = pointsWithElevation[i];
        const stepDistance = haversineDistanceKm(start, end);
        if (stepDistance <= 0) {
          continue;
        }
        profileDistanceKm += stepDistance;
        const elevation = safeNumber(end.ele ?? start.ele);
        if (elevation == null) {
          continue;
        }
        elevationProfile.push({
          distanceKm: profileDistanceKm,
          elevationM: elevation,
        });
      }
    }
    const segments = [];
    let totalDistanceKm = 0;
    let totalAscentM = 0;
    let totalDescentM = 0;
    let totalEffort = 0;
    let weatherImpact = 0;
    let elevationImpact = 0;
    let cumulativeKm = 0;
    let windSampleCount = 0;
    let elevationPointCount = pointsWithElevation.reduce(
      (count, point) => count + (point.ele != null ? 1 : 0),
      0,
    );
    const sampleWeather = await this.createWeatherSampler();
    const weatherWeight = clamp(this.weatherWeightPercent / 100, 0, 1);
    const elevationWeight = 1 - weatherWeight;
    const weatherScaling =
      weatherWeight / Math.max(1e-3, WEATHER_WEIGHT_BASELINE);
    const elevationScaling =
      elevationWeight / Math.max(1e-3, ELEVATION_WEIGHT_BASELINE);

    for (let i = 1; i < pointsWithElevation.length; i += 1) {
      const start = pointsWithElevation[i - 1];
      const end = pointsWithElevation[i];
      const distanceKm = haversineDistanceKm(start, end);
      if (distanceKm < 0.005) {
        continue;
      }

      const startEle = start.ele ?? end.ele ?? 0;
      const endEle = end.ele ?? start.ele ?? 0;

      const elevationDiff = endEle - startEle;
      const ascent = Math.max(0, elevationDiff);
      const descent = Math.max(0, -elevationDiff);

      totalAscentM += ascent;
      totalDescentM += descent;
      totalDistanceKm += distanceKm;

      const routeBearing = bearingBetween(start, end);
      const midPoint = midpointBetween(start, end);
      const weather = await sampleWeather(midPoint.lat, midPoint.lon);
      if (weather.windSpeed > 0 || weather.gustSpeed > 0) {
        windSampleCount += 1;
      }
      const windVector =
        weather.windDirectionFrom == null
          ? {
              headwind: 0.45,
              headCrosswind: 0.35,
              tailCrosswind: 0,
              tailwind: 0,
              angleFromRoute: 0,
            }
          : windComponentFromRoute(weather.windDirectionFrom, routeBearing);

      const headwindSpeed = windVector.headwind * weather.windSpeed;
      const headCrosswindSpeed = windVector.headCrosswind * weather.windSpeed;
      const tailCrosswindSpeed = windVector.tailCrosswind * weather.windSpeed;
      const tailwindSpeed = windVector.tailwind * weather.windSpeed;
      const gustDelta = Math.max(0, weather.gustSpeed - weather.windSpeed);
      const headwindGustSpeed = windVector.headwind * gustDelta;
      const headCrosswindGustSpeed = windVector.headCrosswind * gustDelta;
      const tailCrosswindGustSpeed = windVector.tailCrosswind * gustDelta;
      const tailwindGustSpeed = windVector.tailwind * gustDelta;
      const headwindEffectiveSpeed = headwindSpeed + headwindGustSpeed;
      const headCrosswindEffectiveSpeed =
        headCrosswindSpeed + headCrosswindGustSpeed;
      const tailCrosswindEffectiveSpeed =
        tailCrosswindSpeed + tailCrosswindGustSpeed;
      const tailwindEffectiveSpeed = tailwindSpeed + tailwindGustSpeed;
      // distanceKm is already in kilometers, so this is meters-per-kilometer.
      const slopeRateMPerKm = elevationDiff / Math.max(0.02, distanceKm);

      const baseEffort = distanceKm * SEGMENT_EFFORT_MODIFIERS.baseEffortPerKm;
      const climbEffort = ascent * SEGMENT_EFFORT_MODIFIERS.climbEffortPerMeter;
      const descentPenalty =
        descent * SEGMENT_EFFORT_MODIFIERS.descentPenaltyPerMeter;
      const downhillReliefRaw =
        descent * SEGMENT_EFFORT_MODIFIERS.descentReliefPerMeter;
      const maxDownhillRelief =
        baseEffort * SEGMENT_EFFORT_MODIFIERS.maxDownhillReliefShare;
      const downhillRelief = Math.min(downhillReliefRaw, maxDownhillRelief);
      const headwindEffort =
        headwindEffectiveSpeed *
        distanceKm *
        SEGMENT_EFFORT_MODIFIERS.headwindEffortPerMsPerKm;
      const headCrosswindEffort =
        headCrosswindEffectiveSpeed *
        distanceKm *
        SEGMENT_EFFORT_MODIFIERS.headCrosswindEffortPerMsPerKm;
      const tailCrosswindRelief =
        tailCrosswindEffectiveSpeed *
        distanceKm *
        SEGMENT_EFFORT_MODIFIERS.tailCrosswindReliefPerMsPerKm;
      const terrainComponent =
        (climbEffort + descentPenalty - downhillRelief) * elevationScaling;
      const weatherPenaltyComponent =
        (headwindEffort + headCrosswindEffort) * weatherScaling;
      const subtotal = baseEffort + terrainComponent + weatherPenaltyComponent;
      const tailwindReliefRaw =
        tailwindEffectiveSpeed *
        distanceKm *
        SEGMENT_EFFORT_MODIFIERS.tailwindReliefPerMsPerKm *
        weatherScaling;
      const tailCrosswindReliefScaled = tailCrosswindRelief * weatherScaling;
      const weatherReliefComponent = Math.min(
        Math.max(0, subtotal) * SEGMENT_EFFORT_MODIFIERS.maxTailwindReliefShare,
        tailwindReliefRaw + tailCrosswindReliefScaled,
      );
      const effort = Math.max(
        baseEffort * SEGMENT_EFFORT_MODIFIERS.minEffortShareOfBase,
        subtotal - weatherReliefComponent,
      );

      cumulativeKm += distanceKm;
      totalEffort += effort;
      weatherImpact += weatherPenaltyComponent - weatherReliefComponent;
      elevationImpact += terrainComponent;

      segments.push({
        start,
        end,
        distanceKm,
        elevationDiff,
        effort,
        cumulativeKm,
        headwindSpeed,
        headCrosswindSpeed,
        tailCrosswindSpeed,
        tailwindSpeed,
        headwindEffectiveSpeed,
        headCrosswindEffectiveSpeed,
        tailCrosswindEffectiveSpeed,
        tailwindEffectiveSpeed,
        gustDelta,
        angleFromRoute: windVector.angleFromRoute,
        slopeRateMPerKm,
        baseEffort,
        climbEffort,
        descentPenalty,
        downhillRelief,
        headwindEffort,
        headCrosswindEffort,
        tailCrosswindRelief: tailCrosswindReliefScaled,
        terrainComponent,
        weatherPenaltyComponent,
        weatherReliefComponent,
        windDirectionFrom: weather.windDirectionFrom,
      });
    }

    const intensityBySegment = segments.map(
      (segment) => segment.effort / Math.max(0.02, segment.distanceKm),
    );
    const minIntensity = Math.min(...intensityBySegment);
    const maxIntensity = Math.max(...intensityBySegment);
    const spread = maxIntensity - minIntensity;
    const domainWeights = blendedDomainWeights(this.weatherWeightPercent);

    for (const [index, segment] of segments.entries()) {
      const relativeIntensityNorm =
        spread > 1e-6
          ? (intensityBySegment[index] - minIntensity) / spread
          : 0.5;
      const absoluteIntensityNorm = normalizeToUnit(
        intensityBySegment[index],
        SEGMENT_NORMALIZATION_REFERENCES.effortPerKm,
      );
      const normalizedEffort = clamp(
        relativeIntensityNorm * SEGMENT_EFFORT_NORMALIZATION_MIX.relative +
          absoluteIntensityNorm * SEGMENT_EFFORT_NORMALIZATION_MIX.absolute,
        0,
        1,
      );

      const uphillNorm = normalizeToUnit(
        Math.max(0, segment.slopeRateMPerKm),
        SEGMENT_NORMALIZATION_REFERENCES.uphillSlopeMPerKm,
      );
      const downhillNorm = normalizeToUnit(
        Math.max(0, -segment.slopeRateMPerKm),
        SEGMENT_NORMALIZATION_REFERENCES.downhillSlopeMPerKm,
      );
      const headwindNorm = normalizeToUnit(
        segment.headwindEffectiveSpeed,
        SEGMENT_NORMALIZATION_REFERENCES.headwindSpeed,
      );
      const headCrosswindNorm = normalizeToUnit(
        segment.headCrosswindEffectiveSpeed,
        SEGMENT_NORMALIZATION_REFERENCES.headCrosswindSpeed,
      );
      const tailCrosswindNorm = normalizeToUnit(
        segment.tailCrosswindEffectiveSpeed,
        SEGMENT_NORMALIZATION_REFERENCES.tailCrosswindSpeed,
      );
      const tailwindNorm = normalizeToUnit(
        segment.tailwindEffectiveSpeed,
        SEGMENT_NORMALIZATION_REFERENCES.tailwindSpeed,
      );
      const gustNorm = normalizeToUnit(
        segment.gustDelta,
        SEGMENT_NORMALIZATION_REFERENCES.gustDeltaSpeed,
      );
      const gradientDifficultyNorm = clamp(
        uphillNorm * SEGMENT_GRADIENT_FACTORS.uphillDifficultyWeight +
          downhillNorm * SEGMENT_GRADIENT_FACTORS.downhillDifficultyWeight -
          downhillNorm * SEGMENT_GRADIENT_FACTORS.downhillReliefWeight,
        0,
        1,
      );
      const windDifficultyNorm = clamp(
        headwindNorm * SEGMENT_WIND_FACTORS.headwindDifficultyWeight +
          headCrosswindNorm *
            SEGMENT_WIND_FACTORS.headCrosswindDifficultyWeight +
          gustNorm * SEGMENT_WIND_FACTORS.gustDifficultyWeight -
          tailCrosswindNorm * SEGMENT_WIND_FACTORS.tailCrosswindReliefWeight -
          tailwindNorm * SEGMENT_WIND_FACTORS.tailwindReliefWeight,
        0,
        1,
      );
      const weatherMagnitudeAvg = clamp(
        (headwindNorm +
          headCrosswindNorm * 0.8 +
          tailCrosswindNorm * 0.35 +
          tailwindNorm * 0.45 +
          gustNorm * 0.85) /
          (1 + 0.8 + 0.35 + 0.45 + 0.85),
        0,
        1,
      );
      const weatherMagnitudePeak = clamp(
        Math.max(
          headwindNorm,
          headCrosswindNorm * 0.88,
          gustNorm * 0.9,
          tailwindNorm * 0.5,
          tailCrosswindNorm * 0.4,
        ),
        0,
        1,
      );
      const weatherMagnitudeNorm = clamp(
        weatherMagnitudeAvg * 0.35 + weatherMagnitudePeak * 0.65,
        0,
        1,
      );
      const terrainMagnitudeNorm = clamp(
        (uphillNorm + downhillNorm * 0.65) / (1 + 0.65),
        0,
        1,
      );
      const intensityNorm = clamp(
        weatherMagnitudeNorm * SEGMENT_COLOR_INTENSITY_MIX.weather +
          terrainMagnitudeNorm * SEGMENT_COLOR_INTENSITY_MIX.terrain,
        0,
        1,
      );

      const effortContribution = normalizedEffort * domainWeights.effort;
      const gradientContribution =
        gradientDifficultyNorm * domainWeights.terrain;
      const windContribution = windDifficultyNorm * domainWeights.weather;
      const normalized = clamp(
        effortContribution + gradientContribution + windContribution,
        0,
        1,
      );
      const adverseWindMs =
        segment.headwindEffectiveSpeed +
        segment.headCrosswindEffectiveSpeed *
          SEGMENT_WIND_COLOR_CALIBRATION.headCrosswindPenaltyShare +
        segment.gustDelta * SEGMENT_WIND_COLOR_CALIBRATION.gustPenaltyShare;
      const assistiveWindMs =
        segment.tailCrosswindEffectiveSpeed *
          SEGMENT_WIND_COLOR_CALIBRATION.tailCrosswindReliefShare +
        segment.tailwindEffectiveSpeed *
          SEGMENT_WIND_COLOR_CALIBRATION.tailwindReliefShare;
      const netAdverseWindMs = Math.max(0, adverseWindMs - assistiveWindMs);
      const windVisualDifficultyNorm = clamp(
        netAdverseWindMs /
          Math.max(1e-6, SEGMENT_WIND_COLOR_CALIBRATION.darkRedAtWindMs),
        0,
        1,
      );
      const tailwindVisualReliefNorm = clamp(
        assistiveWindMs /
          Math.max(1e-6, SEGMENT_WIND_COLOR_CALIBRATION.darkRedAtWindMs),
        0,
        1,
      );
      const colorDifficulty = clamp(
        Math.max(
          windVisualDifficultyNorm,
          normalized * 0.48 +
            Math.max(windDifficultyNorm, weatherMagnitudePeak) * 0.6 -
            tailwindVisualReliefNorm * 0.26,
        ),
        0,
        1,
      );
      segment.normalizedEffort = colorDifficulty;
      segment.color = colorForSegmentDifficulty(
        colorDifficulty,
        intensityNorm,
        downhillNorm,
      );
      segment.debug = {
        normalizedEffort,
        compositeDifficultyNorm: normalized,
        colorDifficultyNorm: colorDifficulty,
        windVisualDifficultyNorm,
        tailwindVisualReliefNorm,
        netAdverseWindMs,
        gradientDifficultyNorm,
        windDifficultyNorm,
        effortWeight: domainWeights.effort,
        terrainWeight: domainWeights.terrain,
        weatherWeight: domainWeights.weather,
        effortContribution,
        gradientContribution,
        windContribution,
        baseEffort: segment.baseEffort,
        climbEffort: segment.climbEffort,
        descentPenalty: segment.descentPenalty,
        downhillRelief: segment.downhillRelief,
        headwindEffort: segment.headwindEffort,
        headCrosswindEffort: segment.headCrosswindEffort,
        tailCrosswindRelief: segment.tailCrosswindRelief,
        terrainComponent: segment.terrainComponent,
        weatherPenaltyComponent: segment.weatherPenaltyComponent,
        weatherReliefComponent: segment.weatherReliefComponent,
      };
    }

    const routeGraphSegments = segments.map((segment) => ({
      startDistanceKm: Math.max(0, segment.cumulativeKm - segment.distanceKm),
      endDistanceKm: segment.cumulativeKm,
      startElevationM:
        safeNumber(segment.start?.ele ?? segment.end?.ele ?? 0) ?? 0,
      endElevationM:
        safeNumber(segment.end?.ele ?? segment.start?.ele ?? 0) ?? 0,
      color: segment.color,
    }));

    const colorCounts = segments.reduce((acc, segment) => {
      acc[segment.color] = (acc[segment.color] ?? 0) + 1;
      return acc;
    }, {});
    consoleLog("analyze summary", "debug", {
      segmentCount: segments.length,
      totalDistanceKm: round(totalDistanceKm, 2),
      totalAscentM: Math.round(totalAscentM),
      totalDescentM: Math.round(totalDescentM),
      weatherImpact: round(weatherImpact, 2),
      windSampleCount,
      elevationPointCount,
      colorCounts,
      sampleSegments: segments.slice(0, 12).map((segment) => ({
        km: round(segment.distanceKm, 3),
        headwind: round(segment.headwindEffectiveSpeed, 2),
        headCrosswind: round(segment.headCrosswindEffectiveSpeed, 2),
        tailCrosswind: round(segment.tailCrosswindEffectiveSpeed, 2),
        tailwind: round(segment.tailwindEffectiveSpeed, 2),
        gustDelta: round(segment.gustDelta, 2),
        relativeWindAngle: round(segment.angleFromRoute, 1),
        slopeRateMPerKm: round(segment.slopeRateMPerKm, 1),
        climbDiff: round(segment.elevationDiff, 1),
        color: segment.color,
      })),
    });

    return {
      segments,
      totalDistanceKm,
      totalAscentM,
      totalDescentM,
      totalEffort,
      weatherImpact,
      elevationImpact,
      windSampleCount,
      elevationPointCount,
      elevationProfile,
      routeGraphSegments,
    };
  }

  ensureOverlayLayer() {
    if (this.overlayLayer || typeof window === "undefined" || !window.L) {
      return;
    }
    if (!map.getPane(OVERLAY_PANE)) {
      map.createPane(OVERLAY_PANE);
      const pane = map.getPane(OVERLAY_PANE);
      if (pane) {
        pane.style.zIndex = "660";
        pane.style.pointerEvents = SHOW_SEGMENT_DEBUG_TOOLTIPS
          ? "auto"
          : "none";
      }
    }
    this.overlayLayer = window.L.layerGroup();
    this.overlayLayer.__cyclingEffortOverlay = true;
    this.overlayLayer.addTo(map);
  }

  resetOverlayLayer() {
    if (typeof window === "undefined" || !window.L) {
      this.overlayLayer = null;
      return;
    }
    this.closeSegmentDebugPopup();
    this.suppressLayerMutation();
    if (this.overlayLayer) {
      try {
        this.overlayLayer.remove();
      } catch (_error) {
        try {
          map.removeLayer(this.overlayLayer);
        } catch (_nestedError) {
          // Ignore stale renderer state.
        }
      }
    }
    if (!map.getPane(OVERLAY_PANE)) {
      map.createPane(OVERLAY_PANE);
      const pane = map.getPane(OVERLAY_PANE);
      if (pane) {
        pane.style.zIndex = "660";
        pane.style.pointerEvents = SHOW_SEGMENT_DEBUG_TOOLTIPS
          ? "auto"
          : "none";
      }
    }
    this.overlayLayer = window.L.layerGroup();
    this.overlayLayer.__cyclingEffortOverlay = true;
    this.overlayLayer.addTo(map);
  }

  clearOverlay() {
    this.closeSegmentDebugPopup();
    if (!this.overlayLayer) {
      return;
    }
    this.suppressLayerMutation();
    try {
      this.overlayLayer.remove();
    } catch (_error) {
      try {
        map.removeLayer(this.overlayLayer);
      } catch (_nestedError) {
        // Ignore stale renderer state.
      }
    } finally {
      this.overlayLayer = null;
    }
  }

  openSegmentDebugPopup(segment, index, latlng, { pin = false } = {}) {
    if (
      !SHOW_SEGMENT_DEBUG_TOOLTIPS ||
      typeof window === "undefined" ||
      !window.L ||
      !latlng
    ) {
      return;
    }
    try {
      if (this.segmentDebugCloseTimer) {
        clearTimeout(this.segmentDebugCloseTimer);
        this.segmentDebugCloseTimer = null;
      }
      if (pin) {
        this.segmentDebugPopupPinned = true;
      }
      if (!this.segmentDebugPopup) {
        this.segmentDebugPopup = window.L.popup(SEGMENT_DEBUG_POPUP_OPTIONS);
      }
      const content = formatSegmentDebugTooltipHtml(segment, index);
      this.segmentDebugPopup.setLatLng(latlng).setContent(content).openOn(map);
      const debugPayload = buildSegmentDebugConsolePayload(
        segment,
        index,
        latlng,
      );
      console.log("[cycling-effort] Segment debug tooltip data", debugPayload);
      const popupEl = this.segmentDebugPopup.getElement?.();
      if (popupEl) {
        popupEl.style.pointerEvents = "none";
      }
    } catch (error) {
      consoleLog("Segment debug popup open failed", "debug", error);
    }
  }

  closeSegmentDebugPopup() {
    this.segmentDebugPopupPinned = false;
    if (this.segmentDebugCloseTimer) {
      clearTimeout(this.segmentDebugCloseTimer);
      this.segmentDebugCloseTimer = null;
    }
    if (!this.segmentDebugPopup) {
      return;
    }
    try {
      this.segmentDebugPopupPinned = false;
      map.closePopup(this.segmentDebugPopup);
      this.segmentDebugPopup.remove?.();
    } catch (_error) {
      // Ignore stale popup state.
    }
  }

  scheduleCloseSegmentDebugPopup(delayMs = 120) {
    if (this.segmentDebugPopupPinned) {
      return;
    }
    if (this.segmentDebugCloseTimer) {
      clearTimeout(this.segmentDebugCloseTimer);
    }
    this.segmentDebugCloseTimer = setTimeout(() => {
      this.segmentDebugCloseTimer = null;
      if (this.segmentDebugPopupPinned) {
        return;
      }
      this.closeSegmentDebugPopup();
    }, delayMs);
  }

  renderSegments(segments) {
    this.suppressLayerMutation();
    this.resetOverlayLayer();
    if (!this.overlayLayer || typeof window === "undefined" || !window.L) {
      return;
    }
    for (const [index, segment] of segments.entries()) {
      const polyline = window.L.polyline(
        [
          [segment.start.lat, segment.start.lon],
          [segment.end.lat, segment.end.lon],
        ],
        {
          color: segment.color,
          weight: 8,
          opacity: 1,
          interactive: SHOW_SEGMENT_DEBUG_TOOLTIPS,
          className: OVERLAY_CLASS,
          pane: OVERLAY_PANE,
        },
      );
      polyline.__cyclingEffortOverlay = true;
      if (SHOW_SEGMENT_DEBUG_TOOLTIPS && typeof polyline.on === "function") {
        const fallbackLatLng = window.L.latLng(
          (segment.start.lat + segment.end.lat) / 2,
          (segment.start.lon + segment.end.lon) / 2,
        );
        const onHover = (evt) =>
          this.openSegmentDebugPopup(
            segment,
            index,
            evt?.latlng ?? fallbackLatLng,
          );
        const onClick = (evt) => {
          const originalEvent = evt?.originalEvent;
          if (originalEvent && window.L?.DomEvent?.stopPropagation) {
            window.L.DomEvent.stopPropagation(originalEvent);
          }
          this.openSegmentDebugPopup(
            segment,
            index,
            evt?.latlng ?? fallbackLatLng,
            { pin: true },
          );
        };
        polyline.on("mouseover", onHover);
        polyline.on("mousemove", onHover);
        polyline.on("click", onClick);
        polyline.on("mouseout", () => this.scheduleCloseSegmentDebugPopup());
        polyline.on("remove", () => this.closeSegmentDebugPopup());
      }
      this.overlayLayer.addLayer(polyline);
      if (typeof polyline.bringToFront === "function") {
        polyline.bringToFront();
      }
      if (index === 0) {
        const pathStroke = polyline._path?.getAttribute?.("stroke");
        // consoleLog("renderSegments first-layer", "debug", {
        //   requestedColor: segment.color,
        //   effectiveOptionColor: polyline.options?.color,
        //   domStroke: pathStroke ?? null,
        //   weight: polyline.options?.weight,
        //   pane: polyline.options?.pane,
        //   className: polyline.options?.className,
        // });
      }
    }
    // consoleLog("renderSegments completed", "debug", {
    //   segmentCount: segments.length,
    //   uniqueColors: [...new Set(segments.map((segment) => segment.color))],
    // });
  }

  async recompute(reason) {
    if (this.recomputeInProgress) {
      this.recomputeQueued = true;
      return;
    }

    this.recomputeInProgress = true;
    this.weatherSampleDebugCount = 0;
    consoleLog(`Recalculating (${reason})...`);
    patchUiState({
      isComputing: true,
      status: null,
      model: activeModel(),
      forecastTime: formatForecastTime(store.get("timestamp")),
    });

    try {
      const candidates = this.collectTrackCandidates();
      patchUiState({
        candidateCount: candidates.length,
      });

      if (!candidates.length) {
        this.clearOverlay();
        this.restoreOriginalRouteStyle();
        patchUiState({
          hasRoute: false,
          totalEffort: null,
          segmentCount: 0,
          distanceKm: 0,
          ascentM: 0,
          descentM: 0,
          weatherImpact: 0,
          elevationProfile: [],
          routeGraphSegments: [],
          status: STATUS_NO_FILE_LOADED,
        });
        return;
      }

      const chosen = candidates[0];
      consoleLog("Recompute chosen route", "debug", {
        reason,
        model: activeModel(),
        timestamp: store.get("timestamp"),
        routeName: chosen.displayName,
        points: chosen.points.length,
        distanceKm: round(chosen.distanceKm, 2),
        hasElevation: chosen.hasElevation,
      });
      this.dimOriginalRouteLayer(chosen.sourceLayer);
      const computePoints = downsamplePoints(
        chosen.points,
        MAX_POINTS_FOR_COMPUTE,
      );
      const analysis = await this.analyze(computePoints);

      if (!analysis.segments.length) {
        this.clearOverlay();
        this.restoreOriginalRouteStyle();
        consoleLog(
          "Route found, but it is too short for evaluation.",
          "warning",
        );
        patchUiState({
          hasRoute: false,
          totalEffort: null,
          segmentCount: 0,
          elevationProfile: [],
          routeGraphSegments: [],
          status: STATUS_NO_FILE_LOADED,
        });
        return;
      }

      this.renderSegments(analysis.segments);

      consoleLog(
        analysis.elevationPointCount === 0
          ? "Effort overlay is active. Elevation was not found in this track, so ascent/descent remains 0."
          : analysis.windSampleCount === 0
            ? "Effort overlay is active. Wind samples were unavailable for current model/time, so weather impact is 0."
            : "Effort overlay is active.",
      );

      patchUiState({
        hasRoute: true,
        routeName: chosen.displayName,
        totalEffort: Math.round(analysis.totalEffort),
        distanceKm: round(analysis.totalDistanceKm, 2),
        ascentM: Math.round(analysis.totalAscentM),
        descentM: Math.round(analysis.totalDescentM),
        weatherImpact: round(analysis.weatherImpact, 1),
        elevationProfile: analysis.elevationProfile,
        routeGraphSegments: analysis.routeGraphSegments,
        segmentCount: analysis.segments.length,
        model: activeModel(),
        forecastTime: formatForecastTime(store.get("timestamp")),
        computedAt: new Date().toLocaleTimeString(),
        status: null,
      });
    } catch (error) {
      consoleLog("Cycling effort recalculation failed", "error", error);

      this.restoreOriginalRouteStyle();
      consoleLog(
        `Failed to evaluate route: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
        error,
      );
      patchUiState({
        hasRoute: false,
        totalEffort: null,
        segmentCount: 0,
        elevationProfile: [],
        routeGraphSegments: [],
        status: null,
      });
    } finally {
      patchUiState({
        isComputing: false,
      });
      this.recomputeInProgress = false;
      if (this.recomputeQueued) {
        this.recomputeQueued = false;
        this.scheduleRecompute("queued update");
      }
    }
  }
}

export const controller = new CyclingEffortController();
