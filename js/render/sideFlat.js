/**
 * Flat Earth side view.
 *
 * Drawn to a single scale on both axes, so every angle on screen is the true
 * angle, and a protractor held to the monitor will agree with the label. The
 * scale is fixed for the whole window (it depends on the Sun's height and
 * start position, not on the current time), so the Sun visibly recedes.
 *
 * Laid out to match the globe side view: observer on the left, Sun to the
 * right. The observer's eye is 1.7 m up, which is zero at this scale, so every
 * angle is measured from a vertex on the ground line.
 *
 * The one concession to visibility: at most heights the Sun is a few km across
 * against thousands of km of sky, i.e. less than a pixel. When that happens it
 * is drawn at a minimum size and the enlargement factor is reported. Its
 * position, and the line of sight to its centre, are never adjusted.
 */

import { haloText, font } from './stage.js';

const D2R = Math.PI / 180;

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/**
 * Layout and scale for a given canvas size. Exported so the caller can report
 * the drawing scale and Sun enlargement alongside the other readouts.
 */
export function flatSideLayout(W, H, v) {
  const padR = 20, padT = 24, padB = 30;
  const padL = Math.max(24, v.reserveLeft || 0);
  const obsX = padL;
  const groundY = H - padB;
  const xMax = Math.max(v.endHorizontalKm, v.startHorizontalKm) * 1.04;
  const s = Math.max(1e-9, Math.min((W - padR - obsX) / xMax, (groundY - padT) / (v.heightKm * 1.06)));
  const trueR = v.sunRadiusKm * s;
  const drawR = Math.max(trueR, 4.5);
  return {
    padL, padT, padB, padR, obsX, groundY, s, trueR, drawR,
    kmPerPx: 1 / s,
    enlarge: drawR / Math.max(trueR, 1e-12),
  };
}

/**
 * @param {ReturnType<import('./stage.js').createStage>} stage
 * @param {object} v
 * @param {number} v.heightKm
 * @param {number} v.horizontalKm       now
 * @param {number} v.startHorizontalKm
 * @param {number} v.endHorizontalKm    at the end of the timeline
 * @param {number} v.sunRadiusKm
 * @param {string} v.angleLabel
 * @param {number} v.pitchDeg
 * @param {number} v.vfovDeg
 * @param {{x:number,label:string}[]} v.marks
 * @param {'km'|'mi'} v.tickUnit
 * @param {number} v.kmPerTickUnit
 * @param {string} v.hLabel
 * @param {string} v.xLabel
 * @param {string} v.dLabel
 * @param {number} v.reserveLeft        px kept clear on the left for the readout
 * @param {object} t                    theme tokens
 */
