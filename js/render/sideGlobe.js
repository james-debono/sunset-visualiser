/**
 * Globe side view.
 *
 * Two panels. The detail view zooms onto the Earth in the plane containing
 * Earth's centre, the observer and the Sun -- for an equatorial observer at an
 * equinox, the equatorial plane seen from above the north pole, so the Earth
 * turns counter-clockwise. The overview shows the Sun and Earth far apart,
 * labelled as not to scale, with the true-scale sizes stated.
 *
 * The Sun is placed to the right, so that as the Earth turns counter-clockwise
 * the observer rides up over the top of the globe towards sunset and stands
 * upright on the page.
 *
 * In the detail view sizes are schematic but every angle is exact:
 *   - the observer sits psi degrees round from the subsolar point, where psi is
 *     the geocentric zenith distance of the Sun (90 deg minus its altitude);
 *   - sunlight arrives as parallel rays, which at 150 million km it is, to
 *     within 0.005 deg across the entire Earth;
 *   - the local horizon is the tangent to the circle at the observer, so the
 *     angle between it and the ray to the Sun is exactly the Sun's altitude.
 *
 * Coordinates: angles are measured counter-clockwise from +x in a y-up frame,
 * the Sun lies in the +x direction, and screen y is flipped at draw time.
 */

import { AU_KM, R_SUN_KM } from '../physics/constants.js';
import { R_EARTH_KM } from '../physics/solar.js';
import { haloText, arrowHead, font } from './stage.js';

const D2R = Math.PI / 180;

/**
 * @param {ReturnType<import('./stage.js').createStage>} stage
 * @param {object} v
 * @param {number} v.centralAngleDeg       psi now
 * @param {{psi:number,label:string}[]} v.marks  hour marks along the path
 * @param {number} v.startPsi
 * @param {number} v.endPsi
 * @param {string} v.angleLabel            text for the angle callout
 * @param {number} v.pitchDeg              camera pitch above the horizon
 * @param {number} v.vfovDeg               camera vertical field of view
 * @param {string} v.auLabel               e.g. "1.0034 AU"
 * @param {string} v.distanceLabel         e.g. "150,111,976 km"
 * @param {number} v.reserveLeft           px kept clear on the left for the readout
 * @param {object} t                       theme tokens
 */
export function drawGlobeSide(stage, v, t) {
  const ctx = stage.begin();
  const W = stage.width, H = stage.height;
  if (W < 40 || H < 40) return;

  const wide = W / H >= 1.45 && W >= 620;
  const dt = wide ? { x: 0, y: 0, w: W * 0.68, h: H } : { x: 0, y: 0, w: W, h: H * 0.7 };
  const ov = wide ? { x: W * 0.68, y: 0, w: W * 0.32, h: H } : { x: 0, y: H * 0.7, w: W, h: H * 0.3 };

  ctx.strokeStyle = t.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (wide) { ctx.moveTo(Math.round(ov.x) + 0.5, 12); ctx.lineTo(Math.round(ov.x) + 0.5, H - 12); }
  else { ctx.moveTo(12, Math.round(ov.y) + 0.5); ctx.lineTo(W - 12, Math.round(ov.y) + 0.5); }
  ctx.stroke();

  const detailEarth = drawDetail(ctx, dt, v, t, wide);
  drawOverview(ctx, ov, v, t, detailEarth, wide);
}

