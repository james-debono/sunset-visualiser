/**
 * Camera optics: a pinhole (rectilinear) lens on a full-frame sensor.
 *
 * Focal lengths on this page mean what they mean on a real full-frame camera,
 * measured against the sensor's 24 mm *height*, because vertical framing --
 * horizon at the bottom, Sun at the top -- is what the scene is about.
 * Horizontal field of view simply extends to fill the pane's aspect ratio.
 *
 * A rectilinear lens keeps straight lines straight, at the cost of stretching
 * objects near the edge of frame: a disc 22.6 deg off-axis is drawn about 17%
 * taller than one on-axis. That is real lens behaviour and the main view
 * reproduces it faithfully. It is also why the magnified loupe is a *separate*
 * camera aimed directly at the Sun, rather than an enlargement of the main
 * frame -- otherwise projection distortion alone would make the Sun appear to
 * change size as it crossed the frame, which is exactly the effect under test.
 */

import { DEG, RAD } from './constants.js';

/** Full-frame sensor, mm. */
export const SENSOR_WIDTH_MM = 36;
export const SENSOR_HEIGHT_MM = 24;

/** Focal lengths a photographer would recognise, mm. */
export const COMMON_FOCAL_LENGTHS_MM = Object.freeze(
  [14, 16, 18, 20, 24, 28, 35, 50, 70, 85, 105, 135, 200, 300, 400, 600, 800, 1200, 1600],
);

/** Vertical field of view, degrees. */
export function verticalFovDeg(focalMm) {
  return 2 * Math.atan(SENSOR_HEIGHT_MM / 2 / focalMm) * RAD;
}

/** Focal length giving a vertical field of view, mm. */
export function focalForVerticalFovMm(vfovDeg) {
  return SENSOR_HEIGHT_MM / 2 / Math.tan(vfovDeg / 2 * DEG);
}

/** Focal length expressed in pixels for an image `heightPx` tall. */
export function focalPx(focalMm, heightPx) {
  return heightPx * focalMm / SENSOR_HEIGHT_MM;
}

/**
 * Unit vector for a direction given as altitude and azimuth, in a local
 * east-north-up frame.
 */
export function enu(altDeg, azDeg) {
  const a = altDeg * DEG, z = azDeg * DEG;
  return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
}

/**
 * Camera basis for a given yaw (azimuth of the optical axis) and pitch
 * (altitude of the optical axis). Roll is always zero: the horizon is level.
 */
export function cameraBasis(yawDeg, pitchDeg) {
  const y = yawDeg * DEG, p = pitchDeg * DEG;
  return {
    forward: [Math.cos(p) * Math.sin(y), Math.cos(p) * Math.cos(y), Math.sin(p)],
    right: [Math.cos(y), -Math.sin(y), 0],
    up: [-Math.sin(p) * Math.sin(y), -Math.sin(p) * Math.cos(y), Math.cos(p)],
  };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Rectilinear projection of a sky direction onto the image plane.
 *
 * @param {number} altDeg
 * @param {number} azDeg
 * @param {{basis: ReturnType<typeof cameraBasis>, fPx: number}} cam
 * @returns {{x:number, y:number}|null} pixels from image centre, x right and
 *   y UP; null if the direction is behind the camera.
 */
export function project(altDeg, azDeg, cam) {
  return projectVector(enu(altDeg, azDeg), cam);
}

/** Project a unit direction vector (east, north, up). Same conventions as `project`. */
export function projectVector(d, cam) {
  const zf = dot(d, cam.basis.forward);
  if (zf <= 1e-9) return null;
  return {
    x: cam.fPx * dot(d, cam.basis.right) / zf,
    y: cam.fPx * dot(d, cam.basis.up) / zf,
  };
}

/**
 * Outline of a disc on the sky as unit vectors, for projection through any
 * camera. The outline is built on the sphere -- around the true centre
 * direction -- so a rectilinear projection then distorts it exactly as a real
 * lens would, rather than drawing a circle and hoping.
 *
 * `hRadiusDeg` and `vRadiusDeg` are separate so that atmospheric refraction,
 * which squashes the disc vertically, can be represented.
 */
export function discOutline(centreAltDeg, centreAzDeg, hRadiusDeg, vRadiusDeg, n = 48) {
  const c = enu(centreAltDeg, centreAzDeg);
  const z = centreAzDeg * DEG, a = centreAltDeg * DEG;
  const east = [Math.cos(z), -Math.sin(z), 0];                          // along the altitude circle
  const up = [-Math.sin(a) * Math.sin(z), -Math.sin(a) * Math.cos(z), Math.cos(a)];
  const th = Math.tan(hRadiusDeg * DEG), tv = Math.tan(vRadiusDeg * DEG);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const k = (i / n) * 2 * Math.PI;
    const ch = Math.cos(k) * th, cv = Math.sin(k) * tv;
    const v = [c[0] + east[0] * ch + up[0] * cv, c[1] + east[1] * ch + up[1] * cv, c[2] + east[2] * ch + up[2] * cv];
    const m = Math.hypot(v[0], v[1], v[2]);
    pts.push([v[0] / m, v[1] / m, v[2] / m]);
  }
  return pts;
}

