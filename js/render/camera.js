/**
 * Camera view renderer.
 *
 * This module draws; it does not compute physics. It is handed the Sun's
 * apparent position and angular radii (already refracted, if refraction is on)
 * and the horizon's apparent altitude, and projects them through a rectilinear
 * lens. Two cameras are used per pane:
 *
 *   - the main camera, fixed in pointing, with the horizon a set fraction of
 *     the frame above the bottom edge;
 *   - the loupe, a long lens aimed straight at the Sun, so the disc is drawn
 *     on-axis and free of the edge stretch a wide lens introduces.
 *
 * What is physical and what is decorative:
 *
 *   PHYSICAL  Sun position, angular size and shape; horizon position; lens
 *             projection; relative brightness of the glow, which scales with
 *             the Sun's solid angle (received flux ~ angular area x surface
 *             brightness, and surface brightness does not change with
 *             distance).
 *   DECORATIVE  Sky and sea colours. They vary with solar altitude to look
 *             like a sunset, but are not a radiative-transfer model and carry
 *             no part of the argument. Both panes use the identical function.
 */

import {
  cameraBasis, focalPx, pitchForHorizonFractionDeg, project, projectVector,
  discOutline, verticalFovDeg,
} from '../physics/optics.js';
import { font } from './stage.js';

// --- Decorative colour ramps -------------------------------------------------

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** Piecewise-linear ramp over solar altitude. Keys must be descending. */
function ramp(keys) {
  const parsed = keys.map(([alt, ...cols]) => [alt, ...cols.map(hex)]);
  return (alt) => {
    if (alt >= parsed[0][0]) return parsed[0].slice(1);
    for (let i = 1; i < parsed.length; i++) {
      const [a1, ...c1] = parsed[i];
      if (alt >= a1) {
        const [a0, ...c0] = parsed[i - 1];
        const t = (alt - a1) / (a0 - a1);
        return c0.map((c, k) => mix(c1[k], c, t));
      }
    }
    return parsed[parsed.length - 1].slice(1);
  };
}

//                       sun alt   zenith     horizon
const skyRamp = ramp([
  [30, '#3572c0', '#a9cbe6'],
  [12, '#3b6db5', '#cdd7d8'],
  [5, '#3f639f', '#ecc491'],
  [1.5, '#3a568a', '#f2a465'],
  [0, '#33497a', '#ec8a4d'],
  [-2, '#28385f', '#c46540'],
  [-6, '#151d33', '#573a43'],
]);

//                       sun alt   disc       glow
const sunRamp = ramp([
  [20, '#fffdf4', '#fff8e6'],
  [8, '#fff3cf', '#ffe9b8'],
  [3, '#ffd98c', '#ffcf8a'],
  [1, '#ffb866', '#ffb070'],
  [0, '#ff9a4d', '#ff9a5c'],
  [-1, '#ff7a3a', '#ff7a4a'],
]);

/** Sky colour at a given elevation, for a Sun at a given altitude. */
function skyColour(elevDeg, sunAltDeg) {
  const [zenith, horizon] = skyRamp(sunAltDeg);
  const t = Math.pow(clamp01(elevDeg / 55), 0.55);
  return mix(horizon, zenith, t);
}

// --- Drawing helpers -----------------------------------------------------------

function tracePolygon(ctx, pts) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

/** Projected outline of a disc, in screen coordinates. Null if off-camera. */
function discPath(cam, cx, cy, altDeg, azDeg, hR, vR) {
  const pts = [];
  for (const v of discOutline(altDeg, azDeg, hR, vR, 56)) {
    const p = projectVector(v, cam);
    if (!p) return null;
    pts.push({ x: cx + p.x, y: cy - p.y });
  }
  return pts;
}

/** Screen-space polyline of a constant-altitude circle across the frame. */
function altitudeLine(cam, cx, cy, altDeg, yawDeg, halfSpanDeg) {
  const pts = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const az = yawDeg - halfSpanDeg + (2 * halfSpanDeg * i) / n;
    const p = project(altDeg, az, cam);
    if (p) pts.push({ x: cx + p.x, y: cy - p.y });
  }
  return pts;
}