function drawOverview(ctx, r, v, t, detailEarth, wide) {
  const rs = Math.max(8, Math.min(r.h * 0.13, r.w * 0.085));
  const midY = r.y + (wide ? r.h * 0.36 : r.h * 0.42);
  const re = Math.max(3.5, rs * 0.24);
  const ex = r.x + (wide ? 30 : 60);
  const sx = r.x + r.w - 16 - rs;

  // Sun
  const g = ctx.createRadialGradient(sx, midY, 0, sx, midY, rs * 2.2);
  g.addColorStop(0, t.sun);
  g.addColorStop(0.45, t.sun);
  g.addColorStop(0.46, 'rgba(242,165,31,0.18)');
  g.addColorStop(1, 'rgba(242,165,31,0)');
  ctx.fillStyle = g;
  ctx.fillRect(sx - rs * 2.2, midY - rs * 2.2, rs * 4.4, rs * 4.4);

  // The gap between them
  ctx.strokeStyle = t.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ex + re + 6, midY);
  ctx.lineTo(sx - rs - 6, midY);
  ctx.stroke();
  const gapPx = sx - ex;
  const mx = (sx + ex) / 2;
  haloText(ctx, 'Sun', sx, midY + rs + 14, { fill: t['ink-2'], halo: t.surface, align: 'center', size: 11 });
  haloText(ctx, v.auLabel, mx, midY - 7, { fill: t.ink, halo: t.surface, align: 'center', size: 11, weight: 600 });
  haloText(ctx, v.distanceLabel, mx, midY + 15, { fill: t['ink-2'], halo: t.surface, align: 'center', size: 10.5 });

  // Earth, day side towards the Sun
  ctx.fillStyle = t['earth-night'];
  ctx.beginPath(); ctx.arc(ex, midY, re, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = t['earth-day'];
  ctx.beginPath(); ctx.arc(ex, midY, re, -Math.PI / 2, Math.PI / 2); ctx.fill();
  haloText(ctx, 'Earth', ex, midY + rs + 14, { fill: t['ink-2'], halo: t.surface, align: 'center', size: 11 });

  // Zoom box, with lines that stop at the divider.
  const box = re * 2.6;
  ctx.strokeStyle = t.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(ex - box) + 0.5, Math.round(midY - box) + 0.5, Math.round(box * 2), Math.round(box * 2));
  if (detailEarth) {
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    if (wide) {
      ctx.moveTo(ex - box, midY - box); ctx.lineTo(r.x, detailEarth.y - detailEarth.r * 1.25);
      ctx.moveTo(ex - box, midY + box); ctx.lineTo(r.x, detailEarth.y + detailEarth.r * 1.25);
    } else {
      ctx.moveTo(ex - box, midY - box); ctx.lineTo(detailEarth.x - detailEarth.r * 1.25, r.y);
      ctx.moveTo(ex + box, midY - box); ctx.lineTo(detailEarth.x + detailEarth.r * 1.25, r.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // What "not to scale" is hiding, in numbers.
  const trueSun = gapPx * (2 * R_SUN_KM) / AU_KM;
  const trueEarth = gapPx * (2 * R_EARTH_KM) / AU_KM;
  const fmt = (x) => (x >= 1 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3));
  const lines = ['Not to scale. At true scale on this gap:', `Sun ${fmt(trueSun)} px wide, Earth ${fmt(trueEarth)} px.`];
  const y0 = wide ? r.y + r.h - 34 : r.y + r.h - 22;
  lines.forEach((line, i) => {
    haloText(ctx, line, r.x + 14, y0 + i * 14, { fill: t.muted, halo: t.surface, size: 10.5 });
  });
}

function drawDetail(ctx, r, v, t, wide) {
  const reserve = Math.min(v.reserveLeft || 0, r.w * 0.45);
  const avail = r.w - reserve;
  const R = Math.max(20, Math.min(r.h * 0.30, avail * 0.27));
  const cx = r.x + reserve + avail * 0.36;
  const cy = r.y + r.h * 0.60;
  const S = (a, rad) => ({ x: cx + rad * Math.cos(a * D2R), y: cy - rad * Math.sin(a * D2R) });
  const right = r.x + r.w - (wide ? 10 : 12);

  // Parallel sunlight, arriving from the right, kept below the Earth's centre
  // so it never runs along the observer's own line to the Sun.
  ctx.strokeStyle = t.sun;
  ctx.fillStyle = t.sun;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  for (const k of [0.15, 0.5, 0.85]) {
    const yy = cy + k * R;
    const xEnd = cx + Math.sqrt(Math.max(0, R * R - (k * R) ** 2)) + 4;
    ctx.beginPath();
    ctx.moveTo(right, yy);
    ctx.lineTo(xEnd, yy);
    ctx.stroke();
    arrowHead(ctx, xEnd, yy, -1, 0, 5);
  }
  ctx.globalAlpha = 1;
  haloText(ctx, 'parallel sunlight', right, cy + 0.85 * R + 16, { fill: t.muted, halo: t.surface, size: 10.5, align: 'right' });

  // Earth
  ctx.fillStyle = t['earth-night'];
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = t['earth-day'];
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2); ctx.fill();

  // Rotation arrow: counter-clockwise, seen from above the north pole. It runs
  // along the lower half, clear of the observer on top.
  const rr = R * 0.5;
  ctx.strokeStyle = t['ink-2'];
  ctx.fillStyle = t['ink-2'];
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 140 * D2R, 40 * D2R, true);
  ctx.stroke();
  const tipA = 320;
  const tip = S(tipA, rr);
  arrowHead(ctx, tip.x, tip.y, -Math.sin(tipA * D2R), -Math.cos(tipA * D2R), 6);
  ctx.font = font(10.5);
  ctx.fillStyle = t.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('rotation', cx, cy + 4);

  // Observer's path over the window.
  const phi = v.centralAngleDeg;
  const phi0 = v.startPsi, phi1 = v.endPsi;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = t.axis;
  ctx.beginPath();
  ctx.arc(cx, cy, R, -phi0 * D2R, -phi1 * D2R, true);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = t.globe;
  ctx.beginPath();
  ctx.arc(cx, cy, R, -phi0 * D2R, -phi * D2R, true);
  ctx.stroke();
  ctx.lineCap = 'butt';

  // Hour ticks outside the path; first and last labelled inside the disc,
  // where the observer's lines never reach.
  v.marks.forEach((m, i) => {
    const a = m.psi;
    const p0 = S(a, R), p1 = S(a, R + 5);
    ctx.strokeStyle = t['ink-2'];
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    if (i === 0 || i === v.marks.length - 1) {
      const c = Math.cos(a * D2R), sn = Math.sin(a * D2R);
      const pl = S(a, R - 9);
      ctx.font = font(10);
      ctx.fillStyle = t.ink;
      ctx.textAlign = c > 0.3 ? 'right' : c < -0.3 ? 'left' : 'center';
      ctx.textBaseline = sn > 0.9 ? 'top' : sn < -0.9 ? 'bottom' : 'middle';
      ctx.fillText(m.label, pl.x, pl.y);
    }
  });

  const obs = S(phi, R);
  const tAng = phi - 90;                          // sunward tangent direction
  const alt = -tAng;                              // = 90 - psi, exact

  // Camera field of view. Elevation e above the local horizon is the direction
  // tAng + e, i.e. rotated from the tangent towards the local zenith.
  const wedgeLen = R * 0.95;
  const a0 = tAng + v.pitchDeg - v.vfovDeg / 2, a1 = tAng + v.pitchDeg + v.vfovDeg / 2;
  ctx.fillStyle = t.fov;
  ctx.beginPath();
  ctx.moveTo(obs.x, obs.y);
  ctx.arc(obs.x, obs.y, wedgeLen, -a0 * D2R, -a1 * D2R, true);
  ctx.closePath();
  ctx.fill();
  // Labelled just beyond the rim at the wedge's lower edge: its upper edge and
  // axis both pass close to the line to the Sun during the window.
  const camA = a0 - 4;
  haloText(ctx, 'camera', obs.x + (wedgeLen + 8) * Math.cos(camA * D2R), obs.y - (wedgeLen + 8) * Math.sin(camA * D2R) + 4,
    { fill: t.muted, halo: t.surface, size: 10, align: 'left' });

  // Local horizon: the tangent at the observer.
  const L = R * 0.9;
  const hx = Math.cos(tAng * D2R), hy = Math.sin(tAng * D2R);
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(obs.x - hx * L, obs.y + hy * L);
  ctx.lineTo(obs.x + hx * L, obs.y - hy * L);
  ctx.stroke();
  const far = { x: obs.x - hx * (L + 5), y: obs.y + hy * (L + 5) };
  haloText(ctx, 'horizon', far.x, far.y - 4, { fill: t['ink-2'], halo: t.surface, size: 10.5, align: 'right' });

  // Line to the Sun: parallel to the incoming light, so due +x.
  ctx.strokeStyle = t.sun;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(obs.x, obs.y);
  ctx.lineTo(right, obs.y);
  ctx.stroke();
  ctx.fillStyle = t.sun;
  arrowHead(ctx, right, obs.y, 1, 0, 7);
  haloText(ctx, 'to Sun', right - 10, obs.y - 8, { fill: t['ink-2'], halo: t.surface, size: 10.5, align: 'right' });

  // Angle between the horizon and the line to the Sun.
  const ra = Math.max(24, R * 0.55);
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(obs.x, obs.y, ra, -tAng * D2R, 0, alt >= 0);
  ctx.stroke();
  const mid = tAng / 2;
  haloText(ctx, v.angleLabel, obs.x + (ra + 8) * Math.cos(mid * D2R), obs.y - (ra + 8) * Math.sin(mid * D2R) + 4,
    { fill: t.ink, halo: t.surface, size: 12, weight: 650, align: 'left' });

  // Observer, standing radially on the surface.
  const ux = Math.cos(phi * D2R), uy = Math.sin(phi * D2R);
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(obs.x, obs.y);
  ctx.lineTo(obs.x + ux * 11, obs.y - uy * 11);
  ctx.stroke();
  ctx.fillStyle = t.ink;
  ctx.beginPath();
  ctx.arc(obs.x + ux * 14, obs.y - uy * 14, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = t.globe;
  ctx.beginPath();
  ctx.arc(obs.x, obs.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = t.surface;
  ctx.lineWidth = 2;
  ctx.stroke();

  haloText(ctx, 'The Sun stays put. The horizon tips up past it.', r.x + 12, r.y + r.h - 12,
    { fill: t['ink-2'], halo: t.surface, size: 11 });

  return { x: cx, y: cy, r: R };
}
