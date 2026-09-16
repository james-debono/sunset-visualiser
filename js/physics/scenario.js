/**
 * Ties a location, date and window into a pair of models to compare.
 *
 * The default is an observer on the equator at the September equinox. That is
 * the cleanest case -- the Sun rises due east, sets due west, moves straight
 * down, and three hours before sunset it sits at exactly 45 degrees -- and it
 * is also the case in which the subsolar point moves fastest over the ground,
 * so nobody can claim the scenario was picked to flatter the round Earth.
 */

import { milesToKm } from './constants.js';
import { solarPosition, hourAngleAtAltitude, solarTimeFromHourAngle } from './solar.js';
import { makeGlobeModel } from './globe.js';
import { makeFlatModel, minimumHeightForImperceptibleShrink } from './flat.js';

/** Altitude of the Sun's centre defining "sunset". 0 = purely geometric. */
export const GEOMETRIC_SUNSET_ALT_DEG = 0;
/** The conventional definition: refraction (34') plus semidiameter (16'). */
export const CONVENTIONAL_SUNSET_ALT_DEG = -0.833;

export const DEFAULT_SCENARIO = Object.freeze({
  label: 'Equator, September equinox',
  date: new Date(Date.UTC(2026, 8, 23)),   // 2026-09-23
  latDeg: 0,
  lonDeg: 0,
  eyeHeightM: 1.7,
  windowHours: 3,
  flatHeightKm: milesToKm(1000),
  anchor: /** @type {'elevation'|'subsolar'} */ ('elevation'),
  sunsetAltDeg: GEOMETRIC_SUNSET_ALT_DEG,
});

/**
 * @param {Partial<typeof DEFAULT_SCENARIO>} [overrides]
 */
export function buildScenario(overrides = {}) {
  const cfg = { ...DEFAULT_SCENARIO, ...overrides };
  const { date, latDeg, lonDeg, eyeHeightM, windowHours, flatHeightKm, anchor } = cfg;

  const globe = makeGlobeModel({ date, latDeg, lonDeg, eyeHeightM });

  // Declination taken at local noon on the day in question.
  const noonUTC = new Date(date.getTime() + (12 - lonDeg / 15) * 3600000);
  const declinationDeg = solarPosition(noonUTC).declinationDeg;

  const H0 = hourAngleAtAltitude(latDeg, declinationDeg, cfg.sunsetAltDeg);
  if (H0 === null) {
    throw new Error(
      `The Sun never reaches ${cfg.sunsetAltDeg} deg at latitude ${latDeg} on this date ` +
      '(polar day or night) -- there is no sunset to visualise.',
    );
  }

  const sunsetSolarTime = solarTimeFromHourAngle(H0);
  const startSolarTime = sunsetSolarTime - windowHours;

  const flat = makeFlatModel({
    globe, startSolarTime, heightKm: flatHeightKm, anchor, declinationDeg,
  });

  return {
    config: cfg,
    globe,
    flat,
    declinationDeg,
    sunsetSolarTime,
    startSolarTime,
    endSolarTime: sunsetSolarTime,

    /** Rebuild only the flat model -- for the height slider and anchor toggle. */
    withFlatHeight(heightKm, nextAnchor = anchor) {
      return makeFlatModel({
        globe, startSolarTime, heightKm, anchor: nextAnchor, declinationDeg,
      });
    },

    /** How high a flat Sun would need to be for its shrink to be invisible. */
    minimumImperceptibleHeightKm(thresholdDeg) {
      return minimumHeightForImperceptibleShrink({
        globe, startSolarTime, endSolarTime: sunsetSolarTime, anchor,
        declinationDeg, thresholdDeg,
      });
    },
  };
}

/**
 * The headline comparison, as plain numbers. The README and the page both quote
 * these, and the test suite asserts them, so the text cannot drift from the code.
 */
export function summarise(scenario) {
  const { globe, flat, startSolarTime, endSolarTime } = scenario;
  const g0 = globe.sample(startSolarTime), g1 = globe.sample(endSolarTime);
  const f0 = flat.sample(startSolarTime), f1 = flat.sample(endSolarTime);

  return {
    startSolarTime,
    endSolarTime,
    globe: {
      startDeg: g0.angularDiameterDeg,
      endDeg: g1.angularDiameterDeg,
      changeDeg: g1.angularDiameterDeg - g0.angularDiameterDeg,
      changeArcsec: (g1.angularDiameterDeg - g0.angularDiameterDeg) * 3600,
      changePercent: (g1.angularDiameterDeg / g0.angularDiameterDeg - 1) * 100,
      startDistanceKm: g0.distanceKm,
      endDistanceKm: g1.distanceKm,
      distanceChangeKm: g1.distanceKm - g0.distanceKm,
      startAltDeg: g0.altitudeDeg,
      endAltDeg: g1.altitudeDeg,
    },
    flat: {
      startDeg: f0.angularDiameterDeg,
      endDeg: f1.angularDiameterDeg,
      changeDeg: f1.angularDiameterDeg - f0.angularDiameterDeg,
      changeArcsec: (f1.angularDiameterDeg - f0.angularDiameterDeg) * 3600,
      changePercent: (f1.angularDiameterDeg / f0.angularDiameterDeg - 1) * 100,
      remainingFraction: f1.angularDiameterDeg / f0.angularDiameterDeg,
      startDistanceKm: f0.distanceKm,
      endDistanceKm: f1.distanceKm,
      startAltDeg: f0.altitudeDeg,
      endAltDeg: f1.altitudeDeg,
      sunDiameterKm: flat.sunDiameterKm,
      speedKmh: flat.speedKmh,
    },
    /** How many times larger the flat model's shrink is. */
    ratio: Math.abs((f1.angularDiameterDeg - f0.angularDiameterDeg) /
                    (g1.angularDiameterDeg - g0.angularDiameterDeg)),
  };
}