/**
 * Pitch that places the astronomical horizon, straight ahead, a given fraction
 * of the frame height above the bottom edge.
 *
 *   horizon at y = -fPx tan(pitch) = -(H/2)(1 - 2 frac)
 *   =>  tan(pitch) = (1 - 2 frac) tan(vfov / 2)
 */
export function pitchForHorizonFractionDeg(focalMm, fractionFromBottom) {
  const halfTan = SENSOR_HEIGHT_MM / 2 / focalMm;
  return Math.atan((1 - 2 * fractionFromBottom) * halfTan) * RAD;
}

/**
 * The narrowest common focal length whose frame holds everything between the
 * horizon and the top of the Sun at its highest, with `margin` of the frame
 * left clear at every edge.
 *
 * With the content centred vertically (pitch = span / 2), each extreme sits
 * tan(span/2) / tan(vfov/2) of the half-height from centre. Requiring that to
 * be at most (1 - 2 margin) gives the longest focal length that fits.
 *
 * Away from the equator the Sun also swings in azimuth as it sets, so the
 * frame has to be wide enough for that too. The horizontal limit is measured
 * against a 3:2 frame; real panes are wider, so this is the conservative one
 * to use, and the vertical framing is unaffected.
 *
 * @param {number} spanDeg      vertical span, horizon to the top of the Sun
 * @param {number} [margin]     fraction of the frame kept clear at each edge
 * @param {number[]} [lengths]  focal lengths to choose between
 * @param {number} [azSpanDeg]  horizontal span the Sun covers, 0 if it does not move
 * @param {number} [maxHorizonFraction]  keeps the horizon near the bottom of frame
 * @returns {{focalMm:number, horizonFraction:number, maxFocalMm:number}}
 */
export function defaultFraming(
  spanDeg, margin = 0.02, lengths = COMMON_FOCAL_LENGTHS_MM, azSpanDeg = 0,
  maxHorizonFraction = 0.12,
) {
  const clear = 1 - 2 * margin;
  const byHeight = (SENSOR_HEIGHT_MM / 2) * clear / Math.tan(spanDeg / 2 * DEG);
  const byWidth = azSpanDeg > 0
    ? (SENSOR_WIDTH_MM / 2) * clear / Math.tan(azSpanDeg / 2 * DEG)
    : Infinity;
  const maxFocalMm = Math.min(byHeight, byWidth);
  const fitting = lengths.filter((f) => f <= maxFocalMm);
  const focalMm = fitting.length ? fitting[fitting.length - 1] : lengths[0];

  // Where the horizon lands at that focal length, as a fraction from the
  // bottom. This fraction is then held fixed as the user changes focal length,
  // so "horizon near the bottom of frame" stays true at every zoom.
  //
  // When the lens is set by the Sun's sideways swing rather than by its height
  // -- which happens away from the equator, where the Sun sets at an angle --
  // there is vertical slack left over. Centring the content would float the
  // horizon up the frame and fill the bottom half with sea, so the horizon is
  // capped near the bottom and the slack is given to the sky instead.
  const ratio = Math.tan(spanDeg / 2 * DEG) / (SENSOR_HEIGHT_MM / 2 / focalMm);
  const horizonFraction = Math.min((1 - ratio) / 2, maxHorizonFraction);

  return { focalMm, horizonFraction, maxFocalMm };
}
