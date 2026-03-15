import { describe, it, expect } from 'vitest';
import {
    safeNumber,
    clamp,
    normalizeToUnit,
    angularDistance,
    normalizeDegrees,
    haversineDistanceKm,
    bearingBetween,
    midpointBetween,
    round,
    signed,
    toPercent,
    sampledIndices,
    windComponentFromRoute,
    blendedDomainWeights,
    compositeSegmentDifficulty,
    colorForSegmentDifficulty,
    effortLegendStops,
    effortLegendGradient,
    WEATHER_WEIGHT_PERCENTAGE,
    WEATHER_WEIGHT_BASELINE,
    ELEVATION_WEIGHT_BASELINE,
    SEGMENT_EFFORT_MODIFIERS,
    SEGMENT_GRADIENT_FACTORS,
    SEGMENT_WIND_FACTORS,
    SEGMENT_FINAL_SCORE_WEIGHTS,
    SEGMENT_NORMALIZATION_REFERENCES,
    SEGMENT_EFFORT_NORMALIZATION_MIX,
    SEGMENT_COLOR_INTENSITY_MIX,
    SEGMENT_WEIGHT_BLEND,
    SEGMENT_COLOR_TUNING,
} from './windMath.js';

// ── safeNumber ───────────────────────────────────────────────────────────────

describe('safeNumber', () => {
    it('returns a finite number unchanged', () => {
        expect(safeNumber(42)).toBe(42);
        expect(safeNumber(0)).toBe(0);
        expect(safeNumber(-3.14)).toBe(-3.14);
    });

    it('converts numeric strings', () => {
        expect(safeNumber('123')).toBe(123);
        expect(safeNumber('0')).toBe(0);
        expect(safeNumber('-5.5')).toBe(-5.5);
    });

    it('returns null for non-finite values', () => {
        expect(safeNumber(NaN)).toBeNull();
        expect(safeNumber(Infinity)).toBeNull();
        expect(safeNumber(-Infinity)).toBeNull();
    });

    it('returns null for non-numeric inputs', () => {
        expect(safeNumber(undefined)).toBeNull();
        expect(safeNumber('abc')).toBeNull();
        expect(safeNumber({})).toBeNull();
    });

    it('converts null and empty array to 0', () => {
        // Number(null) === 0, Number([]) === 0
        expect(safeNumber(null)).toBe(0);
        expect(safeNumber([])).toBe(0);
    });

    it('converts booleans to numbers', () => {
        expect(safeNumber(true)).toBe(1);
        expect(safeNumber(false)).toBe(0);
    });
});

// ── clamp ────────────────────────────────────────────────────────────────────

