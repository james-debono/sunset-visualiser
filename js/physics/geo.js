/**
 * Globe projection for the location picker.
 *
 * Orthographic projection: the view you get looking at a globe from far away,
 * which is what a person expects a globe to look like. Both directions are
 * implemented so that clicking the drawn globe gives back a latitude and
 * longitude, and the test suite checks they are exact inverses.
 *
 * Coordinates are in degrees, latitude positive north, longitude positive east.
 * Projected coordinates are in units of the globe's radius, x east and y NORTH
 * (screen y is flipped by the caller, as everywhere else in this project).
 */

import { DEG, RAD, clamp, norm180 } from './constants.js';

/**
 * Project a point onto the globe as seen from above (lat0, lon0).
 * @returns {{x:number, y:number, visible:boolean}} visible is false for the far side.
 */
export function orthographic(latDeg, lonDeg, lat0Deg, lon0Deg) {
  const lat = latDeg * DEG, lat0 = lat0Deg * DEG;
  const dlon = (lonDeg - lon0Deg) * DEG;
  const cosC = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(dlon);
  return {
    x: Math.cos(lat) * Math.sin(dlon),
    y: Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(dlon),
    visible: cosC >= 0,
  };
}

/**
 * The inverse: turn a point on the drawn disc back into a latitude and
 * longitude. Returns null outside the disc, so a click that misses the globe
 * can be ignored rather than snapped to the limb.
 */
export function inverseOrthographic(x, y, lat0Deg, lon0Deg) {
  const rho = Math.hypot(x, y);
  if (rho > 1) return null;
  if (rho < 1e-12) return { latDeg: lat0Deg, lonDeg: norm180(lon0Deg) };

  const c = Math.asin(clamp(rho, -1, 1));
  const lat0 = lat0Deg * DEG;
  const sinC = Math.sin(c), cosC = Math.cos(c);

  const lat = Math.asin(clamp(cosC * Math.sin(lat0) + (y * sinC * Math.cos(lat0)) / rho, -1, 1));
  const lon = lon0Deg * DEG + Math.atan2(
    x * sinC,
    rho * cosC * Math.cos(lat0) - y * sinC * Math.sin(lat0),
  );
  return { latDeg: lat * RAD, lonDeg: norm180(lon * RAD) };
}

/** Points along a parallel of latitude, for drawing a graticule. */
export function parallel(latDeg, step = 5) {
  const pts = [];
  for (let lon = -180; lon <= 180; lon += step) pts.push([latDeg, lon]);
  return pts;
}

/** Points along a meridian of longitude. */
export function meridian(lonDeg, step = 5) {
  const pts = [];
  for (let lat = -90; lat <= 90; lat += step) pts.push([lat, lonDeg]);
  return pts;
}
