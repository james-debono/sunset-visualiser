/**
 * Solar ephemeris and observer-relative solar geometry.
 *
 * The ephemeris is the USNO / Astronomical Almanac "Low-Precision Formulae for
 * the Sun's Coordinates", accurate to about 0.01 deg in ecliptic longitude over
 * 1950-2050 -- roughly 1/50th of the Sun's own angular diameter, i.e. far below
 * anything this page's argument depends on.
 *
 * Earth is modelled as a sphere. For the default scenario (observer on the
 * equator at an equinox) the subsolar point runs along the equator, so the
 * equatorial radius is the physically correct value there. Oblateness (0.34%)
 * is neglected; see maths.html for why that cannot affect the conclusion.
 */

import {
  AU_KM, R_SUN_KM, R_EARTH_EQUATORIAL_KM, JD_J2000, SOLAR_DAY_S,
  DEG, RAD, norm360, norm180, clamp,
} from './constants.js';

/** The single spherical Earth radius used throughout the app, km. */
export const R_EARTH_KM = R_EARTH_EQUATORIAL_KM;

// --- Time --------------------------------------------------------------------

/** Julian Day number for a JS Date (which is always UTC internally). */
export function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Days elapsed since J2000.0. */
export function daysSinceJ2000(date) {
  return julianDay(date) - JD_J2000;
}

// --- Ephemeris ---------------------------------------------------------------

/**
 * Apparent geocentric position of the Sun.
 *
 * @param {Date} date
 * @returns {{
 *   meanLongitudeDeg:number, meanAnomalyDeg:number, eclipticLongitudeDeg:number,
 *   obliquityDeg:number, rightAscensionDeg:number, declinationDeg:number,
 *   distanceAU:number, distanceKm:number, equationOfTimeMin:number
 * }}
 */
export function solarPosition(date) {
  const n = daysSinceJ2000(date);

  const L = norm360(280.460 + 0.9856474 * n);   // mean longitude, deg
  const g = norm360(357.528 + 0.9856003 * n);   // mean anomaly, deg
  const gr = g * DEG;

  // Apparent ecliptic longitude (equation of centre, first two terms).
  const lambda = norm360(L + 1.915 * Math.sin(gr) + 0.020 * Math.sin(2 * gr));
  const lr = lambda * DEG;

  const eps = 23.439 - 0.0000004 * n;           // obliquity of the ecliptic
  const er = eps * DEG;

  const ra = norm360(Math.atan2(Math.cos(er) * Math.sin(lr), Math.cos(lr)) * RAD);
  const dec = Math.asin(Math.sin(er) * Math.sin(lr)) * RAD;

  // Earth-Sun distance in AU. This varies by about 1.7% over a year and, which
  // matters here, it also drifts measurably over a single afternoon -- so we
  // recompute it at every timestep rather than holding it fixed.
  const distanceAU = 1.00014 - 0.01671 * Math.cos(gr) - 0.00014 * Math.cos(2 * gr);

  // Equation of time: apparent solar time minus mean solar time.
  const eot = norm180(L - ra) * 4;              // degrees -> minutes (1 deg = 4 min)

  return {
    meanLongitudeDeg: L,
    meanAnomalyDeg: g,
    eclipticLongitudeDeg: lambda,
    obliquityDeg: eps,
    rightAscensionDeg: ra,
    declinationDeg: dec,
    distanceAU,
    distanceKm: distanceAU * AU_KM,
    equationOfTimeMin: eot,
  };
}

// --- Angular size and parallax ----------------------------------------------

/**
 * Angular diameter of a sphere of radius `radiusKm` seen from `distanceKm`.
 * Exact: theta = 2 * asin(R / d). Note asin, not atan -- the sight lines are
 * tangent to the limb, they do not meet the centre plane.
 */
export function angularDiameterDeg(distanceKm, radiusKm = R_SUN_KM) {
  return 2 * Math.asin(radiusKm / distanceKm) * RAD;
}

/** Inverse of angularDiameterDeg: the distance at which a sphere subtends theta. */
export function distanceForAngularDiameter(thetaDeg, radiusKm = R_SUN_KM) {
  return radiusKm / Math.sin(0.5 * thetaDeg * DEG);
}

/** Solar horizontal parallax: Earth's radius seen from the Sun, about 8.79 arcsec. */
export function horizontalParallaxDeg(distanceKm) {
  return Math.asin(R_EARTH_KM / distanceKm) * RAD;
}