describe('clamp', () => {
    it('returns value when within range', () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });

    it('clamps to min when below', () => {
        expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('clamps to max when above', () => {
        expect(clamp(15, 0, 10)).toBe(10);
    });

    it('returns min when value equals min', () => {
        expect(clamp(0, 0, 10)).toBe(0);
    });

    it('returns max when value equals max', () => {
        expect(clamp(10, 0, 10)).toBe(10);
    });

    it('works with negative ranges', () => {
        expect(clamp(-3, -5, -1)).toBe(-3);
        expect(clamp(-10, -5, -1)).toBe(-5);
        expect(clamp(0, -5, -1)).toBe(-1);
    });
});

// ── normalizeToUnit ──────────────────────────────────────────────────────────

describe('normalizeToUnit', () => {
    it('returns 0 for value 0', () => {
        expect(normalizeToUnit(0, 10)).toBe(0);
    });

    it('returns 1 when value equals reference', () => {
        expect(normalizeToUnit(10, 10)).toBe(1);
    });

    it('returns 0.5 at half reference', () => {
        expect(normalizeToUnit(5, 10)).toBe(0.5);
    });

    it('clamps to 1 when value exceeds reference', () => {
        expect(normalizeToUnit(20, 10)).toBe(1);
    });

    it('clamps to 0 for negative values', () => {
        expect(normalizeToUnit(-5, 10)).toBe(0);
    });

    it('handles near-zero reference without dividing by zero', () => {
        const result = normalizeToUnit(1, 0);
        expect(result).toBe(1);
    });
});

// ── angularDistance ───────────────────────────────────────────────────────────

describe('angularDistance', () => {
    it('returns 0 for identical angles', () => {
        expect(angularDistance(90, 90)).toBe(0);
    });

    it('returns the shorter arc', () => {
        expect(angularDistance(10, 350)).toBe(20);
        expect(angularDistance(350, 10)).toBe(20);
    });

    it('returns 180 for opposite directions', () => {
        expect(angularDistance(0, 180)).toBe(180);
    });

    it('works with values beyond 360', () => {
        expect(angularDistance(370, 10)).toBe(0);
    });

    it('handles negative inputs', () => {
        expect(angularDistance(-10, 10)).toBe(20);
    });
});

// ── normalizeDegrees ─────────────────────────────────────────────────────────

describe('normalizeDegrees', () => {
    it('keeps values in [0, 360) unchanged', () => {
        expect(normalizeDegrees(0)).toBe(0);
        expect(normalizeDegrees(90)).toBe(90);
        expect(normalizeDegrees(359)).toBe(359);
    });

    it('wraps 360 to 0', () => {
        expect(normalizeDegrees(360)).toBe(0);
    });

    it('wraps values above 360', () => {
        expect(normalizeDegrees(450)).toBe(90);
        expect(normalizeDegrees(720)).toBe(0);
    });

    it('wraps negative values', () => {
        expect(normalizeDegrees(-90)).toBe(270);
        expect(normalizeDegrees(-360)).toBe(-0); // -360 % 360 === -0
        expect(normalizeDegrees(-1)).toBe(359);
    });
});

// ── haversineDistanceKm ──────────────────────────────────────────────────────

describe('haversineDistanceKm', () => {
    it('returns 0 for same point', () => {
        const p = { lat: 52.52, lon: 13.405 };
        expect(haversineDistanceKm(p, p)).toBe(0);
    });

    it('computes a known distance (London to Paris ~343 km)', () => {
        const london = { lat: 51.5074, lon: -0.1278 };
        const paris = { lat: 48.8566, lon: 2.3522 };
        const dist = haversineDistanceKm(london, paris);
        expect(dist).toBeGreaterThan(330);
        expect(dist).toBeLessThan(360);
    });

    it('computes short distances accurately', () => {
        // ~111 km per degree of latitude at equator
        const a = { lat: 0, lon: 0 };
        const b = { lat: 1, lon: 0 };
        const dist = haversineDistanceKm(a, b);
        expect(dist).toBeGreaterThan(110);
        expect(dist).toBeLessThan(112);
    });

    it('is symmetric', () => {
        const a = { lat: 40, lon: -74 };
        const b = { lat: 34, lon: -118 };
        expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a));
    });
});

// ── bearingBetween ───────────────────────────────────────────────────────────

describe('bearingBetween', () => {
    it('returns ~0 (north) for due-north travel', () => {
        const start = { lat: 0, lon: 0 };
        const end = { lat: 1, lon: 0 };
        expect(bearingBetween(start, end)).toBeCloseTo(0, 0);
    });

    it('returns ~90 for due-east travel', () => {
        const start = { lat: 0, lon: 0 };
        const end = { lat: 0, lon: 1 };
        expect(bearingBetween(start, end)).toBeCloseTo(90, 0);
    });

    it('returns ~180 for due-south travel', () => {
        const start = { lat: 1, lon: 0 };
        const end = { lat: 0, lon: 0 };
        expect(bearingBetween(start, end)).toBeCloseTo(180, 0);
    });

    it('returns ~270 for due-west travel', () => {
        const start = { lat: 0, lon: 1 };
        const end = { lat: 0, lon: 0 };
        expect(bearingBetween(start, end)).toBeCloseTo(270, 0);
    });

    it('always returns a value in [0, 360)', () => {
        const cases = [
            [{ lat: 10, lon: 20 }, { lat: 30, lon: 40 }],
            [{ lat: -30, lon: 150 }, { lat: 60, lon: -120 }],
        ];
        for (const [s, e] of cases) {
            const b = bearingBetween(s, e);
            expect(b).toBeGreaterThanOrEqual(0);
            expect(b).toBeLessThan(360);
        }
    });
});

