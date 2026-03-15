import { describe, it, expect } from 'vitest';
import { windComponentFromRoute } from './windMath.js';

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
    // ── null / missing direction ──────────────────────────────────────────────
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

    // ── headwind zone  (|angle| ≤ 45°) ───────────────────────────────────────
    describe('headwind zone (|angleFromRoute| ≤ 45°)', () => {
        it('straight headwind: wind from same direction as travel', () => {
            // riding north (0°), wind from north (0°) → angleFromRoute = 0
            const result = windComponentFromRoute(0, 0);
            expect(result.headwind).toBe(1);
            expect(result.headCrosswind).toBe(0);
            expect(result.tailCrosswind).toBe(0);
            expect(result.tailwind).toBe(0);
            expect(result.angleFromRoute).toBe(0);
        });

        it('headwind when wind is 45° to the right of travel direction', () => {
            // riding east (90°), wind from 135° → delta = 45°
            const result = windComponentFromRoute(135, 90);
            expect(result.headwind).toBe(1);
            expect(result.angleFromRoute).toBe(45);
        });

        it('headwind when wind is 45° to the left of travel direction', () => {
            // riding east (90°), wind from 45° → delta = -45°
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

    // ── head-crosswind zone  (45° < |angle| ≤ 90°) ───────────────────────────
    describe('head-crosswind zone (45° < |angleFromRoute| ≤ 90°)', () => {
        it('pure crosswind from the right (90°)', () => {
            // riding north (0°), wind from east (90°)
            const result = windComponentFromRoute(90, 0);
            expect(result.headwind).toBe(0);
            expect(result.headCrosswind).toBe(1);
            expect(result.tailCrosswind).toBe(0);
            expect(result.tailwind).toBe(0);
            expect(result.angleFromRoute).toBe(90);
        });

        it('pure crosswind from the left (-90°)', () => {
            // riding north (0°), wind from west (270°) → angleFromRoute = -90
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

    // ── tail-crosswind zone  (90° < |angle| ≤ 135°) ──────────────────────────
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

    // ── tailwind zone  (|angle| > 135°) ──────────────────────────────────────
    describe('tailwind zone (|angleFromRoute| > 135°)', () => {
        it('pure tailwind: wind from directly behind', () => {
            // riding north (0°), wind from south (180°) → angleFromRoute = ±180
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

    // ── degree wrapping / normalisation ───────────────────────────────────────
    describe('degree wrapping', () => {
        it('handles wind direction 360 the same as 0', () => {
            const a = windComponentFromRoute(0, 0);
            const b = windComponentFromRoute(360, 0);
            expect(b.headwind).toBe(a.headwind);
            expect(b.angleFromRoute).toBeCloseTo(a.angleFromRoute);
        });

        it('handles negative route bearings correctly', () => {
            // riding at -90° (= 270°, west), wind from north (0°) → left crosswind
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
            // 720° ≡ 0°, same as straight headwind
            const result = windComponentFromRoute(720, 0);
            expect(result.headwind).toBe(1);
            expect(result.angleFromRoute).toBeCloseTo(0);
        });
    });

    // ── result shape ──────────────────────────────────────────────────────────
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
