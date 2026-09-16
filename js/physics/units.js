/**
 * Unit handling and number formatting.
 *
 * A single global mode -- 'metric', 'imperial' or 'both' -- drives every
 * readout on the page. All physics is computed in km, km/h and degrees; units
 * are a presentation layer only, so switching them can never change a result.
 */

import { kmToMiles, metresToFeet, ARCMIN_PER_DEG, ARCSEC_PER_DEG } from './constants.js';

/** @typedef {'metric'|'imperial'|'both'} UnitMode */

export const UNIT_MODES = /** @type {UnitMode[]} */ (['metric', 'imperial', 'both']);

/** Fixed-decimal formatter with thousands separators. */
function fmt(value, decimals) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Choose a decimal count that keeps roughly `sig` significant figures. */
function decimalsFor(value, sig = 4) {
  const a = Math.abs(value);
  if (a === 0) return 0;
  const mag = Math.floor(Math.log10(a));
  return Math.max(0, Math.min(6, sig - 1 - mag));
}

function combine(metric, imperial, mode) {
  if (mode === 'metric') return metric;
  if (mode === 'imperial') return imperial;
  return `${metric} (${imperial})`;
}

/**
 * A distance given in km, rendered in km and/or miles.
 * @param {number} km
 * @param {UnitMode} mode
 */
export function formatDistance(km, mode = 'metric', sig = 4) {
  const mi = kmToMiles(km);
  return combine(
    `${fmt(km, decimalsFor(km, sig))} km`,
    `${fmt(mi, decimalsFor(mi, sig))} mi`,
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

/** Degrees, to a sensible precision. */
export const formatDeg = (deg, decimals = 3) => `${fmt(deg, decimals)}°`;

/** Degrees rendered as arcminutes. */
export const formatArcmin = (deg, decimals = 2) =>
  `${fmt(deg * ARCMIN_PER_DEG, decimals)}′`;

/** Degrees rendered as arcseconds. */
export const formatArcsec = (deg, decimals = 2) =>
  `${fmt(deg * ARCSEC_PER_DEG, decimals)}″`;

/**
 * An angular diameter shown the way astronomers actually quote one: degrees
 * with arcminutes alongside, since 0.53 deg means little to most readers but
 * "32 arcminutes" is the familiar figure.
 */
export function formatAngularSize(deg) {
  return `${fmt(deg, 4)}° (${fmt(deg * ARCMIN_PER_DEG, 2)}′)`;
}

/**
 * Rate of change of angular size. Shown in arcseconds per minute, which is the
 * scale a person can reason about, plus percent per hour for comparison
 * between two models whose absolute sizes differ.
 */
export function formatAngularRate(degPerHour, currentDeg) {
  const arcsecPerMin = degPerHour * ARCSEC_PER_DEG / 60;
  const pctPerHour = currentDeg > 0 ? (degPerHour / currentDeg) * 100 : 0;
  const sign = arcsecPerMin > 0 ? '+' : '';
  return `${sign}${fmt(arcsecPerMin, 4)}″/min  (${sign}${fmt(pctPerHour, 3)} %/h)`;
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

/** A signed duration in hours as "-2h 45m" / "+12m". */
export function formatOffset(hours) {
  const sign = hours < 0 ? '-' : '+';
  const total = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${sign}${h}h ${m}m` : `${sign}${m}m`;
}
