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
 *
 * There is also a choice of *path*:
 *
 *   'straight' (default) -- the local-plane steelman above: the Sun recedes in
 *      a straight line at the measured speed of the subsolar point.
 *
 *   'gleason' -- the azimuthal-equidistant disc that flat-Earth maps use (the
 *      Gleason map and its relatives). The north pole is the centre, distance
 *      from the pole is preserved, and the Sun circles above the latitude of
 *      its own declination. Nothing is fitted here: once you accept the map,
 *      the Sun's whole path follows from it, including a speed and a bearing
 *      that the straight-line version never had to commit to.
 */

import { DEG, RAD, NAKED_EYE_RESOLUTION_DEG } from './constants.js';
import { R_EARTH_KM, subsolarSpeedKmh } from './solar.js';

/**
 * Where a latitude lands on an azimuthal-equidistant map centred on the north
 * pole: distance from the centre equals distance from the pole on the real
 * Earth. The north pole is 0, the equator is a quarter of a circumference out,
 * and the south pole is smeared around the rim.
 */
export const aeRadiusKm = (latDeg) => R_EARTH_KM * (Math.PI / 2 - latDeg * DEG);

/**
 * The map's own equator, measured along it. The real equator is 40,075 km, so
 * this comes out about 57% too long -- which is where the flat model's extra
 * Sun speed comes from, and is itself checkable against any pair of flight
 * times or time zones near the equator.
 */
export const aeEquatorLengthKm = () => 2 * Math.PI * aeRadiusKm(0);

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
  const { globe, startSolarTime, heightKm, anchor = 'elevation', path = 'straight' } = cfg;

  const start = globe.sample(startSolarTime);
  const declinationDeg = cfg.declinationDeg ?? start.declinationDeg;
  const latDeg = cfg.latDeg ?? globe.config.latDeg;

  // Map geometry, used only by the 'gleason' path.
  const rObs = aeRadiusKm(latDeg);
  const rSun = aeRadiusKm(declinationDeg);

  /**
   * Speed of the Sun over the ground.
   *
   * On the local plane this is the measured speed of the subsolar point. On
   * the map it is set by the map instead: the Sun has to get round a circle of
   * radius rSun in one day, and because the map stretches everything south of
   * the pole, that circle is longer than the real parallel it stands for.
   */
  const speedKmh = path === 'gleason'
    ? (2 * Math.PI * rSun) / 24
    : subsolarSpeedKmh(declinationDeg);

  /**
   * Horizontal distance from observer to the point directly below the Sun,
   * at the start of the window.
   */
  const startAltRad = start.altitudeDeg * DEG;
  const x0 = path === 'gleason'
    ? mapDistanceKm(startSolarTime)
    : anchor === 'subsolar'
      ? start.groundDistanceToSubsolarKm
      : heightKm / Math.tan(startAltRad);

  /** Distance to the Sun at the start, and the Sun radius that calibration implies. */
  const startDistanceKm = Math.hypot(x0, heightKm);
  const sunRadiusKm = startDistanceKm * Math.sin(0.5 * start.angularDiameterDeg * DEG);
  const sunDiameterKm = 2 * sunRadiusKm;

  /**
   * Straight-line distance across the map from the observer to the point below
   * the Sun. Both sit on circles about the pole, separated by the hour angle,
   * so this is the cosine rule in the map plane.
   */
  function mapDistanceKm(solarTimeHours) {
    const H = globe.sample(solarTimeHours).hourAngleDeg * DEG;
    return Math.sqrt(rObs * rObs + rSun * rSun - 2 * rObs * rSun * Math.cos(H));
  }

  /**
   * Compass bearing of the Sun as the map has it, in degrees east of north.
   * At the observer, "north" points at the centre of the map and "east" is the
   * direction of increasing longitude.
   */
  function mapBearingDeg(solarTimeHours) {
    const H = globe.sample(solarTimeHours).hourAngleDeg * DEG;
    // Observer at map angle 0; the Sun is H west of it, i.e. at angle -H.
    const dx = rSun * Math.cos(H) - rObs;     // outward from the pole
    const dy = -rSun * Math.sin(H);           // eastward
    return (Math.atan2(dy, -dx) * RAD + 360) % 360;
  }

  /** Horizontal distance at a given time. */
  function horizontalKm(solarTimeHours) {
    if (path === 'gleason') return mapDistanceKm(solarTimeHours);
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
   * Closed-form rate, valid on the straight path with the elevation anchor,
   * where x is linear in t. The map path curves, so the app uses the numerical
   * rate there. Cross-checked against the numerical form in the test suite.
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
    path,
    declinationDeg,
    latDeg,
    speedKmh,
    /** Map geometry, for the plan-view inset and the readouts. */
    map: {
      observerRadiusKm: rObs,
      sunRadiusKm: rSun,
      equatorLengthKm: aeEquatorLengthKm(),
      distanceKm: mapDistanceKm,
      bearingDeg: mapBearingDeg,
    },
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
  path = 'straight',
  thresholdDeg = NAKED_EYE_RESOLUTION_DEG,
  loKm = 1, hiKm = 1e9,
}) {
  const shrink = (h) => {
    const m = makeFlatModel({ globe, startSolarTime, heightKm: h, anchor, declinationDeg, path });
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
