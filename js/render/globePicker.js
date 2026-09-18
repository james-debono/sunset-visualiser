/**
 * The location picker: a draggable globe you can click to stand somewhere.
 *
 * Deliberately a graticule rather than a map. Coastline data would be a
 * dependency and a download, and nothing here needs it: latitude is what
 * changes a sunset, so the globe shows the equator, the tropics and the polar
 * circles, which are the lines that actually explain the differences. A short
 * list of cities gives the eye something to anchor to.
 *
 * Projection maths lives in js/physics/geo.js and is tested there.
 */

import { orthographic, inverseOrthographic, parallel, meridian } from '../physics/geo.js';
import { font, haloText } from './stage.js';

export const LOCATION_PRESETS = Object.freeze([
  { name: 'Equator', latDeg: 0, lonDeg: 0 },
  { name: 'Singapore', latDeg: 1.35, lonDeg: 103.82 },
  { name: 'Sydney', latDeg: -33.87, lonDeg: 151.21 },
  { name: 'Melbourne', latDeg: -37.81, lonDeg: 144.96 },
  { name: 'Belen, NM', latDeg: 34.66, lonDeg: -106.78 },
  { name: 'Los Angeles', latDeg: 34.05, lonDeg: -118.24 },
  { name: 'New York', latDeg: 40.71, lonDeg: -74.01 },
  { name: 'London', latDeg: 51.51, lonDeg: -0.13 },
  { name: 'Reykjavík', latDeg: 64.13, lonDeg: -21.90 },
]);

/** Latitudes beyond this are refused; see the note in the picker panel. */
export const MAX_LATITUDE = 80;

const CIRCLES = [
  { lat: 0, label: 'equator', emphasis: true },
  { lat: 23.44, label: 'tropic', dashed: true },
  { lat: -23.44, label: 'tropic', dashed: true },
  { lat: 66.56, label: 'polar circle', dashed: true },
  { lat: -66.56, label: 'polar circle', dashed: true },
];

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{onPick: (latDeg:number, lonDeg:number) => void}} opts
 */
export function createGlobePicker(canvas, opts) {
  const ctx = canvas.getContext('2d');
  let view = { lat0: 10, lon0: 0 };     // where the camera is looking from
  let point = { latDeg: 0, lonDeg: 0 }; // where the observer stands
  let tokens = null;
  let dpr = 1;

  const geom = () => {
    const w = canvas.clientWidth || 240;
    const h = canvas.clientHeight || 240;
    return { w, h, cx: w / 2, cy: h / 2, R: Math.min(w, h) / 2 - 14 };
  };

  /** Screen position of a lat/lon, or null when it is round the back. */
  function toScreen(latDeg, lonDeg, g) {
    const p = orthographic(latDeg, lonDeg, view.lat0, view.lon0);
    return { x: g.cx + p.x * g.R, y: g.cy - p.y * g.R, visible: p.visible };
  }

  function strokePath(points, g, { dashed = false, width = 1, colour } = {}) {
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    let pen = false;
    for (const [lat, lon] of points) {
      const s = toScreen(lat, lon, g);
      if (!s.visible) { pen = false; continue; }
      if (pen) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
      pen = true;
    }
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    if (!tokens) return;
    const g = geom();
    const nextDpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(g.w * nextDpr) || canvas.height !== Math.round(g.h * nextDpr)) {
      canvas.width = Math.round(g.w * nextDpr);
      canvas.height = Math.round(g.h * nextDpr);
      dpr = nextDpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);

    // The globe itself, lit from the upper left so it reads as a sphere.
    const grad = ctx.createRadialGradient(
      g.cx - g.R * 0.35, g.cy - g.R * 0.35, g.R * 0.1,
      g.cx, g.cy, g.R,
    );
    grad.addColorStop(0, tokens['earth-day']);
    grad.addColorStop(1, tokens['earth-night']);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.R, 0, Math.PI * 2);
    ctx.fill();

    for (let lon = -180; lon < 180; lon += 30) {
      strokePath(meridian(lon), g, { colour: tokens.axis, width: 0.75 });
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      if (lat === 0) continue;
      strokePath(parallel(lat), g, { colour: tokens.axis, width: 0.75 });
    }
    for (const c of CIRCLES) {
      strokePath(parallel(c.lat), g, {
        colour: c.emphasis ? tokens.ink : tokens['ink-2'],
        width: c.emphasis ? 1.5 : 1,
        dashed: c.dashed,
      });
    }

    ctx.strokeStyle = tokens['ink-2'];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.R, 0, Math.PI * 2);
    ctx.stroke();

    // Cities, as anchors for the eye.
    for (const c of LOCATION_PRESETS) {
      if (c.name === 'Equator') continue;
      const s = toScreen(c.latDeg, c.lonDeg, g);
      if (!s.visible) continue;
      ctx.fillStyle = tokens.muted;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Where the observer is standing.
    const p = toScreen(point.latDeg, point.lonDeg, g);
    if (p.visible) {
      ctx.fillStyle = tokens.globe;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = tokens.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      haloText(ctx, 'round the back', g.cx, g.cy + g.R + 12, {
        fill: tokens.muted, halo: tokens.surface, align: 'center', size: 10.5,
      });
    }

    ctx.font = font(10);
    ctx.fillStyle = tokens.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('drag to spin · click to stand there', g.cx, g.h - 11);
  }

  // --- interaction -----------------------------------------------------------

  let dragging = false, moved = 0, lastX = 0, lastY = 0;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX;
    lastY = e.clientY;
    const g = geom();
    view.lon0 -= (dx / g.R) * 90;
    view.lat0 = Math.max(-90, Math.min(90, view.lat0 + (dy / g.R) * 90));
    render();
  });

  const finish = (e) => {
    if (!dragging) return;
    dragging = false;
    if (moved > 5) return;                       // that was a drag, not a click
    const g = geom();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - g.cx) / g.R;
    const y = -(e.clientY - rect.top - g.cy) / g.R;
    const hit = inverseOrthographic(x, y, view.lat0, view.lon0);
    if (hit) opts.onPick(hit.latDeg, hit.lonDeg);
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', () => { dragging = false; });

  return {
    /** Move the marker, and spin the globe so it is facing the viewer. */
    setPoint(latDeg, lonDeg, { turnToFace = true } = {}) {
      point = { latDeg, lonDeg };
      if (turnToFace) view = { lat0: Math.max(-70, Math.min(70, latDeg)), lon0: lonDeg };
      render();
    },
    setTokens(t) { tokens = t; render(); },
    render,
  };
}
