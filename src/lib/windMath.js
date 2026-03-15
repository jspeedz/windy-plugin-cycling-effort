/**
 * Pure math utilities for wind/route calculations and segment scoring.
 * Kept in a separate module so they can be tested without Windy API dependencies.
 */

const EARTH_RADIUS_METERS = 6371000;

// How heavy does the weather count towards effort relative to elevation change?
export const WEATHER_WEIGHT_PERCENTAGE = 75;
export const WEATHER_WEIGHT_BASELINE = WEATHER_WEIGHT_PERCENTAGE / 100;
export const ELEVATION_WEIGHT_BASELINE = 1 - WEATHER_WEIGHT_BASELINE;

// Core static modifiers for effort behavior.
export const SEGMENT_EFFORT_MODIFIERS = Object.freeze({
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
export const SEGMENT_GRADIENT_FACTORS = Object.freeze({
    uphillDifficultyWeight: 1,
    downhillDifficultyWeight: 0.18,
    downhillReliefWeight: 0.62,
});

// Wind speed/gust/direction influence on segment difficulty.
export const SEGMENT_WIND_FACTORS = Object.freeze({
    headwindDifficultyWeight: 1.25,
    headCrosswindDifficultyWeight: 0.9,
    tailCrosswindReliefWeight: 0.16,
    gustDifficultyWeight: 0.68,
    tailwindReliefWeight: 0.42,
});

// Relative influence of effort intensity, mountain gradient and wind in final score.
export const SEGMENT_FINAL_SCORE_WEIGHTS = Object.freeze({
    effortIntensity: 0.24,
    gradientDifficulty: 0.28,
    windDifficulty: 0.48,
});

// Absolute references to avoid route-relative color skew on flat or mountainous tracks.
export const SEGMENT_NORMALIZATION_REFERENCES = Object.freeze({
    effortPerKm: 7.2,
    uphillSlopeMPerKm: 70,
    downhillSlopeMPerKm: 90,
    headwindSpeed: 7.5,
    headCrosswindSpeed: 6.5,
    tailCrosswindSpeed: 6.5,
    tailwindSpeed: 8,
    gustDeltaSpeed: 4.5,
});

export const SEGMENT_EFFORT_NORMALIZATION_MIX = Object.freeze({
    relative: 0.4,
    absolute: 0.6,
});

export const SEGMENT_COLOR_INTENSITY_MIX = Object.freeze({
    weather: 0.7,
    terrain: 0.3,
});

// How much the weather slider shifts terrain-vs-weather contribution in final score.
export const SEGMENT_WEIGHT_BLEND = Object.freeze({
    weatherSliderInfluence: 0.45,
    minDomainWeight: 0.06,
});

export const SEGMENT_COLOR_TUNING = Object.freeze({
    baseSaturation: 48,
    saturationBoost: 42,
    baseLightness: 60,
    lightnessDropFromIntensity: 22,
    lightnessDropFromDifficulty: 10,
    downhillLightnessLift: 4,
    minLightness: 26,
    maxLightness: 68,
});

/**
 * Returns a finite number or null.
 * @param {*} value
 * @returns {number|null}
 */
export const safeNumber = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

/**
 * Clamps a value between min and max.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Normalizes a value against a reference into [0, 1].
 * @param {number} value
 * @param {number} reference
 * @returns {number}
 */
export const normalizeToUnit = (value, reference) => clamp(value / Math.max(1e-6, reference), 0, 1);

/**
 * Returns the smallest angular distance between two degree values.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
export const angularDistance = (a, b) => {
    const raw = Math.abs(a - b) % 360;
    return raw > 180 ? 360 - raw : raw;
};

/**
 * Normalizes any degree value into the [0, 360) range.
 * @param {number} degrees
 * @returns {number}
 */
export const normalizeDegrees = degrees => {
    const normalized = degrees % 360;
    return normalized < 0 ? normalized + 360 : normalized;
};

/**
 * Computes the great-circle distance between two points in kilometers.
 * @param {{ lat: number, lon: number }} start
 * @param {{ lat: number, lon: number }} end
 * @returns {number}
 */
export const haversineDistanceKm = (start, end) => {
    const lat1 = (start.lat * Math.PI) / 180;
    const lon1 = (start.lon * Math.PI) / 180;
    const lat2 = (end.lat * Math.PI) / 180;
    const lon2 = (end.lon * Math.PI) / 180;

    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (EARTH_RADIUS_METERS * c) / 1000;
};

/**
 * Computes the initial bearing from start to end in degrees [0, 360).
 * @param {{ lat: number, lon: number }} start
 * @param {{ lat: number, lon: number }} end
 * @returns {number}
 */
export const bearingBetween = (start, end) => {
    const lat1 = (start.lat * Math.PI) / 180;
    const lon1 = (start.lon * Math.PI) / 180;
    const lat2 = (end.lat * Math.PI) / 180;
    const lon2 = (end.lon * Math.PI) / 180;
    const dLon = lon2 - lon1;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return normalizeDegrees((Math.atan2(y, x) * 180) / Math.PI);
};

/**
 * Returns the geographic midpoint between two points.
 * @param {{ lat: number, lon: number }} start
 * @param {{ lat: number, lon: number }} end
 * @returns {{ lat: number, lon: number }}
 */
export const midpointBetween = (start, end) => ({
    lat: (start.lat + end.lat) / 2,
    lon: (start.lon + end.lon) / 2,
});

/**
 * Rounds a number to the specified number of decimal places.
 * @param {number} value
 * @param {number} [decimals=1]
 * @returns {number}
 */
export const round = (value, decimals = 1) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
};

/**
 * Formats a number with explicit sign prefix.
 * @param {*} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export const signed = (value, decimals = 1) => {
    const numeric = safeNumber(value) ?? 0;
    const rounded = round(numeric, decimals);
    return `${rounded >= 0 ? '+' : ''}${rounded}`;
};

/**
 * Formats a [0, 1] value as a percentage string.
 * @param {number} value
 * @returns {string}
 */
export const toPercent = value => `${Math.round(clamp(value, 0, 1) * 100)}%`;

/**
 * Selects evenly-spaced sample indices from a range [0, length).
 * @param {number} length
 * @param {number} maxSamples
 * @returns {number[]}
 */
export const sampledIndices = (length, maxSamples) => {
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

/**
 * Decomposes wind into headwind/crosswind/tailwind buckets relative to the
 * direction of travel (routeBearing).
 *
 * Angle buckets (absolute angle from straight-ahead):
 *   0–45°   → headwind
 *   45–90°  → head-crosswind
 *   90–135° → tail-crosswind
 *   135–180°→ tailwind
 *
 * @param {number|null} windDirectionFrom  Meteorological "from" direction (degrees)
 * @param {number}      routeBearing       Direction of travel (degrees)
 * @returns {{ headwind: number, headCrosswind: number, tailCrosswind: number, tailwind: number, angleFromRoute: number }}
 */
export const windComponentFromRoute = (windDirectionFrom, routeBearing) => {
    if (windDirectionFrom == null) {
        return {
            headwind: 0,
            headCrosswind: 0,
            tailCrosswind: 0,
            tailwind: 0,
            angleFromRoute: 0,
        };
    }

    const rawDelta = normalizeDegrees(windDirectionFrom - routeBearing);
    const angleFromRoute = rawDelta > 180 ? rawDelta - 360 : rawDelta;
    const absoluteAngle = Math.abs(angleFromRoute);

    if (absoluteAngle <= 45) {
        return { headwind: 1, headCrosswind: 0, tailCrosswind: 0, tailwind: 0, angleFromRoute };
    }
    if (absoluteAngle <= 90) {
        return { headwind: 0, headCrosswind: 1, tailCrosswind: 0, tailwind: 0, angleFromRoute };
    }
    if (absoluteAngle <= 135) {
        return { headwind: 0, headCrosswind: 0, tailCrosswind: 1, tailwind: 0, angleFromRoute };
    }
    return { headwind: 0, headCrosswind: 0, tailCrosswind: 0, tailwind: 1, angleFromRoute };
};

/**
 * Computes blended domain weights for effort/terrain/weather based on the weather slider.
 * @param {number} [weatherWeightPercent]
 * @returns {{ effort: number, terrain: number, weather: number }}
 */
export const blendedDomainWeights = (weatherWeightPercent = WEATHER_WEIGHT_PERCENTAGE) => {
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

/**
 * Computes a composite difficulty score from normalized effort, wind, and gradient values.
 * @param {{ normalizedEffort?: number, windDifficultyNorm?: number, gradientDifficultyNorm?: number, weatherWeightPercent?: number }} params
 * @returns {number}
 */
export const compositeSegmentDifficulty = ({
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

/**
 * Converts a difficulty/intensity pair into an HSL color string.
 * @param {number} difficultyNorm
 * @param {number} [intensityNorm=0.5]
 * @param {number} [downhillReliefNorm=0]
 * @returns {string}
 */
export const colorForSegmentDifficulty = (
    difficultyNorm,
    intensityNorm = 0.5,
    downhillReliefNorm = 0,
) => {
    const difficulty = clamp(difficultyNorm, 0, 1);
    const intensity = clamp(intensityNorm, 0, 1);
    const downhillLift = clamp(downhillReliefNorm, 0, 1);
    const hue = 120 * (1 - difficulty);
    const saturation =
        SEGMENT_COLOR_TUNING.baseSaturation + intensity * SEGMENT_COLOR_TUNING.saturationBoost;
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

/**
 * Generates an array of 11 HSL color stops for the effort legend.
 * @returns {string[]}
 */
export const effortLegendStops = () => {
    return Array.from({ length: 11 }, (_unused, index) => {
        const t = index / 10;
        const intensityNorm = clamp(0.15 + Math.abs(t - 0.5) * 1.7, 0, 1);
        return colorForSegmentDifficulty(t, intensityNorm, 0);
    });
};

/**
 * Generates a CSS linear-gradient string for the effort legend.
 * @returns {string}
 */
export const effortLegendGradient = () => {
    const stops = effortLegendStops();
    return `linear-gradient(to right, ${stops.join(', ')})`;
};
