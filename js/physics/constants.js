/**
 * Physical constants and unit conversions.
 *
 * Every value here is a published standard, not a fitted or tuned number.
 * Sources are given inline so each one can be checked independently.
 * See maths.html for full citations.
 */

// --- Lengths -----------------------------------------------------------------

/** Astronomical unit, km. Exact by definition (IAU 2012 Resolution B2). */
export const AU_KM = 149597870.700;

/** Nominal solar radius, km (IAU 2015 Resolution B3: R_sun = 6.957e8 m). */
export const R_SUN_KM = 695700;

/** Earth equatorial radius, km (WGS-84 semi-major axis a = 6378137 m). */
export const R_EARTH_EQUATORIAL_KM = 6378.137;

/** Earth mean (volumetric) radius, km (IUGG). Used for great-circle distances. */
export const R_EARTH_MEAN_KM = 6371.0088;

// --- Time --------------------------------------------------------------------

/** Mean solar day, seconds. This is the period relevant to the Sun's apparent
 *  motion over the ground, and therefore to the speed of the subsolar point. */
export const SOLAR_DAY_S = 86400;

/** Mean sidereal day, seconds (IERS). Earth's rotation period w.r.t. the stars. */
export const SIDEREAL_DAY_S = 86164.0905;

/** Julian day number of J2000.0 (2000 January 1, 12:00 TT). */
export const JD_J2000 = 2451545.0;

// --- Angles ------------------------------------------------------------------

export const DEG = Math.PI / 180;        // multiply degrees by this to get radians
export const RAD = 180 / Math.PI;        // multiply radians by this to get degrees
export const ARCMIN_PER_DEG = 60;
export const ARCSEC_PER_DEG = 3600;

/**
 * Angular resolution of the unaided human eye, in degrees.
 * ~1 arcminute is the conventional figure for a well-corrected eye at high
 * contrast. Used only to answer "would this change be visible?" and is
 * explicitly a rule of thumb, not a measured constant.
 */
export const NAKED_EYE_RESOLUTION_DEG = 1 / 60;

// --- Unit conversions (all exact by definition) ------------------------------

export const KM_PER_MILE = 1.609344;
export const M_PER_FOOT = 0.3048;
export const KM_PER_NAUTICAL_MILE = 1.852;

export const kmToMiles = (km) => km / KM_PER_MILE;
export const milesToKm = (mi) => mi * KM_PER_MILE;
export const metresToFeet = (m) => m / M_PER_FOOT;
export const feetToMetres = (ft) => ft * M_PER_FOOT;

// --- Small helpers -----------------------------------------------------------

export const degToRad = (d) => d * DEG;
export const radToDeg = (r) => r * RAD;
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Normalise an angle in degrees to [0, 360). */
export const norm360 = (d) => ((d % 360) + 360) % 360;

/** Normalise an angle in degrees to (-180, 180]. */
export function norm180(d) {
  const x = norm360(d);
  return x > 180 ? x - 360 : x;
}
