/**
 * The spherical-Earth model.
 *
 * The claim under test: between three hours before sunset and sunset, the Sun's
 * angular diameter is essentially unchanged, because the observer-to-Sun
 * distance barely changes. The Sun sets because the observer's local horizontal
 * plane rotates up past it, not because the Sun recedes.
 *
 * Two separate effects move the observer-Sun distance during the window, and
 * both are included here rather than only the one that helps the argument:
 *
 *   1. Earth's rotation carries the observer around by up to one Earth radius
 *      relative to the Sun direction (about 4500 km over the window).
 *   2. Earth's orbital motion changes the Earth-Sun distance itself, which near
 *      the equinoxes is of comparable magnitude over three hours.
 *
 * Together they still amount to a few thousand km in 150 million, so the
 * conclusion is unaffected -- but the code does not quietly drop term 2.
 */

import { AU_KM, R_SUN_KM, DEG, RAD } from './constants.js';
import {
  R_EARTH_KM, solarPosition, angularDiameterDeg, altitudeGeocentricDeg,
  altitudeTopocentricDeg, azimuthDeg, centralAngleDeg, hourAngleFromSolarTime,
  groundDistanceToSubsolarKm, horizonDipDeg, horizonDistanceKm,
} from './solar.js';

/**
 * Straight-line distance from an observer on the surface to the Sun's centre.
 *
 *   d^2 = D^2 + R^2 - 2 D R cos(psi)
 *
 * where D is the geocentric Earth-Sun distance, R the Earth's radius, and psi
 * the angle at Earth's centre between the observer and the subsolar point.
 * Since psi = 90 - alt_geocentric, cos(psi) = sin(alt_geocentric).
 */
export function observerSunDistanceKm(earthSunKm, altGeoDeg, earthRadiusKm = R_EARTH_KM) {
  const D = earthSunKm, R = earthRadiusKm;
  return Math.sqrt(D * D + R * R - 2 * D * R * Math.sin(altGeoDeg * DEG));
}

/**
 * Convert local apparent solar time to UTC for a given longitude and day.
 * Iterated twice because the equation of time depends (very weakly) on the
 * instant being solved for.
 */
export function utcForSolarTime(baseDateUTC, lonDeg, solarTimeHours) {
  const midnight = Date.UTC(
    baseDateUTC.getUTCFullYear(), baseDateUTC.getUTCMonth(), baseDateUTC.getUTCDate(),
  );
  let ms = midnight + (solarTimeHours - lonDeg / 15) * 3600000;
  for (let i = 0; i < 2; i++) {
    const eot = solarPosition(new Date(ms)).equationOfTimeMin;
    ms = midnight + (solarTimeHours - lonDeg / 15 - eot / 60) * 3600000;
  }
  return new Date(ms);
}

/**
 * Build a globe model for one scenario.
 *
 * @param {object} cfg
 * @param {Date}   cfg.date          Any instant on the day of interest (UTC).
 * @param {number} cfg.latDeg        Observer latitude, degrees north.
 * @param {number} cfg.lonDeg        Observer longitude, degrees east.
 * @param {number} cfg.eyeHeightM    Observer eye height above sea level, metres.
 */