export function drawFlatSide(stage, v, t) {
  const ctx = stage.begin();
  const W = stage.width, H = stage.height;
  if (W < 60 || H < 60) return;

  const { padR, obsX, groundY, s, drawR } = flatSideLayout(W, H, v);
  const X = (km) => obsX + km * s;
  const Y = (km) => groundY - km * s;

  // Camera field of view, drawn first so the ground covers anything below 0 deg.
  const wedge = Math.min(groundY * 0.8, 160);
  const e0 = v.pitchDeg - v.vfovDeg / 2, e1 = v.pitchDeg + v.vfovDeg / 2;
  ctx.fillStyle = t.fov;
  ctx.beginPath();
  ctx.moveTo(obsX, groundY);
  ctx.arc(obsX, groundY, wedge, -e0 * D2R, -e1 * D2R, true);
  ctx.closePath();
  ctx.fill();

  // Ground
  ctx.fillStyle = t.ground;
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = t.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(groundY) + 0.5);
  ctx.lineTo(W, Math.round(groundY) + 0.5);
  ctx.stroke();

  // Distance ticks from the observer, in the chosen unit.
  const unitSpan = (W - padR - obsX) / s / v.kmPerTickUnit;
  const step = niceStep(unitSpan / 5);
  ctx.font = font(10);
  ctx.textBaseline = 'top';
  for (let u = 0; X(u * v.kmPerTickUnit) <= W - 8; u += step) {
    const x = X(u * v.kmPerTickUnit);
    ctx.strokeStyle = t.axis;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, groundY);
    ctx.lineTo(Math.round(x) + 0.5, groundY + 4);
    ctx.stroke();
    ctx.fillStyle = t.muted;
    ctx.textAlign = u === 0 ? 'left' : 'center';
    ctx.fillText(u === 0 ? `0 ${v.tickUnit}` : u.toLocaleString(), u === 0 ? x - 2 : x, groundY + 7);
  }

  const sunY = Y(v.heightKm);
  const sx0 = X(v.startHorizontalKm), sx1 = X(v.endHorizontalKm), sx = X(v.horizontalKm);

  // Sun path: planned, and travelled so far.
  ctx.strokeStyle = t.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx0, sunY);
  ctx.lineTo(sx1, sunY);
  ctx.stroke();
  ctx.strokeStyle = t.flat;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx0, sunY);
  ctx.lineTo(sx, sunY);
  ctx.stroke();
  ctx.lineCap = 'butt';

  ctx.lineWidth = 1;
  for (const m of v.marks) {
    const x = X(m.x);
    ctx.strokeStyle = t['ink-2'];
    ctx.beginPath();
    ctx.moveTo(x, sunY - 4);
    ctx.lineTo(x, sunY + 4);
    ctx.stroke();
    haloText(ctx, m.label, x, sunY - 8, { fill: t.muted, halo: t.surface, size: 10, align: 'center' });
  }

  // Starting position, as a ghost.
  ctx.setLineDash([3, 2]);
  ctx.strokeStyle = t.muted;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx0, sunY, drawR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Drop line
  ctx.strokeStyle = t.muted;
  ctx.beginPath();
  ctx.moveTo(sx, sunY + drawR + 2);
  ctx.lineTo(sx, groundY);
  ctx.stroke();

  // Line of sight
  ctx.strokeStyle = t.sun;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(obsX, groundY);
  ctx.lineTo(sx, sunY);
  ctx.stroke();

  // Angle between the ground and the line of sight
  const alt = Math.atan2(v.heightKm, v.horizontalKm) / D2R;
  const ra = Math.min(54, (W - padR - obsX) * 0.25);
  ctx.strokeStyle = t.ink;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(obsX, groundY);
  ctx.lineTo(obsX + ra + 8, groundY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(obsX, groundY, ra, 0, -alt * D2R, true);
  ctx.stroke();

  // Sun
  const glow = ctx.createRadialGradient(sx, sunY, 0, sx, sunY, drawR * 3.2);
  glow.addColorStop(0, 'rgba(242,165,31,0.35)');
  glow.addColorStop(1, 'rgba(242,165,31,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - drawR * 3.2, sunY - drawR * 3.2, drawR * 6.4, drawR * 6.4);
  ctx.fillStyle = t.sun;
  ctx.beginPath();
  ctx.arc(sx, sunY, drawR, 0, Math.PI * 2);
  ctx.fill();

  // Labels last, so their halos sit over the lines.
  const midA = (alt / 2) * D2R;
  haloText(ctx, v.angleLabel, obsX + (ra + 10) * Math.cos(midA), groundY - (ra + 10) * Math.sin(midA) + 4,
    { fill: t.ink, halo: t.surface, size: 12, weight: 650, align: 'left' });

  // Height label on the far side of the drop line from the line of sight,
  // unless that would push it off the right edge.
  const hLabelY = Math.max(sunY + drawR + 16, (sunY + groundY) / 2);
  const nearRight = sx > W - padR - 100;
  haloText(ctx, v.hLabel, sx + (nearRight ? -6 : 6), hLabelY,
    { fill: t['ink-2'], halo: t.surface, size: 10.5, align: nearRight ? 'right' : 'left' });

  haloText(ctx, v.dLabel, (obsX + sx) / 2 - 6, (groundY + sunY) / 2 - 6,
    { fill: t['ink-2'], halo: t.surface, size: 10.5, align: 'right' });

  // The x label starts after the angle label, whose width we measure.
  ctx.font = font(12, 650);
  const xSpanLeft = obsX + (ra + 10) * Math.cos(midA) + ctx.measureText(v.angleLabel).width + 10;
  ctx.font = font(10.5);
  if (sx - xSpanLeft > ctx.measureText(v.xLabel).width + 16) {
    haloText(ctx, v.xLabel, (sx + xSpanLeft) / 2, groundY - 5, { fill: t['ink-2'], halo: t.surface, size: 10.5, align: 'center' });
  }

  // Observer
  ctx.strokeStyle = t.ink;
  ctx.fillStyle = t.ink;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.moveTo(obsX, groundY);
  ctx.lineTo(obsX, groundY - 11);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(obsX, groundY - 14, 3, 0, Math.PI * 2);
  ctx.fill();
}