// --- Observer geometry -------------------------------------------------------

/**
 * Hour angle in degrees from local apparent (true) solar time in hours.
 * H = 0 at local apparent noon, +15 deg per hour thereafter.
 */
export const hourAngleFromSolarTime = (hours) => 15 * (hours - 12);
export const solarTimeFromHourAngle = (HDeg) => HDeg / 15 + 12;

/**
 * Geocentric solar altitude: the Sun's angle above the plane tangent to the
 * sphere at the observer.
 *   sin(alt) = sin(lat) sin(dec) + cos(lat) cos(dec) cos(H)
 */
export function altitudeGeocentricDeg(latDeg, decDeg, HDeg) {
  const p = latDeg * DEG, d = decDeg * DEG, h = HDeg * DEG;
  const s = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h);
  return Math.asin(clamp(s, -1, 1)) * RAD;
}

/**
 * Topocentric (actually observed) altitude: geocentric altitude reduced by
 * diurnal parallax. At most 8.79 arcseconds for the Sun, but it costs one line
 * and omitting it would be one more thing to argue about.
 */
export function altitudeTopocentricDeg(altGeoDeg, distanceKm) {
  const par = horizontalParallaxDeg(distanceKm);
  return altGeoDeg - par * Math.cos(altGeoDeg * DEG);
}

/** Solar azimuth, degrees east of north. */
export function azimuthDeg(latDeg, decDeg, HDeg) {
  const p = latDeg * DEG, d = decDeg * DEG, h = HDeg * DEG;
  const y = -Math.sin(h) * Math.cos(d);
  const x = Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(h);
  return norm360(Math.atan2(y, x) * RAD);
}

/**
 * Angle subtended at Earth's centre between the observer and the subsolar
 * point -- the geocentric zenith distance of the Sun. This drives everything:
 * the observer's local horizontal plane tips away from the Sun at this rate.
 */
export function centralAngleDeg(latDeg, decDeg, HDeg) {
  return 90 - altitudeGeocentricDeg(latDeg, decDeg, HDeg);
}

/**
 * Great-circle distance along the ground from the observer to the subsolar
 * point (where the Sun is directly overhead). A directly measurable quantity
 * that any model of the sky has to account for.
 */
export function groundDistanceToSubsolarKm(latDeg, decDeg, HDeg) {
  return R_EARTH_KM * centralAngleDeg(latDeg, decDeg, HDeg) * DEG;
}

/**
 * Speed of the subsolar point over the ground, km/h. The subsolar point tracks
 * the parallel of latitude equal to the Sun's declination, completing one
 * circuit per mean solar day.
 */
export function subsolarSpeedKmh(decDeg) {
  const parallelRadius = R_EARTH_KM * Math.cos(decDeg * DEG);
  return 2 * Math.PI * parallelRadius / (SOLAR_DAY_S / 3600);
}

/**
 * Hour angle at which the Sun's centre reaches altitude h0.
 * Returns null when that altitude is never reached (polar day or night).
 *   h0 =  0      -> geometric sunset (centre on the astronomical horizon)
 *   h0 = -0.833  -> conventional sunset (refraction plus semidiameter)
 */
export function hourAngleAtAltitude(latDeg, decDeg, h0Deg = 0) {
  const p = latDeg * DEG, d = decDeg * DEG, h = h0Deg * DEG;
  const denom = Math.cos(p) * Math.cos(d);
  if (Math.abs(denom) < 1e-12) return Math.abs(h0Deg) < 1e-9 ? 90 : null;
  const c = (Math.sin(h) - Math.sin(p) * Math.sin(d)) / denom;
  if (c < -1 || c > 1) return null;
  return Math.acos(c) * RAD;
}

/**
 * Dip of the visible sea horizon below the astronomical horizontal for an eye
 * `eyeHeightM` above a spherical sea: dip = acos(R / (R + h)).
 * Purely geometric; refraction is applied separately.
 */
export function horizonDipDeg(eyeHeightM) {
  if (eyeHeightM <= 0) return 0;
  const R = R_EARTH_KM;
  return Math.acos(R / (R + eyeHeightM / 1000)) * RAD;
}

/** Geometric distance to that visible horizon, km. */
export function horizonDistanceKm(eyeHeightM) {
  if (eyeHeightM <= 0) return 0;
  const R = R_EARTH_KM, h = eyeHeightM / 1000;
  return Math.sqrt(h * (2 * R + h));
}
