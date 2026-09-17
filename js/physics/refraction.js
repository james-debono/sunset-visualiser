/**
 * Atmospheric refraction.
 *
 * This is off by default. The argument on this page is about angular *size*,
 * and refraction is a vertical-axis effect that would only muddy it. But it is
 * implemented, adjustable and documented, because leaving it out silently
 * invites "you ignored refraction" and baking one fixed value in invites "you
 * picked a convenient number".
 *
 * Two things it does near the horizon, both real and both worth seeing:
 *
 *   1. It lifts the Sun by roughly half a degree, so the Sun is already
 *      geometrically below the horizon when it appears to touch it. Sunset
 *      happens a few minutes later than pure geometry predicts.
 *   2. It lifts the lower limb more than the upper limb, squashing the disc
 *      vertically by about 15% at the horizon while leaving its width alone.
 *      That is a compression of the image, not a change in distance -- and it
 *      makes the Sun *smaller* in one axis, never larger.
 *
 * How much refraction is adjustable, in two separate ways:
 *
 *   - `pressureHPa` and `temperatureC` scale the standard formulae the usual
 *     way. Across the full range of weather this spans only about +-10%.
 *   - `scale` multiplies the result outright. Real horizon refraction varies
 *     far more than weather scaling suggests, because it is dominated by the
 *     temperature *profile* of the lowest few hundred metres of air. A strong
 *     inversion can several-times the standard value and produce mirages and
 *     the Novaya Zemlya effect. Neither formula below models that at all, so
 *     `scale` is an honest knob for exploring those conditions rather than a
 *     prediction of them.
 *
 * Formulae assume the standard atmosphere of their authors (1010 hPa, 10 C).
 * Both break down below about -1 deg apparent altitude, where real refraction
 * is not predictable from a formula of this kind.
 */

import { DEG } from './constants.js';

/** Reference conditions for both formulae. */
export const REF_PRESSURE_HPA = 1010;
export const REF_TEMPERATURE_C = 10;

/**
 * @typedef {object} Conditions
 * @property {number} [pressureHPa]
 * @property {number} [temperatureC]
 * @property {number} [scale]        anomalous-refraction multiplier; 1 = as the formula gives
 */

/** @type {Conditions} */
export const STANDARD_CONDITIONS = Object.freeze({
  pressureHPa: REF_PRESSURE_HPA,
  temperatureC: REF_TEMPERATURE_C,
  scale: 1,
});

/**
 * Multiplier applied to the standard-atmosphere refraction: denser air bends
 * light more, so refraction rises with pressure and falls with temperature.
 * @param {Conditions} [c]
 */
export function conditionsFactor(c = {}) {
  const {
    pressureHPa = REF_PRESSURE_HPA,
    temperatureC = REF_TEMPERATURE_C,
    scale = 1,
  } = c;
  return (pressureHPa / REF_PRESSURE_HPA) * (283 / (273 + temperatureC)) * scale;
}

/**
 * Saemundsson (1986): true altitude -> refraction, in degrees.
 * Use this when you know where the Sun geometrically is and want to know where
 * it appears. That is our direction of travel, since we compute geometry first.
 *
 *   R = 1.02 / tan(h + 10.3 / (h + 5.11))   [arcminutes, h in degrees]
 *
 * @param {number} trueAltDeg
 * @param {Conditions} [c]
 */
export function refractionFromTrueDeg(trueAltDeg, c) {
  const h = trueAltDeg;
  const arcmin = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG);
  return (arcmin / 60) * conditionsFactor(c);
}

/**
 * Bennett (1982): apparent altitude -> refraction, in degrees. The inverse
 * direction, kept for cross-checking that the two are consistent.
 *
 *   R = 1 / tan(h + 7.31 / (h + 4.4))       [arcminutes, h in degrees]
 *
 * @param {number} apparentAltDeg
 * @param {Conditions} [c]
 */
export function refractionFromApparentDeg(apparentAltDeg, c) {
  const h = apparentAltDeg;
  const arcmin = 1 / Math.tan((h + 7.31 / (h + 4.4)) * DEG);
  return (arcmin / 60) * conditionsFactor(c);
}

/**
 * Apparent altitude of a point at a known true altitude.
 * @param {number} trueAltDeg
 * @param {Conditions} [c]
 */