export function makeGlobeModel(cfg) {
  const { date, latDeg, lonDeg = 0, eyeHeightM = 1.7 } = cfg;

  /**
   * Full state at a local apparent solar time.
   * @param {number} solarTimeHours e.g. 15 = 3pm apparent solar time.
   */
  function sample(solarTimeHours) {
    const utc = utcForSolarTime(date, lonDeg, solarTimeHours);
    const sun = solarPosition(utc);
    const H = hourAngleFromSolarTime(solarTimeHours);

    const altGeo = altitudeGeocentricDeg(latDeg, sun.declinationDeg, H);
    const distanceKm = observerSunDistanceKm(sun.distanceKm, altGeo);
    const altTopo = altitudeTopocentricDeg(altGeo, sun.distanceKm);

    return {
      solarTimeHours,
      utc,
      hourAngleDeg: H,
      declinationDeg: sun.declinationDeg,
      earthSunDistanceKm: sun.distanceKm,
      /** Observer-to-Sun distance -- the quantity that sets the angular size. */
      distanceKm,
      angularDiameterDeg: angularDiameterDeg(distanceKm),
      /** Geometric altitude, no refraction. Refraction is applied by the caller. */
      altitudeDeg: altTopo,
      altitudeGeocentricDeg: altGeo,
      azimuthDeg: azimuthDeg(latDeg, sun.declinationDeg, H),
      centralAngleDeg: centralAngleDeg(latDeg, sun.declinationDeg, H),
      groundDistanceToSubsolarKm: groundDistanceToSubsolarKm(latDeg, sun.declinationDeg, H),
      horizonDipDeg: horizonDipDeg(eyeHeightM),
      horizonDistanceKm: horizonDistanceKm(eyeHeightM),
    };
  }

  /**
   * Rate of change of angular diameter, degrees per hour, by central difference
   * on `sample`. A step of one minute keeps roughly nine significant digits in
   * double precision while staying far inside the curvature of the function.
   */
  function angularRateDegPerHour(solarTimeHours, stepHours = 1 / 60) {
    const a = sample(solarTimeHours - stepHours / 2).angularDiameterDeg;
    const b = sample(solarTimeHours + stepHours / 2).angularDiameterDeg;
    return (b - a) / stepHours;
  }

  /**
   * Analytic rate of change of angular diameter, split into the two physical
   * causes. Independent of `angularRateDegPerHour` above: that one
   * differentiates the sampled curve numerically, this one differentiates the
   * closed form. The test suite asserts the two agree, which catches an algebra
   * slip in either.
   *
   * The split matters. Over this window the two contributions are of similar
   * size and opposite sign, so the total is *smaller* than either -- during a
   * September afternoon the Sun is actually growing very slightly, because
   * Earth is falling toward perihelion faster than rotation carries the
   * observer away. Quoting only the rotational term would understate the
   * honest total, so both are computed.
   *
   *   theta = 2 asin(r/d)  =>  dtheta/dt = -2 (r/d^2) / sqrt(1-(r/d)^2) * dd/dt
   *   d^2 = D^2 + R^2 - 2 D R sin(a)
   *     => d dd/dt = (D - R sin a) dD/dt  -  R D cos(a) da/dt
   *                  \__ orbital ___/        \__ rotational __/
   */
  function angularRateBreakdown(solarTimeHours) {
    const s = sample(solarTimeHours);
    const D = s.earthSunDistanceKm, d = s.distanceKm, R = R_EARTH_KM;
    const a = s.altitudeGeocentricDeg * DEG;

    // `sample` is parameterised by apparent solar time, but the ephemeris
    // series below give rates per hour of UTC. The two clocks drift apart via
    // the equation of time by only ~2 parts in 10000 -- negligible anywhere
    // else, but the two terms here nearly cancel, so it shows up in the
    // residual and is corrected rather than ignored.
    const step = 1 / 60;
    const utcPerSolarHour =
      (sample(solarTimeHours + step / 2).utc - sample(solarTimeHours - step / 2).utc) /
      (step * 3600000);

    const eph = solarPosition(s.utc);
    const g = eph.meanAnomalyDeg * DEG;
    const lam = eph.eclipticLongitudeDeg * DEG;
    const eps = eph.obliquityDeg * DEG;
    const dec = s.declinationDeg * DEG;

    // Series rates, degrees per hour of apparent solar time.
    const dgdtDeg = (0.9856003 / 24) * utcPerSolarHour;
    const dLdtDeg = (0.9856474 / 24) * utcPerSolarHour;

    // dD/dt from D = AU (1.00014 - 0.01671 cos g - 0.00014 cos 2g).
    const dDdt = AU_KM * (0.01671 * Math.sin(g) + 0.00028 * Math.sin(2 * g)) * (dgdtDeg * DEG);

    // ddec/dt from sin(dec) = sin(eps) sin(lambda), with
    // lambda = L + 1.915 sin g + 0.020 sin 2g.
    const dlamdt = (dLdtDeg + (1.915 * Math.cos(g) + 0.040 * Math.cos(2 * g)) * dgdtDeg) * DEG;
    const ddecdt = Math.sin(eps) * Math.cos(lam) * dlamdt / Math.cos(dec);

    // da/dt from sin(a) = sin(lat) sin(dec) + cos(lat) cos(dec) cos(H).
    // The hour angle advances exactly 15 deg per hour of apparent solar time,
    // by the definition of apparent solar time.
    const dHdt = 15 * DEG;
    const lat = latDeg * DEG, H = s.hourAngleDeg * DEG;
    const dadt = (
      Math.sin(lat) * Math.cos(dec) * ddecdt
      - Math.cos(lat) * Math.sin(dec) * Math.cos(H) * ddecdt
      - Math.cos(lat) * Math.cos(dec) * Math.sin(H) * dHdt
    ) / Math.cos(a);

    const dddtOrbital = (D - R * Math.sin(a)) * dDdt / d;
    const dddtRotational = -R * D * Math.cos(a) * dadt / d;

    // dtheta/dd, degrees of angular diameter per km of distance.
    const u = R_SUN_KM / d;
    const dThetaDd = -2 * (u / d) / Math.sqrt(1 - u * u) * RAD;

    return {
      rotationalDegPerHour: dThetaDd * dddtRotational,
      orbitalDegPerHour: dThetaDd * dddtOrbital,
      totalDegPerHour: dThetaDd * (dddtRotational + dddtOrbital),
      distanceRateKmPerHour: dddtRotational + dddtOrbital,
      distanceRateRotationalKmPerHour: dddtRotational,
      distanceRateOrbitalKmPerHour: dddtOrbital,
    };
  }

  const angularRateAnalyticDegPerHour = (t) => angularRateBreakdown(t).totalDegPerHour;

  return {
    config: cfg,
    sample,
    angularRateDegPerHour,
    angularRateAnalyticDegPerHour,
    angularRateBreakdown,
  };
}
