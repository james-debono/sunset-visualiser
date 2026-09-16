/**
 * Atmospheric refraction.
 *
 * This is off by default. The argument on this page is about angular *size*,
 * and refraction is a vertical-axis effect that would only muddy it. But it is
 * implemented, toggleable and documented, because leaving it out silently
 * invites "you ignored refraction" and baking it in invites "you fudged it".
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
 * Formulae assume the standard atmosphere of their authors (1010 hPa, 10 C) and
 * are scaled for other conditions in the usual way. Both break down below about
 * -1 deg apparent altitude, where real refraction is dominated by the local
 * temperature profile and is not predictable from a formula at all.
 */

import { DEG } from './constants.js';

/** Reference conditions for both formulae. */
export const REF_PRESSURE_HPA = 1010;
export const REF_TEMPERATURE_C = 10;

/** Multiplier for non-standard pressure and temperature. */
export function conditionsFactor(pressureHPa = REF_PRESSURE_HPA, temperatureC = REF_TEMPERATURE_C) {
  return (pressureHPa / REF_PRESSURE_HPA) * (283 / (273 + temperatureC));
}

/**
 * Saemundsson (1986): true altitude -> refraction, in degrees.
 * Use this when you know where the Sun geometrically is and want to know where
 * it appears. That is our direction of travel, since we compute geometry first.
 *
 *   R = 1.02 / tan(h + 10.3 / (h + 5.11))   [arcminutes, h in degrees]
 */
export function refractionFromTrueDeg(trueAltDeg, pressureHPa, temperatureC) {
  const h = trueAltDeg;
  const arcmin = 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * DEG);
  return (arcmin / 60) * conditionsFactor(pressureHPa, temperatureC);
}

/**
 * Bennett (1982): apparent altitude -> refraction, in degrees. The inverse
 * direction, kept for cross-checking that the two are consistent.
 *
 *   R = 1 / tan(h + 7.31 / (h + 4.4))       [arcminutes, h in degrees]
 */
export function refractionFromApparentDeg(apparentAltDeg, pressureHPa, temperatureC) {
  const h = apparentAltDeg;
  const arcmin = 1 / Math.tan((h + 7.31 / (h + 4.4)) * DEG);
  return (arcmin / 60) * conditionsFactor(pressureHPa, temperatureC);
}

/** Apparent altitude of a point at a known true altitude. */
export function apparentAltitudeDeg(trueAltDeg, pressureHPa, temperatureC) {
  return trueAltDeg + refractionFromTrueDeg(trueAltDeg, pressureHPa, temperatureC);
}

/**
 * Apparent vertical and horizontal angular diameters of a disc of true angular
 * diameter `trueDiameterDeg` whose centre is at true altitude `trueAltDeg`.
 *
 * The limbs refract by different amounts, so the vertical diameter shrinks.
 * The horizontal diameter is unaffected to the accuracy of these formulae,
 * because refraction depends only on altitude.
 */
export function apparentDiscDeg(trueAltDeg, trueDiameterDeg, pressureHPa, temperatureC) {
  const r = trueDiameterDeg / 2;
  const top = apparentAltitudeDeg(trueAltDeg + r, pressureHPa, temperatureC);
  const bottom = apparentAltitudeDeg(trueAltDeg - r, pressureHPa, temperatureC);
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
 */
export function apparentHorizonDipDeg(eyeHeightM) {
  return eyeHeightM > 0 ? (1.76 * Math.sqrt(eyeHeightM)) / 60 : 0;
}
