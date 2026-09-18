/**
 * Atmospheric extinction: how much of the Sun's light is scattered and absorbed
 * out of the beam before it reaches the eye.
 *
 * This is why you can look at a setting Sun and not a midday one, and it is the
 * reason the *glare* around the Sun shrinks as it goes down while the disc does
 * not. People who report watching the Sun "get smaller" are usually watching
 * that glare contract: the disc inside it is unchanged, which is exactly what
 * the loupe on this page shows.
 *
 * Airmass is Kasten & Young (1989), the standard fit:
 *
 *   X = 1 / ( sin h + 0.50572 (h + 6.07995)^-1.6364 )     h in degrees
 *
 * which gives 1.00 overhead and 37.92 at the horizon, where the older 1/sin h
 * formula diverges.
 *
 * Extinction is then the usual magnitude law, with one coefficient:
 *
 *   transmittance = 10^(-0.4 k X)
 *
 * A single coefficient is an approximation. Real extinction is the sum of
 * Rayleigh scattering, aerosol and ozone, each with its own height profile, and
 * the aerosol term varies by a factor of several with haze, humidity and dust.
 * The default k = 0.15 mag/airmass is chosen so the total dimming at the
 * horizon comes out at about 5.7 magnitudes -- a factor of roughly 190, which
 * is what the measured drop from midday sunlight (~100,000 lux) to a clear
 * sunset (~500 lux) implies. Treat it as the right trend and the right order of
 * magnitude, not as photometry.
 */

import { DEG } from './constants.js';

/** Typical clear sea-level visual extinction, magnitudes per airmass. */
export const DEFAULT_EXTINCTION_K = 0.15;

/**
 * Relative path length through the atmosphere, 1.0 at the zenith.
 * @param {number} apparentAltDeg apparent (refracted) altitude
 */
export function airmass(apparentAltDeg) {
  const h = Math.max(apparentAltDeg, -2);
  const denom = Math.sin(h * DEG) + 0.50572 * Math.pow(h + 6.07995, -1.6364);
  return denom > 0 ? 1 / denom : 40;
}

/** Magnitudes of light lost on the way in. */
export function extinctionMagnitudes(apparentAltDeg, k = DEFAULT_EXTINCTION_K) {
  return k * airmass(apparentAltDeg);
}

/** Fraction of the Sun's light that survives the trip, 0..1. */
export function transmittance(apparentAltDeg, k = DEFAULT_EXTINCTION_K) {
  return Math.pow(10, -0.4 * extinctionMagnitudes(apparentAltDeg, k));
}

/**
 * Light received now, relative to the start of the window. Two independent
 * causes, both included:
 *
 *   - the Sun's angular area, since surface brightness does not change with
 *     distance, so received flux follows the solid angle;
 *   - extinction, which depends on how much air the light has crossed.
 *
 * On a globe the first is flat and the second does all the work. On the flat
 * model both fall, which is one more thing the model gets wrong: its Sun would
 * dim by its own shrinking as well as by the air.
 */
export function fluxRatio({ angularDiameterDeg, startAngularDiameterDeg, apparentAltDeg, startApparentAltDeg, k }) {
  const area = (angularDiameterDeg / startAngularDiameterDeg) ** 2;
  return area * (transmittance(apparentAltDeg, k) / transmittance(startApparentAltDeg, k));
}