function paintSky(ctx, x, y, w, h, cam, cx, cy, yawDeg, sunAlt, elevBottom, elevTop) {
  // Colour stops placed at the projected height of each elevation, so the
  // sky colour is a function of elevation rather than of screen position.
  const g = ctx.createLinearGradient(0, y + h, 0, y);
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const e = lerp(elevBottom, elevTop, i / steps);
    const p = project(e, yawDeg, cam);
    if (!p) continue;
    const sy = cy - p.y;
    const t = clamp01((y + h - sy) / h);
    g.addColorStop(t, rgba(skyColour(e, sunAlt)));
  }
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function paintGlow(ctx, sx, sy, frameH, sunAlt, fluxRatio) {
  const [, glow] = sunRamp(sunAlt);
  const low = 1 - clamp01(sunAlt / 25);           // stronger glow nearer the horizon
  const f = clamp01(fluxRatio);

  const wide = ctx.createRadialGradient(sx, sy, 0, sx, sy, frameH * 0.9);
  wide.addColorStop(0, rgba(glow, (0.20 + 0.35 * low) * f));
  wide.addColorStop(0.35, rgba(glow, (0.07 + 0.14 * low) * f));
  wide.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = wide;
  ctx.fillRect(sx - frameH, sy - frameH, frameH * 2, frameH * 2);

  const r = frameH * 0.07;
  const core = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
  core.addColorStop(0, rgba(glow, 0.55 * f));
  core.addColorStop(1, rgba(glow, 0));
  ctx.fillStyle = core;
  ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
}