// ── midpointBetween ──────────────────────────────────────────────────────────

describe('midpointBetween', () => {
    it('returns the average of lat and lon', () => {
        const result = midpointBetween({ lat: 0, lon: 0 }, { lat: 10, lon: 20 });
        expect(result.lat).toBe(5);
        expect(result.lon).toBe(10);
    });

    it('returns same point when both are identical', () => {
        const p = { lat: 52.52, lon: 13.405 };
        const result = midpointBetween(p, p);
        expect(result.lat).toBe(p.lat);
        expect(result.lon).toBe(p.lon);
    });

    it('works with negative coordinates', () => {
        const result = midpointBetween({ lat: -10, lon: -20 }, { lat: 10, lon: 20 });
        expect(result.lat).toBe(0);
        expect(result.lon).toBe(0);
    });
});

// ── round ────────────────────────────────────────────────────────────────────

describe('round', () => {
    it('rounds to 1 decimal by default', () => {
        expect(round(3.14)).toBe(3.1);
        expect(round(3.15)).toBe(3.2);
        expect(round(3.149)).toBe(3.1);
    });

    it('rounds to specified decimals', () => {
        expect(round(3.14159, 2)).toBe(3.14);
        expect(round(3.14159, 4)).toBe(3.1416);
        expect(round(3.14159, 0)).toBe(3);
    });

    it('handles negative values', () => {
        // Math.round(-27.5) === -27 (rounds toward +Infinity)
        expect(round(-2.75, 1)).toBe(-2.7);
        expect(round(-2.76, 1)).toBe(-2.8);
    });

    it('handles zero', () => {
        expect(round(0, 3)).toBe(0);
    });
});

// ── signed ───────────────────────────────────────────────────────────────────

describe('signed', () => {
    it('prepends + for positive values', () => {
        expect(signed(5)).toBe('+5');
        expect(signed(3.14)).toBe('+3.1');
    });

    it('prepends + for zero', () => {
        expect(signed(0)).toBe('+0');
    });

    it('keeps - for negative values', () => {
        expect(signed(-5)).toBe('-5');
        expect(signed(-3.14)).toBe('-3.1');
    });

    it('respects decimal parameter', () => {
        expect(signed(3.14159, 3)).toBe('+3.142');
        expect(signed(-1.5, 0)).toBe('-1'); // Math.round(-1.5) === -1
    });

    it('treats non-numeric input as 0', () => {
        expect(signed(null)).toBe('+0');
        expect(signed(undefined)).toBe('+0');
        expect(signed('abc')).toBe('+0');
    });

    it('converts numeric strings', () => {
        expect(signed('42.7', 0)).toBe('+43');
    });
});

// ── toPercent ────────────────────────────────────────────────────────────────

describe('toPercent', () => {
    it('converts 0 to "0%"', () => {
        expect(toPercent(0)).toBe('0%');
    });

    it('converts 1 to "100%"', () => {
        expect(toPercent(1)).toBe('100%');
    });

    it('converts 0.5 to "50%"', () => {
        expect(toPercent(0.5)).toBe('50%');
    });

    it('clamps values above 1', () => {
        expect(toPercent(1.5)).toBe('100%');
    });

    it('clamps values below 0', () => {
        expect(toPercent(-0.5)).toBe('0%');
    });

    it('rounds to nearest integer percent', () => {
        expect(toPercent(0.333)).toBe('33%');
        expect(toPercent(0.666)).toBe('67%');
    });
});

// ── sampledIndices ───────────────────────────────────────────────────────────