export function apparentAltitudeDeg(trueAltDeg, c) {
  return trueAltDeg + refractionFromTrueDeg(trueAltDeg, c);
}

/**
 * Apparent vertical and horizontal angular diameters of a disc of true angular
 * diameter `trueDiameterDeg` whose centre is at true altitude `trueAltDeg`.
 *
 * The limbs refract by different amounts, so the vertical diameter shrinks.
 * The horizontal diameter is unaffected at any strength of refraction, because
 * refraction depends only on altitude. However strong it gets, it can only
 * ever squash the disc, never widen it.
 *
 * @param {number} trueAltDeg
 * @param {number} trueDiameterDeg
 * @param {Conditions} [c]
 */
export function apparentDiscDeg(trueAltDeg, trueDiameterDeg, c) {
  const r = trueDiameterDeg / 2;
  const top = apparentAltitudeDeg(trueAltDeg + r, c);
  const bottom = apparentAltitudeDeg(trueAltDeg - r, c);
  return {
    verticalDeg: top - bottom,
    horizontalDeg: trueDiameterDeg,
    /** 1.0 = circular, lower = more squashed. */
    flattening: (top - bottom) / trueDiameterDeg,
    apparentCentreAltDeg: (top + bottom) / 2,
  };
}

/**
 * Apparent dip of the sea horizon for an eye `eyeHeightM` above the water.
 *
 * Terrestrial refraction bends the line of sight to the horizon too, so the
 * horizon appears less depressed than pure geometry predicts. The standard
 * navigational value is 1.76 arcmin x sqrt(height in metres), against a
 * geometric 1.93 arcmin x sqrt(h) (American Practical Navigator, Bowditch).
 *
 * The conditions multiplier applies here as well, since the same air is doing
 * the bending, but its effect on a 2.5 arcminute dip is far too small to see.
 */
export function apparentHorizonDipDeg(eyeHeightM, c) {
  if (eyeHeightM <= 0) return 0;
  const geometric = (1.93 * Math.sqrt(eyeHeightM)) / 60;
  const refracted = (1.76 * Math.sqrt(eyeHeightM)) / 60;
  const f = conditionsFactor(c);
  // Scale the refractive part of the correction, not the geometry.
  return geometric - (geometric - refracted) * f;
}

/**
 * The presets offered in the UI. Labels are built at runtime from the
 * functions above, so a preset can never advertise a figure the code does not
 * produce. `scale` above 1 is outside what the formulae model, and those
 * presets say so.
 */
export const REFRACTION_PRESETS = Object.freeze([
  {
    id: 'off', label: 'Off (pure geometry)', on: false,
    note: 'No refraction at all.',
  },
  {
    id: 'standard', label: 'Standard air', on: true,
    conditions: { pressureHPa: 1010, temperatureC: 10, scale: 1 },
    note: '1010 hPa, 10 °C — the atmosphere the formulae are written for.',
  },
  {
    id: 'hot', label: 'Hot day', on: true,
    conditions: { pressureHPa: 1005, temperatureC: 40, scale: 1 },
    note: '1005 hPa, 40 °C — thinner air bends light less.',
  },
  {
    id: 'cold', label: 'Cold day', on: true,
    conditions: { pressureHPa: 1020, temperatureC: -20, scale: 1 },
    note: '1020 hPa, −20 °C — denser air bends light more.',
  },
  {
    id: 'cold-high', label: 'Cold, high pressure', on: true,
    conditions: { pressureHPa: 1040, temperatureC: -30, scale: 1 },
    note: '1040 hPa, −30 °C — about the strongest the weather scaling gives.',
  },
  {
    id: 'inversion', label: 'Strong inversion ×2', on: true,
    conditions: { pressureHPa: 1010, temperatureC: 10, scale: 2 },
    note: 'Twice standard. Beyond what the formulae model: a temperature inversion over cold water can do this, and it is where mirages start.',
  },
  {
    id: 'mirage', label: 'Extreme mirage ×4', on: true,
    conditions: { pressureHPa: 1010, temperatureC: 10, scale: 4 },
    note: 'Four times standard. Well beyond the formulae. Included to show that even absurd refraction squashes the disc rather than shrinking its width.',
  },
]);