function paintSea(ctx, horizonPts, x, y, w, h, sunAlt) {
  const [, horizon] = skyRamp(sunAlt);
  const top = mix(horizon, hex('#0b2233'), 0.74);
  const bottom = hex('#06111a');
  const hy = horizonPts.reduce((m, p) => Math.min(m, p.y), Infinity);
  const g = ctx.createLinearGradient(0, hy, 0, y + h);
  g.addColorStop(0, rgba(top));
  g.addColorStop(1, rgba(bottom));

  ctx.beginPath();
  ctx.moveTo(x - 2, y + h + 2);
  horizonPts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(x + w + 2, y + h + 2);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();

  ctx.beginPath();
  horizonPts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.strokeStyle = rgba(mix(horizon, [255, 255, 255], 0.25), 0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** A "nice" angular scale-bar length, in degrees, near a target. */
function niceArc(targetDeg) {
  const options = [1 / 60, 2 / 60, 5 / 60, 10 / 60, 15 / 60, 30 / 60, 1, 2, 5];
  return options.reduce((best, o) => (Math.abs(o - targetDeg) < Math.abs(best - targetDeg) ? o : best));
}
const arcLabel = (deg) => (deg >= 1 ? `${deg}°` : `${Math.round(deg * 60)}′`);

// --- Public ----------------------------------------------------------------------

/**
 * @param {ReturnType<import('./stage.js').createStage>} stage
 * @param {object} f  Frame description. All angles in degrees, all apparent.
 * @param {number} f.focalMm
 * @param {number} f.horizonFraction   Horizon height above the frame bottom, 0..1.
 * @param {number} f.yawDeg            Azimuth the camera faces.
 * @param {number} f.sunAltDeg         Apparent altitude of the Sun's centre.
 * @param {number} f.sunAzDeg
 * @param {number} f.sunHRadiusDeg     Apparent horizontal angular radius.
 * @param {number} f.sunVRadiusDeg     Apparent vertical angular radius.
 * @param {number} f.ghostRadiusDeg    Angular radius at the start of the window.
 * @param {number} f.fluxRatio         (current angular area) / (starting angular area).
 * @param {number} f.horizonAltDeg     Apparent altitude of the visible horizon.
 * @param {number} f.loupeMm
 * @param {string} f.ghostLabel
 */
export function drawCamera(stage, f) {
  const ctx = stage.begin();
  const W = stage.width, H = stage.height;
  if (W < 20 || H < 20) return;

  // Layout. Given the room, the loupe becomes a full-height panel beside the
  // frame rather than a small inset on top of it: the disc is what the page is
  // about, so it gets real estate. On a narrow pane there is not enough width
  // for both, and it falls back to an inset in the corner.
  const sideBySide = W - H >= 260;
  const loupeW = sideBySide ? Math.round(Math.min(H, W * 0.45)) : 0;
  const main = { x: 0, y: 0, w: W - loupeW, h: H };

  const pitch = pitchForHorizonFractionDeg(f.focalMm, f.horizonFraction);
  const cam = { basis: cameraBasis(f.yawDeg, pitch), fPx: focalPx(f.focalMm, main.h) };
  const cx = main.x + main.w / 2, cy = main.y + main.h / 2;
  const vfov = verticalFovDeg(f.focalMm);
  const halfH = Math.min(85, Math.atan((main.w / 2) / cam.fPx) * 180 / Math.PI + 2);

  ctx.save();
  ctx.beginPath();
  ctx.rect(main.x, main.y, main.w, main.h);
  ctx.clip();

  paintSky(ctx, main.x, main.y, main.w, main.h, cam, cx, cy, f.yawDeg, f.sunAltDeg,
    pitch - vfov / 2 - 1, pitch + vfov / 2 + 1);

  // Sun and its glow. Drawn before the sea, so the horizon occludes it.
  const sunCentre = project(f.sunAltDeg, f.sunAzDeg, cam);
  if (sunCentre) {
    const sx = cx + sunCentre.x, sy = cy - sunCentre.y;
    paintGlow(ctx, sx, sy, main.h, f.sunAltDeg, f.fluxRatio);
    const disc = discPath(cam, cx, cy, f.sunAltDeg, f.sunAzDeg, f.sunHRadiusDeg, f.sunVRadiusDeg);
    if (disc) {
      tracePolygon(ctx, disc);
      ctx.fillStyle = rgba(sunRamp(f.sunAltDeg)[0]);
      ctx.fill();
    }
  }

  const horizonPts = altitudeLine(cam, cx, cy, f.horizonAltDeg, f.yawDeg, halfH);
  if (horizonPts.length > 1) paintSea(ctx, horizonPts, main.x, main.y, main.w, main.h, f.sunAltDeg);

  // Outline of what the loupe is showing.
  const loupeVfov = verticalFovDeg(f.loupeMm);
  if (sunCentre) {
    const half = cam.fPx * Math.tan((loupeVfov / 2) * Math.PI / 180);
    const sx = cx + sunCentre.x, sy = cy - sunCentre.y;
    if (half > 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(sx - half) + 0.5, Math.round(sy - half) + 0.5,
        Math.round(half * 2), Math.round(half * 2));
    }
  }

  // Elevation scale down the left edge, projected through the same lens.
  ctx.font = font(10);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const step = vfov > 30 ? 10 : vfov > 12 ? 5 : vfov > 5 ? 2 : 1;
  for (let e = 0; e <= 89; e += step) {
    const p = project(e, f.yawDeg, cam);
    if (!p) continue;
    const y = cy - p.y;
    if (y < 8 || y > main.h - 6) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(6, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`${e}°`, 9, y);
  }

  ctx.restore();

  if (sideBySide) {
    drawLoupe(ctx, { x: main.w, y: 0, w: loupeW, h: H }, f, { radius: 0 });
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(main.w) + 0.5, 0);
    ctx.lineTo(Math.round(main.w) + 0.5, H);
    ctx.stroke();
  } else {
    const S = Math.round(Math.max(96, Math.min(230, Math.min(W * 0.34, H * 0.62))));
    drawLoupe(ctx, { x: W - S - 10, y: 10, w: S, h: S }, f, { radius: 8 });
  }
}