describe('sampledIndices', () => {
    it('returns empty array for length 0', () => {
        expect(sampledIndices(0, 5)).toEqual([]);
    });

    it('returns empty array for negative length', () => {
        expect(sampledIndices(-1, 5)).toEqual([]);
    });

    it('returns all indices when length <= maxSamples', () => {
        expect(sampledIndices(3, 5)).toEqual([0, 1, 2]);
        expect(sampledIndices(5, 5)).toEqual([0, 1, 2, 3, 4]);
    });

    it('always includes first and last index', () => {
        const result = sampledIndices(100, 5);
        expect(result[0]).toBe(0);
        expect(result[result.length - 1]).toBe(99);
    });

    it('returns sorted indices', () => {
        const result = sampledIndices(100, 10);
        for (let i = 1; i < result.length; i++) {
            expect(result[i]).toBeGreaterThan(result[i - 1]);
        }
    });

    it('returns no more than maxSamples indices', () => {
        const result = sampledIndices(1000, 10);
        expect(result.length).toBeLessThanOrEqual(10);
    });

    it('returns no duplicates', () => {
        const result = sampledIndices(100, 10);
        expect(new Set(result).size).toBe(result.length);
    });

    it('returns [0] for length 1', () => {
        expect(sampledIndices(1, 5)).toEqual([0]);
    });
});

// ── windComponentFromRoute ───────────────────────────────────────────────────

/**
 * Angle convention recap:
 *   windDirectionFrom = meteorological "from" direction (where wind comes FROM)
 *   routeBearing      = direction of travel
 *
 * angleFromRoute = 0   → wind directly from ahead  (headwind)
 * angleFromRoute = 180 → wind directly from behind (tailwind)
 * angleFromRoute = +90 → wind from the right side
 * angleFromRoute = -90 → wind from the left side
 *
 * Bucket boundaries:
 *   |angleFromRoute| ≤ 45  → headwind      (flag = 1)
 *   |angleFromRoute| ≤ 90  → headCrosswind (flag = 1)
 *   |angleFromRoute| ≤ 135 → tailCrosswind (flag = 1)
 *   otherwise              → tailwind      (flag = 1)
 */

