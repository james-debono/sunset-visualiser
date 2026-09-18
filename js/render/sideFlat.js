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
/** Side of the plan-view inset, and 0 when there is no inset to draw. */
export function planInsetSize(W, H, plan) {
  if (!plan) return 0;
  // At least as tall as the readout it sits opposite, and otherwise as much of
  // the pane as it can have without crowding the elevation drawing.
  const wanted = Math.max(plan.size || 0, H * 0.9, 130);
  return Math.round(Math.max(110, Math.min(wanted, H - 16, W * 0.3)));
}

export function flatSideLayout(W, H, v) {
  const inset = planInsetSize(W, H, v.plan);
  const padR = 20 + (inset ? inset + 14 : 0), padT = 24, padB = 30;
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
 * @param {object} [v.plan]             map geometry for the plan inset, if any
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

  // Distance ticks from the observer, in the chosen unit. They stop at the edge
  // of the drawing rather than running on under the plan inset, and the step is
  // wide enough that the labels cannot touch.
  const drawRight = W - padR + 8;
  const unitSpan = (drawRight - obsX) / s / v.kmPerTickUnit;
  const minSpacingPx = 58;
  const step = niceStep(Math.max(unitSpan / 5, minSpacingPx / (s * v.kmPerTickUnit)));
  ctx.font = font(10);
  ctx.textBaseline = 'top';
  for (let u = 0; X(u * v.kmPerTickUnit) <= drawRight; u += step) {
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

  // When the Sun is far off and low the triangle is too shallow to hold a
  // label inside it, so the measurements go into the open sky above the path
  // rather than on top of the lines.
  if (groundY - sunY < 70) {
    haloText(ctx, v.hLabel, sx, sunY - 24,
      { fill: t['ink-2'], halo: t.surface, size: 10.5, align: 'center' });
    haloText(ctx, v.dLabel, (obsX + sx) / 2, sunY - 40,
      { fill: t['ink-2'], halo: t.surface, size: 10.5, align: 'center' });
  } else {
    // Height label on the far side of the drop line from the line of sight,
    // unless that would push it off the right edge.
    const hLabelY = Math.max(sunY + drawR + 16, (sunY + groundY) / 2);
    const nearRight = sx > W - padR - 100;
    haloText(ctx, v.hLabel, sx + (nearRight ? -6 : 6), hLabelY,
      { fill: t['ink-2'], halo: t.surface, size: 10.5, align: nearRight ? 'right' : 'left' });
    haloText(ctx, v.dLabel, (obsX + sx) / 2 - 6, (groundY + sunY) / 2 - 6,
      { fill: t['ink-2'], halo: t.surface, size: 10.5, align: 'right' });
  }

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

  if (v.plan) drawPlanInset(ctx, W, H, v.plan, t);
}

/**
 * Plan view of the flat-Earth map, drawn only for the Gleason path.
 *
 * The whole disc as these maps print it: north pole at the centre, the equator
 * halfway out, and the south pole smeared around the rim. On top of that go
 * the Sun's daily circle, the observer, and the line between them.
 *
 * It is here because the elevation view beside it cannot show the thing this
 * model gets most obviously wrong: the Sun does not recede in a straight line,
 * it swings around, and by sunset its bearing is tens of degrees away from
 * where the Sun is actually seen to set.
 *
 * The observer sits at the bottom of the disc so the pole is up the page.
 */
function drawPlanInset(ctx, W, H, plan, t) {
  const S = planInsetSize(W, H, plan);
  const x = W - S - 12, y = Math.round((H - S) / 2);
  const cx = x + S / 2, cy = y + S / 2;
  const pad = 18;
  // Always scaled to the whole disc, so the map looks the same wherever the
  // observer stands and the rim means what it means on the printed map.
  const scale = (S / 2 - pad) / plan.rimRadiusKm;

  // Map angle 0 is the observer's meridian; put it at the bottom of the inset.
  const at = (radiusKm, angleDeg) => {
    const a = (angleDeg + 90) * D2R;
    return { x: cx + radiusKm * scale * Math.cos(a), y: cy + radiusKm * scale * Math.sin(a) };
  };

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, S, S, 8);
  ctx.fillStyle = t.surface;
  ctx.fill();
  ctx.clip();

  // The disc itself, then the equator, then the Sun's circle.
  ctx.fillStyle = t['earth-day'];
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, plan.rimRadiusKm * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = t['ink-2'];
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, plan.rimRadiusKm * scale, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = t.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, plan.equatorRadiusKm * scale, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = t.muted;
  ctx.beginPath();
  ctx.arc(cx, cy, plan.sunRadiusKm * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // The arc the Sun has covered so far.
  ctx.strokeStyle = t.flat;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, plan.sunRadiusKm * scale,
    (-plan.startHourAngleDeg + 90) * D2R, (-plan.hourAngleDeg + 90) * D2R, true);
  ctx.stroke();

  const obs = at(plan.observerRadiusKm, 0);
  const sun = at(plan.sunRadiusKm, -plan.hourAngleDeg);

  ctx.strokeStyle = t.sun;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(obs.x, obs.y);
  ctx.lineTo(sun.x, sun.y);
  ctx.stroke();

  // Pole, observer, Sun.
  ctx.fillStyle = t.muted;
  ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = t.ink;
  ctx.beginPath(); ctx.arc(obs.x, obs.y, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = t.sun;
  ctx.beginPath(); ctx.arc(sun.x, sun.y, 4, 0, Math.PI * 2); ctx.fill();

  haloText(ctx, 'N', cx + 6, cy + 3, { fill: t.muted, halo: t['earth-day'], align: 'left', size: 9.5 });
  haloText(ctx, 'equator', cx, cy - plan.equatorRadiusKm * scale - 4,
    { fill: t.muted, halo: t['earth-day'], align: 'center', size: 9 });
  haloText(ctx, 'you', obs.x, obs.y + 13, { fill: t['ink-2'], halo: t.surface, align: 'center', size: 9.5 });
  const sunRight = sun.x < cx;
  haloText(ctx, 'Sun', sun.x + (sunRight ? 7 : -7), sun.y + 3,
    { fill: t['ink-2'], halo: t.surface, align: sunRight ? 'left' : 'right', size: 9.5 });
  haloText(ctx, 'plan view of the map', x + S / 2, y + S - 6,
    { fill: t.muted, halo: t.surface, align: 'center', size: 10 });

  ctx.restore();
  ctx.strokeStyle = t.hairline || t.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, S - 1, S - 1, 8);
  ctx.stroke();
}
