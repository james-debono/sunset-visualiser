/**
 * The flat-Earth model.
 *
 * Ground is a plane. The Sun is a small object at constant height h above that
 * plane, travelling horizontally at the speed the subsolar point is actually
 * measured to move over the ground (about 1670 km/h at the equator). It does
 * not set; it recedes, shrinks, and approaches the horizon asymptotically.
 *
 * The Sun's physical size is not asserted -- it is *derived*, by requiring the
 * model to reproduce the Sun's real angular diameter at the start of the
 * window. That is the only honest way to set it: we grant the model a correct
 * starting appearance for free, and then ask only that it get the following
 * three hours right.
 *
 * Two anchoring modes decide where the Sun starts horizontally:
 *
 *   'elevation' (default) -- x0 is chosen so the flat Sun starts at the same
 *      elevation angle the real Sun actually has. Both camera views then begin
 *      identical in size and position, so every later difference is purely the
 *      model's doing. The cost: the implied ground distance to the point below
 *      the Sun disagrees with the measured one, and the model reports that
 *      disagreement rather than hiding it.
 *
 *   'subsolar' -- x(t) is the real, measured great-circle distance from the
 *      observer to the subsolar point. No free parameters, but the flat Sun
 *      then starts at the wrong elevation.
 */

import { DEG, RAD, NAKED_EYE_RESOLUTION_DEG } from './constants.js';
import { subsolarSpeedKmh } from './solar.js';

/**
 * @param {object} cfg
 * @param {object} cfg.globe           A model from makeGlobeModel, used for the
 *                                     real starting appearance and declination.
 * @param {number} cfg.startSolarTime  Start of the window, apparent solar hours.
 * @param {number} cfg.heightKm        Height of the Sun above the plane.
 * @param {'elevation'|'subsolar'} cfg.anchor
 * @param {number} [cfg.declinationDeg]  Solar declination to use for the
 *   subsolar speed. Defaults to the value at the start of the window. The
 *   caller may pass its own so that a scenario reports one declination
 *   everywhere rather than two that differ in the fourth decimal place.
 */
export function makeFlatModel(cfg) {
  const { globe, startSolarTime, heightKm, anchor = 'elevation' } = cfg;

  const start = globe.sample(startSolarTime);
  const declinationDeg = cfg.declinationDeg ?? start.declinationDeg;

  /** Speed of the Sun across the plane, km/h -- the measured subsolar speed. */
  const speedKmh = subsolarSpeedKmh(declinationDeg);

  /**
   * Horizontal distance from observer to the point directly below the Sun,
   * at the start of the window.
   */
  const startAltRad = start.altitudeDeg * DEG;
  const x0 = anchor === 'subsolar'
    ? start.groundDistanceToSubsolarKm
    : heightKm / Math.tan(startAltRad);

  /** Distance to the Sun at the start, and the Sun radius that calibration implies. */
  const startDistanceKm = Math.hypot(x0, heightKm);
  const sunRadiusKm = startDistanceKm * Math.sin(0.5 * start.angularDiameterDeg * DEG);
  const sunDiameterKm = 2 * sunRadiusKm;

  /** Horizontal distance at a given time. */
  function horizontalKm(solarTimeHours) {
    if (anchor === 'subsolar') {
      return globe.sample(solarTimeHours).groundDistanceToSubsolarKm;
    }
    return x0 + speedKmh * (solarTimeHours - startSolarTime);
  }

  function sample(solarTimeHours) {
    const x = horizontalKm(solarTimeHours);
    const distanceKm = Math.hypot(x, heightKm);
    return {
      solarTimeHours,
      horizontalKm: x,
      distanceKm,
      angularDiameterDeg: 2 * Math.asin(sunRadiusKm / distanceKm) * RAD,
      /** Elevation of the Sun above the plane. Never reaches zero. */
      altitudeDeg: Math.atan2(heightKm, x) * RAD,
      heightKm,
      sunRadiusKm,
    };
  }

  /** Numerical rate of change of angular diameter, degrees per hour. */
  function angularRateDegPerHour(solarTimeHours, stepHours = 1 / 60) {
    const a = sample(solarTimeHours - stepHours / 2).angularDiameterDeg;
    const b = sample(solarTimeHours + stepHours / 2).angularDiameterDeg;
    return (b - a) / stepHours;
  }

  /**
   * Closed-form rate, valid in 'elevation' mode where x is linear in t.
   * Cross-checked against the numerical form in the test suite.
   *
   *   d = sqrt(x^2 + h^2),  dd/dt = x v / d
   *   theta = 2 asin(r/d)  =>  dtheta/dt = -2 (r/d^2)/sqrt(1-(r/d)^2) * dd/dt
   */
  function angularRateAnalyticDegPerHour(solarTimeHours) {
    const x = horizontalKm(solarTimeHours);
    const d = Math.hypot(x, heightKm);
    const dddt = x * speedKmh / d;
    const u = sunRadiusKm / d;
    return -2 * (u / d) / Math.sqrt(1 - u * u) * dddt * RAD;
  }

  return {
    config: cfg,
    anchor,
    declinationDeg,
    speedKmh,
    sunRadiusKm,
    sunDiameterKm,
    startHorizontalKm: x0,
    startDistanceKm,
    /**
     * In 'elevation' mode the model needs the Sun to be x0 away to look right,
     * but the ground distance to the subsolar point is actually this. The gap
     * is a cost of granting the model a correct starting appearance, and it is
     * surfaced in the UI rather than buried.
     */
    measuredGroundDistanceKm: start.groundDistanceToSubsolarKm,
    sample,
    horizontalKm,
    angularRateDegPerHour,
    angularRateAnalyticDegPerHour,
  };
}

/**
 * How high would the flat Sun have to be for its shrink across the window to
 * fall below a given angular threshold (by default, naked-eye resolution)?
 *
 * Solved by bisection on height. The answer comes out in the tens of thousands
 * of km -- many Earth diameters up, and far above any height the flat-Earth
 * literature proposes, which is the point.
 *
 * @returns {number|null} height in km, or null if no height in range works.
 */
export function minimumHeightForImperceptibleShrink({
  globe, startSolarTime, endSolarTime, anchor = 'elevation', declinationDeg,
  thresholdDeg = NAKED_EYE_RESOLUTION_DEG,
  loKm = 1, hiKm = 1e9,
}) {
  const shrink = (h) => {
    const m = makeFlatModel({ globe, startSolarTime, heightKm: h, anchor, declinationDeg });
    return m.sample(startSolarTime).angularDiameterDeg
         - m.sample(endSolarTime).angularDiameterDeg;
  };

  if (shrink(hiKm) > thresholdDeg) return null;   // even absurd heights fail
  if (shrink(loKm) <= thresholdDeg) return loKm;  // already imperceptible

  let lo = loKm, hi = hiKm;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);               // geometric bisection: wide range
    if (shrink(mid) > thresholdDeg) lo = mid; else hi = mid;
    if (hi / lo < 1 + 1e-12) break;
  }
  return hi;
}