describe('windComponentFromRoute', () => {
    // ── null / missing direction ──────────────────────────────────────────
    describe('null windDirectionFrom', () => {
        it('returns all-zero components when windDirectionFrom is null', () => {
            expect(windComponentFromRoute(null, 0)).toEqual({
                headwind: 0,
                headCrosswind: 0,
                tailCrosswind: 0,
                tailwind: 0,
                angleFromRoute: 0,
            });
        });

        it('returns all-zero components when windDirectionFrom is undefined', () => {
            expect(windComponentFromRoute(undefined, 90)).toEqual({
                headwind: 0,
                headCrosswind: 0,
                tailCrosswind: 0,
                tailwind: 0,
                angleFromRoute: 0,
            });
        });
    });

    // ── headwind zone  (|angle| ≤ 45°) ──────────────────────────────────
    describe('headwind zone (|angleFromRoute| ≤ 45°)', () => {
        it('straight headwind: wind from same direction as travel', () => {
            const result = windComponentFromRoute(0, 0);
            expect(result.headwind).toBe(1);
            expect(result.headCrosswind).toBe(0);
            expect(result.tailCrosswind).toBe(0);
            expect(result.tailwind).toBe(0);
            expect(result.angleFromRoute).toBe(0);
        });

        it('headwind when wind is 45° to the right of travel direction', () => {
            const result = windComponentFromRoute(135, 90);
            expect(result.headwind).toBe(1);
            expect(result.angleFromRoute).toBe(45);
        });

        it('headwind when wind is 45° to the left of travel direction', () => {
            const result = windComponentFromRoute(45, 90);
            expect(result.headwind).toBe(1);
            expect(result.angleFromRoute).toBe(-45);
        });

        it('headwind at 20° offset', () => {
            const result = windComponentFromRoute(20, 0);
            expect(result.headwind).toBe(1);
            expect(result.angleFromRoute).toBe(20);
        });
    });

    // ── head-crosswind zone  (45° < |angle| ≤ 90°) ─────────────────────
    describe('head-crosswind zone (45° < |angleFromRoute| ≤ 90°)', () => {
        it('pure crosswind from the right (90°)', () => {
            const result = windComponentFromRoute(90, 0);
            expect(result.headwind).toBe(0);
            expect(result.headCrosswind).toBe(1);
            expect(result.tailCrosswind).toBe(0);
            expect(result.tailwind).toBe(0);
            expect(result.angleFromRoute).toBe(90);
        });

        it('pure crosswind from the left (-90°)', () => {
            const result = windComponentFromRoute(270, 0);
            expect(result.headCrosswind).toBe(1);
            expect(result.angleFromRoute).toBe(-90);
        });

        it('head-crosswind at 60° offset', () => {
            const result = windComponentFromRoute(60, 0);
            expect(result.headCrosswind).toBe(1);
            expect(result.angleFromRoute).toBe(60);
        });

        it('boundary just above 45° is head-crosswind, not headwind', () => {
            const result = windComponentFromRoute(46, 0);
            expect(result.headCrosswind).toBe(1);
            expect(result.headwind).toBe(0);
        });
    });

    // ── tail-crosswind zone  (90° < |angle| ≤ 135°) ────────────────────
    describe('tail-crosswind zone (90° < |angleFromRoute| ≤ 135°)', () => {
        it('tail-crosswind at 120° from the right', () => {
            const result = windComponentFromRoute(120, 0);
            expect(result.tailCrosswind).toBe(1);
            expect(result.headwind).toBe(0);
            expect(result.headCrosswind).toBe(0);
            expect(result.tailwind).toBe(0);
            expect(result.angleFromRoute).toBe(120);
        });

        it('tail-crosswind at 120° from the left (-120°)', () => {
            const result = windComponentFromRoute(240, 0);
            expect(result.tailCrosswind).toBe(1);
            expect(result.angleFromRoute).toBe(-120);
        });

        it('boundary at exactly 135° is still tail-crosswind', () => {
            const result = windComponentFromRoute(135, 0);
            expect(result.tailCrosswind).toBe(1);
        });

        it('boundary just above 90° is tail-crosswind, not head-crosswind', () => {
            const result = windComponentFromRoute(91, 0);
            expect(result.tailCrosswind).toBe(1);
            expect(result.headCrosswind).toBe(0);
        });
    });

    // ── tailwind zone  (|angle| > 135°) ─────────────────────────────────
    describe('tailwind zone (|angleFromRoute| > 135°)', () => {
        it('pure tailwind: wind from directly behind', () => {
            const result = windComponentFromRoute(180, 0);
            expect(result.tailwind).toBe(1);
            expect(result.headwind).toBe(0);
            expect(result.headCrosswind).toBe(0);
            expect(result.tailCrosswind).toBe(0);
        });

        it('tailwind at 150° offset', () => {
            const result = windComponentFromRoute(150, 0);
            expect(result.tailwind).toBe(1);
            expect(result.angleFromRoute).toBe(150);
        });

        it('tailwind at -150° offset', () => {
            const result = windComponentFromRoute(210, 0);
            expect(result.tailwind).toBe(1);
            expect(result.angleFromRoute).toBe(-150);
        });

        it('boundary just above 135° is tailwind, not tail-crosswind', () => {
            const result = windComponentFromRoute(136, 0);
            expect(result.tailwind).toBe(1);
            expect(result.tailCrosswind).toBe(0);
        });
    });

    // ── degree wrapping / normalisation ─────────────────────────────────
    describe('degree wrapping', () => {
        it('handles wind direction 360 the same as 0', () => {
            const a = windComponentFromRoute(0, 0);
            const b = windComponentFromRoute(360, 0);
            expect(b.headwind).toBe(a.headwind);
            expect(b.angleFromRoute).toBeCloseTo(a.angleFromRoute);
        });

        it('handles negative route bearings correctly', () => {
            const result = windComponentFromRoute(0, 270);
            expect(result.headCrosswind).toBe(1);
        });

        it('handles route bearing > 360 correctly', () => {
            const a = windComponentFromRoute(90, 0);
            const b = windComponentFromRoute(90, 360);
            expect(b.headCrosswind).toBe(a.headCrosswind);
            expect(b.angleFromRoute).toBeCloseTo(a.angleFromRoute);
        });

        it('large wind direction values are normalized correctly', () => {
            const result = windComponentFromRoute(720, 0);
            expect(result.headwind).toBe(1);
            expect(result.angleFromRoute).toBeCloseTo(0);
        });
    });

    // ── result shape ────────────────────────────────────────────────────
    describe('result shape', () => {
        it('always returns exactly the five expected keys', () => {
            const result = windComponentFromRoute(45, 90);
            expect(Object.keys(result).sort()).toEqual(
                ['angleFromRoute', 'headCrosswind', 'headwind', 'tailCrosswind', 'tailwind'].sort(),
            );
        });

        it('exactly one bucket flag is 1 when wind direction is provided', () => {
            const cases = [0, 45, 46, 90, 91, 135, 136, 180];
            for (const wind of cases) {
                const r = windComponentFromRoute(wind, 0);
                const total = r.headwind + r.headCrosswind + r.tailCrosswind + r.tailwind;
                expect(total, `wind=${wind}`).toBe(1);
            }
        });
    });
});