/**
 * The loupe: a long lens aimed straight at the Sun, filling the given rect.
 * Its focal length refers to the rect's height, the same convention the main
 * view uses, so a non-square panel simply sees more sky left and right.
 */
function drawLoupe(ctx, r, f, { radius = 8 } = {}) {
  const cam = { basis: cameraBasis(f.sunAzDeg, f.sunAltDeg), fPx: focalPx(f.loupeMm, r.h) };
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const vfov = verticalFovDeg(f.loupeMm);
  const hfov = Math.atan((r.w / 2) / cam.fPx) * 180 / Math.PI;

  ctx.save();
  ctx.beginPath();
  if (radius > 0) ctx.roundRect(r.x, r.y, r.w, r.h, radius);
  else ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();

  paintSky(ctx, r.x, r.y, r.w, r.h, cam, cx, cy, f.sunAzDeg, f.sunAltDeg,
    f.sunAltDeg - vfov, f.sunAltDeg + vfov);
  paintGlow(ctx, cx, cy, r.h * 0.9, f.sunAltDeg, f.fluxRatio);

  const disc = discPath(cam, cx, cy, f.sunAltDeg, f.sunAzDeg, f.sunHRadiusDeg, f.sunVRadiusDeg);
  if (disc) {
    tracePolygon(ctx, disc);
    ctx.fillStyle = rgba(sunRamp(f.sunAltDeg)[0]);
    ctx.fill();
  }

  const horizonPts = altitudeLine(cam, cx, cy, f.horizonAltDeg, f.sunAzDeg, Math.max(hfov * 1.2, vfov));
  if (horizonPts.some((p) => p.y < r.y + r.h + 2)) {
    paintSea(ctx, horizonPts, r.x, r.y, r.w, r.h, f.sunAltDeg);
  }

  // Ghost ring: the true angular size at the start of the window. Two-tone so
  // it reads over the bright disc as well as over the sky.
  const ghost = discPath(cam, cx, cy, f.sunAltDeg, f.sunAzDeg, f.ghostRadiusDeg, f.ghostRadiusDeg);
  if (ghost) {
    tracePolygon(ctx, ghost);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Scrims, so labels read against any sky.
  const top = ctx.createLinearGradient(0, r.y, 0, r.y + 24);
  top.addColorStop(0, 'rgba(0,0,0,0.38)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(r.x, r.y, r.w, 24);
  const bottom = ctx.createLinearGradient(0, r.y + r.h - 28, 0, r.y + r.h);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = bottom;
  ctx.fillRect(r.x, r.y + r.h - 28, r.w, 28);

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = font(10.5, 600);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${f.loupeMm} mm loupe`, r.x + 8, r.y + 7);

  // Scale bar
  const arc = niceArc(vfov * 0.2);
  const len = cam.fPx * Math.tan(arc * Math.PI / 180);
  const by = r.y + r.h - 10;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(r.x + 9, by - 3); ctx.lineTo(r.x + 9, by);
  ctx.lineTo(r.x + 9 + len, by); ctx.lineTo(r.x + 9 + len, by - 3);
  ctx.stroke();
  ctx.font = font(10);
  ctx.textBaseline = 'bottom';
  ctx.fillText(arcLabel(arc), r.x + 9 + len + 5, by + 2);

  // Ghost key. Shortened when the loupe is a small inset rather than a panel.
  const key = r.w < 200 ? f.ghostLabel.replace('size at ', '') : f.ghostLabel;
  ctx.textAlign = 'right';
  ctx.fillText(key, r.x + r.w - 8, by + 2);
  const kw = ctx.measureText(key).width;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.moveTo(r.x + r.w - 8 - kw - 19, by - 4);
  ctx.lineTo(r.x + r.w - 8 - kw - 6, by - 4);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();

  if (radius > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, radius);
    ctx.stroke();
  }
}
