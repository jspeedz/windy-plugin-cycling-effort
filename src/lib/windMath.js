/**
 * Pure math utilities for wind/route calculations.
 * Kept in a separate module so they can be tested without Windy API dependencies.
 */

/**
 * Normalizes any degree value into the [0, 360) range.
 * @param {number} degrees
 * @returns {number}
 */
export const normalizeDegrees = (degrees) => {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
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