// ── blendedDomainWeights ─────────────────────────────────────────────────────

describe('blendedDomainWeights', () => {
    it('returns weights that sum to 1', () => {
        const w = blendedDomainWeights();
        expect(w.effort + w.terrain + w.weather).toBeCloseTo(1, 10);
    });

    it('default uses WEATHER_WEIGHT_PERCENTAGE (75)', () => {
        const w = blendedDomainWeights(WEATHER_WEIGHT_PERCENTAGE);
        const wDefault = blendedDomainWeights();
        expect(w.effort).toBeCloseTo(wDefault.effort);
        expect(w.terrain).toBeCloseTo(wDefault.terrain);
        expect(w.weather).toBeCloseTo(wDefault.weather);
    });

    it('weights always sum to 1 across slider range', () => {
        for (let pct = 0; pct <= 100; pct += 10) {
            const w = blendedDomainWeights(pct);
            expect(w.effort + w.terrain + w.weather).toBeCloseTo(1, 10);
        }
    });

    it('increasing weather weight increases weather contribution', () => {
        const low = blendedDomainWeights(20);
        const high = blendedDomainWeights(90);
        expect(high.weather).toBeGreaterThan(low.weather);
    });

    it('increasing weather weight decreases terrain contribution', () => {
        const low = blendedDomainWeights(20);
        const high = blendedDomainWeights(90);
        expect(high.terrain).toBeLessThan(low.terrain);
    });

    it('all weights are positive', () => {
        for (let pct = 0; pct <= 100; pct += 10) {
            const w = blendedDomainWeights(pct);
            expect(w.effort).toBeGreaterThan(0);
            expect(w.terrain).toBeGreaterThan(0);
            expect(w.weather).toBeGreaterThan(0);
        }
    });
});

// ── compositeSegmentDifficulty ───────────────────────────────────────────────

