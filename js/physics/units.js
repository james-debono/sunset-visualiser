/**
 * Unit handling and number formatting.
 *
 * A single global mode -- 'metric', 'imperial' or 'both' -- drives every
 * readout on the page. All physics is computed in km, km/h and degrees; units
 * are a presentation layer only, so switching them can never change a result.
 */

import { kmToMiles, metresToFeet, ARCMIN_PER_DEG } from './constants.js';

/** @typedef {'metric'|'imperial'|'both'} UnitMode */

/** Fixed-decimal formatter with thousands separators. */
function fmt(value, decimals) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Choose a decimal count that keeps roughly `sig` significant figures, but
 * never shows decimals on values of ten thousand or more.
 */
function decimalsFor(value, sig = 4) {
  const a = Math.abs(value);
  if (a === 0 || a >= 10000) return 0;
  const mag = Math.floor(Math.log10(a));
  return Math.max(0, Math.min(6, sig - 1 - mag));
}

const MINUS = '−';

function combine(metric, imperial, mode) {
  if (mode === 'metric') return metric;
  if (mode === 'imperial') return imperial;
  return `${metric} (${imperial})`;
}

/**
 * A distance given in km, rendered in km and/or miles.
 * @param {number} km
 * @param {UnitMode} mode
 * @param {number} [sig]     significant figures
 * @param {boolean} [signed] prefix + or a true minus sign, on every part
 */
export function formatDistance(km, mode = 'metric', sig = 4, signed = false) {
  const sign = signed ? (km < 0 ? MINUS : '+') : km < 0 ? MINUS : '';
  const a = Math.abs(km);
  const mi = kmToMiles(a);
  return combine(
    `${sign}${fmt(a, decimalsFor(a, sig))} km`,
    `${sign}${fmt(mi, decimalsFor(mi, sig))} mi`,
    mode,
  );
}

/**
 * A speed given in km/h, rendered in km/h and/or mph.
 * @param {number} kmh
 * @param {UnitMode} mode
 */
export function formatSpeed(kmh, mode = 'metric', sig = 4) {
  const mph = kmToMiles(kmh);
  return combine(
    `${fmt(kmh, decimalsFor(kmh, sig))} km/h`,
    `${fmt(mph, decimalsFor(mph, sig))} mph`,
    mode,
  );
}

/**
 * A small length given in metres, rendered in m and/or feet. For eye height.
 * @param {number} m
 * @param {UnitMode} mode
 */
export function formatSmallLength(m, mode = 'metric') {
  const ft = metresToFeet(m);
  return combine(`${fmt(m, 2)} m`, `${fmt(ft, 1)} ft`, mode);
}

// --- Angles ------------------------------------------------------------------
// Angles are unit-system independent, so these ignore UnitMode entirely.

/**
 * An angular diameter shown the way astronomers actually quote one: degrees
 * with arcminutes alongside, since 0.53 deg means little to most readers but
 * "32 arcminutes" is the familiar figure.
 */
export function formatAngularSize(deg) {
  return `${fmt(deg, 4)}° (${fmt(deg * ARCMIN_PER_DEG, 2)}′)`;
}

/** Apparent solar time as HH:MM:SS. */
export function formatSolarTime(hours) {
  const total = Math.round(((hours % 24) + 24) % 24 * 3600);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