describe('compositeSegmentDifficulty', () => {
    it('returns 0 when all inputs are 0', () => {
        expect(
            compositeSegmentDifficulty({
                normalizedEffort: 0,
                windDifficultyNorm: 0,
                gradientDifficultyNorm: 0,
            }),
        ).toBe(0);
    });

    it('returns 1 when all inputs are 1', () => {
        expect(
            compositeSegmentDifficulty({
                normalizedEffort: 1,
                windDifficultyNorm: 1,
                gradientDifficultyNorm: 1,
            }),
        ).toBeCloseTo(1, 10);
    });

    it('returns value in [0, 1]', () => {
        const result = compositeSegmentDifficulty({
            normalizedEffort: 0.5,
            windDifficultyNorm: 0.5,
            gradientDifficultyNorm: 0.5,
        });
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
    });

    it('uses defaults when called with empty object', () => {
        const result = compositeSegmentDifficulty({});
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThanOrEqual(1);
    });

    it('clamps out-of-range inputs', () => {
        const result = compositeSegmentDifficulty({
            normalizedEffort: 2,
            windDifficultyNorm: -1,
            gradientDifficultyNorm: 5,
        });
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
    });

    it('higher wind difficulty increases composite score', () => {
        const low = compositeSegmentDifficulty({
            normalizedEffort: 0.5,
            windDifficultyNorm: 0.2,
            gradientDifficultyNorm: 0.5,
        });
        const high = compositeSegmentDifficulty({
            normalizedEffort: 0.5,
            windDifficultyNorm: 0.8,
            gradientDifficultyNorm: 0.5,
        });
        expect(high).toBeGreaterThan(low);
    });

    it('respects weatherWeightPercent parameter', () => {
        const lowWeather = compositeSegmentDifficulty({
            normalizedEffort: 0.3,
            windDifficultyNorm: 0.9,
            gradientDifficultyNorm: 0.3,
            weatherWeightPercent: 10,
        });
        const highWeather = compositeSegmentDifficulty({
            normalizedEffort: 0.3,
            windDifficultyNorm: 0.9,
            gradientDifficultyNorm: 0.3,
            weatherWeightPercent: 100,
        });
        expect(highWeather).toBeGreaterThan(lowWeather);
    });
});

// ── colorForSegmentDifficulty ────────────────────────────────────────────────

describe('colorForSegmentDifficulty', () => {
    it('returns an HSL string', () => {
        const color = colorForSegmentDifficulty(0.5);
        expect(color).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
    });

    it('difficulty 0 produces green (hue ~120)', () => {
        const color = colorForSegmentDifficulty(0, 0.5);
        expect(color).toMatch(/^hsl\(120,/);
    });

    it('difficulty 1 produces red (hue ~0)', () => {
        const color = colorForSegmentDifficulty(1, 0.5);
        expect(color).toMatch(/^hsl\(0,/);
    });

    it('difficulty 0.5 produces yellow (hue ~60)', () => {
        const color = colorForSegmentDifficulty(0.5, 0.5);
        expect(color).toMatch(/^hsl\(60,/);
    });

    it('clamps out-of-range difficulty', () => {
        const tooLow = colorForSegmentDifficulty(-0.5, 0.5);
        const zero = colorForSegmentDifficulty(0, 0.5);
        expect(tooLow).toBe(zero);

        const tooHigh = colorForSegmentDifficulty(1.5, 0.5);
        const one = colorForSegmentDifficulty(1, 0.5);
        expect(tooHigh).toBe(one);
    });

    it('higher intensity increases saturation', () => {
        const low = colorForSegmentDifficulty(0.5, 0);
        const high = colorForSegmentDifficulty(0.5, 1);
        const satLow = parseInt(low.match(/hsl\(\d+, (\d+)%/)[1]);
        const satHigh = parseInt(high.match(/hsl\(\d+, (\d+)%/)[1]);
        expect(satHigh).toBeGreaterThan(satLow);
    });

    it('downhill relief increases lightness', () => {
        const noRelief = colorForSegmentDifficulty(0.5, 0.5, 0);
        const withRelief = colorForSegmentDifficulty(0.5, 0.5, 1);
        const lightNoRelief = parseInt(noRelief.match(/(\d+)%\)$/)[1]);
        const lightWithRelief = parseInt(withRelief.match(/(\d+)%\)$/)[1]);
        expect(lightWithRelief).toBeGreaterThanOrEqual(lightNoRelief);
    });
});

// ── effortLegendStops ────────────────────────────────────────────────────────

describe('effortLegendStops', () => {
    it('returns exactly 11 stops', () => {
        expect(effortLegendStops()).toHaveLength(11);
    });

    it('all stops are HSL strings', () => {
        const stops = effortLegendStops();
        for (const stop of stops) {
            expect(stop).toMatch(/^hsl\(/);
        }
    });

    it('first stop is greenish (hue 120)', () => {
        const stops = effortLegendStops();
        expect(stops[0]).toMatch(/^hsl\(120,/);
    });

    it('last stop is reddish (hue 0)', () => {
        const stops = effortLegendStops();
        expect(stops[10]).toMatch(/^hsl\(0,/);
    });

    it('accepts a custom weather weight', () => {
        const defaultStops = effortLegendStops();
        const customStops = effortLegendStops(50);
        expect(customStops).toHaveLength(11);
        // Stops are based on colorForSegmentDifficulty which doesn't use weight,
        // so they should be the same
        expect(customStops).toEqual(defaultStops);
    });
});

// ── effortLegendGradient ─────────────────────────────────────────────────────

describe('effortLegendGradient', () => {
    it('returns a CSS linear-gradient string', () => {
        const gradient = effortLegendGradient();
        expect(gradient).toMatch(/^linear-gradient\(to right, hsl\(/);
    });

    it('contains 11 color stops separated by commas', () => {
        const gradient = effortLegendGradient();
        const hslMatches = gradient.match(/hsl\(/g);
        expect(hslMatches).toHaveLength(11);
    });

    it('accepts a custom weather weight', () => {
        const gradient = effortLegendGradient(50);
        expect(gradient).toMatch(/^linear-gradient\(/);
    });
});

// ── exported constants ───────────────────────────────────────────────────────

describe('exported constants', () => {
    it('WEATHER_WEIGHT_PERCENTAGE is 75', () => {
        expect(WEATHER_WEIGHT_PERCENTAGE).toBe(75);
    });

    it('WEATHER_WEIGHT_BASELINE is 0.75', () => {
        expect(WEATHER_WEIGHT_BASELINE).toBe(0.75);
    });

    it('ELEVATION_WEIGHT_BASELINE is 0.25', () => {
        expect(ELEVATION_WEIGHT_BASELINE).toBe(0.25);
    });

    it('WEATHER_WEIGHT_BASELINE + ELEVATION_WEIGHT_BASELINE = 1', () => {
        expect(WEATHER_WEIGHT_BASELINE + ELEVATION_WEIGHT_BASELINE).toBe(1);
    });

    it('SEGMENT_EFFORT_MODIFIERS is frozen', () => {
        expect(Object.isFrozen(SEGMENT_EFFORT_MODIFIERS)).toBe(true);
    });

    it('SEGMENT_GRADIENT_FACTORS is frozen', () => {
        expect(Object.isFrozen(SEGMENT_GRADIENT_FACTORS)).toBe(true);
    });

    it('SEGMENT_WIND_FACTORS is frozen', () => {
        expect(Object.isFrozen(SEGMENT_WIND_FACTORS)).toBe(true);
    });

    it('SEGMENT_FINAL_SCORE_WEIGHTS is frozen', () => {
        expect(Object.isFrozen(SEGMENT_FINAL_SCORE_WEIGHTS)).toBe(true);
    });

    it('SEGMENT_NORMALIZATION_REFERENCES is frozen', () => {
        expect(Object.isFrozen(SEGMENT_NORMALIZATION_REFERENCES)).toBe(true);
    });

    it('SEGMENT_EFFORT_NORMALIZATION_MIX is frozen', () => {
        expect(Object.isFrozen(SEGMENT_EFFORT_NORMALIZATION_MIX)).toBe(true);
    });

    it('SEGMENT_COLOR_INTENSITY_MIX is frozen', () => {
        expect(Object.isFrozen(SEGMENT_COLOR_INTENSITY_MIX)).toBe(true);
    });

    it('SEGMENT_WEIGHT_BLEND is frozen', () => {
        expect(Object.isFrozen(SEGMENT_WEIGHT_BLEND)).toBe(true);
    });

    it('SEGMENT_COLOR_TUNING is frozen', () => {
        expect(Object.isFrozen(SEGMENT_COLOR_TUNING)).toBe(true);
    });
});
