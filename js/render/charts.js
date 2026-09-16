/**
 * Time-series line charts with a shared crosshair.
 *
 * Two series (globe, flat) on one y-axis each; never a second y-scale. The
 * crosshair snaps to the nearest sample and the tooltip lists both series, so
 * the pointer never has to land on a 2 px line. Clicking or dragging seeks the
 * playhead. Every value shown here is also in the data table view.
 */

import { font } from './stage.js';
import { createStage } from './stage.js';

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo || 1;
  const raw = span / count;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return ticks;
}

/**
 * @param {HTMLElement} container   element holding a <canvas>
 * @param {object} opts
 * @param {(t:number)=>void} opts.onSeek
 * @param {(t:number|null)=>void} opts.onHover
 * @param {(t:number)=>string} opts.formatTime
 */
export function createChart(container, opts) {
  const canvas = container.querySelector('canvas');
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.hidden = true;
  container.appendChild(tooltip);

  let data = null;
  let tokens = null;
  let playhead = null;
  let hoverT = null;
  let showTooltip = false;

  const stage = createStage(canvas, () => render());
  const pad = { l: 46, r: 60, t: 10, b: 20 };

  const plot = () => ({
    x: pad.l, y: pad.t,
    w: Math.max(10, stage.width - pad.l - pad.r),
    h: Math.max(10, stage.height - pad.t - pad.b),
  });
  const xOf = (t, p) => p.x + ((t - data.x0) / (data.x1 - data.x0)) * p.w;
  const yOf = (v, p) => p.y + p.h - ((v - data.y0) / (data.y1 - data.y0)) * p.h;
  const tOfX = (x, p) => data.x0 + ((x - p.x) / p.w) * (data.x1 - data.x0);

  function nearestIndex(t) {
    const { times } = data;
    let lo = 0, hi = times.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < t) lo = mid; else hi = mid;
    }
    return Math.abs(times[lo] - t) <= Math.abs(times[hi] - t) ? lo : hi;
  }

  function render() {
    if (!data || !tokens) return;
    const ctx = stage.begin();
    const p = plot();
    const T = tokens;

    // Y grid and ticks
    ctx.font = font(10);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of niceTicks(data.y0, data.y1, 4)) {
      const y = Math.round(yOf(v, p)) + 0.5;
      ctx.strokeStyle = v === 0 ? T.axis : T.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, y);
      ctx.lineTo(p.x + p.w, y);
      ctx.stroke();
      ctx.fillStyle = T.muted;
      ctx.fillText(data.formatTick(v), p.x - 7, y);
    }

    // X ticks on whole hours
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let h = Math.ceil(data.x0); h <= data.x1 + 1e-9; h++) {
      const x = Math.round(xOf(h, p)) + 0.5;
      ctx.strokeStyle = T.axis;
      ctx.beginPath();
      ctx.moveTo(x, p.y + p.h);
      ctx.lineTo(x, p.y + p.h + 4);
      ctx.stroke();
      ctx.fillStyle = T.muted;
      ctx.fillText(opts.formatTime(h).slice(0, 5), x, p.y + p.h + 6);
    }

    // Sunset marker
    if (data.sunset != null) {
      const x = Math.round(xOf(data.sunset, p)) + 0.5;
      ctx.strokeStyle = T.axis;
      ctx.beginPath();
      ctx.moveTo(x, p.y);
      ctx.lineTo(x, p.y + p.h);
      ctx.stroke();
    }

    // Series
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2;
    for (const s of data.series) {
      ctx.strokeStyle = T[s.key];
      ctx.beginPath();
      s.values.forEach((v, i) => {
        const x = xOf(data.times[i], p), y = yOf(v, p);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }

    // End labels, with a leader line if they would collide.
    const ends = data.series.map((s) => ({
      s, y: yOf(s.values[s.values.length - 1], p), text: data.formatEnd(s.values[s.values.length - 1]),
    }));
    if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 13) {
      const mid = (ends[0].y + ends[1].y) / 2;
      const [a, b] = ends[0].y <= ends[1].y ? [ends[0], ends[1]] : [ends[1], ends[0]];
      a.ly = mid - 7; b.ly = mid + 7;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(10.5);
    for (const e of ends) {
      const ly = e.ly ?? e.y;
      const x0 = p.x + p.w;
      if (e.ly != null) {
        ctx.strokeStyle = T.axis;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0 + 2, e.y);
        ctx.lineTo(x0 + 7, ly);
        ctx.stroke();
      }
      ctx.fillStyle = T['ink-2'];
      ctx.fillText(e.text, x0 + 9, ly);
    }

    // Sunset label, drawn last so it sits over the lines.
    if (data.sunset != null) {
      const x = xOf(data.sunset, p);
      ctx.font = font(10);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3;
      ctx.strokeStyle = T.surface;
      ctx.strokeText('sunset', x - 4, p.y + 1);
      ctx.fillStyle = T.muted;
      ctx.fillText('sunset', x - 4, p.y + 1);
    }

    // Playhead
    if (playhead != null) drawCursor(ctx, p, playhead, 0.55, true);
    if (hoverT != null) drawCursor(ctx, p, data.times[nearestIndex(hoverT)], 0.9, false);
  }

  function drawCursor(ctx, p, t, alpha, dots) {
    const T = tokens;
    const x = Math.round(xOf(t, p)) + 0.5;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = T.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, p.y);
    ctx.lineTo(x, p.y + p.h);
    ctx.stroke();
    ctx.globalAlpha = 1;
    const i = nearestIndex(t);
    for (const s of data.series) {
      const v = dots ? s.at(t) : s.values[i];
      const y = yOf(v, p);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = T[s.key];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = T.surface;
      ctx.stroke();
    }
  }

  function updateTooltip() {
    if (!showTooltip || hoverT == null || !data) {
      tooltip.hidden = true;
      return;
    }
    const p = plot();
    const i = nearestIndex(hoverT);
    const t = data.times[i];

    tooltip.replaceChildren();
    const head = document.createElement('div');
    head.className = 't-time';
    head.textContent = opts.formatTime(t);
    tooltip.appendChild(head);
    for (const s of data.series) {
      const row = document.createElement('div');
      row.className = 't-row';
      const key = document.createElement('i');
      key.className = `key ${s.key}`;
      const val = document.createElement('span');
      val.className = 't-val';
      val.textContent = data.formatValue(s.values[i]);
      const name = document.createElement('span');
      name.className = 't-name';
      name.textContent = s.label;
      row.append(key, val, name);
      tooltip.appendChild(row);
    }
    tooltip.hidden = false;
    const x = xOf(t, p);
    const tw = tooltip.offsetWidth;
    const left = x + 12 + tw > stage.width ? x - 12 - tw : x + 12;
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.top = `${p.y + 2}px`;
  }

  let dragging = false;
  canvas.addEventListener('pointermove', (e) => {
    if (!data) return;
    const p = plot();
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(p.x + p.w, Math.max(p.x, e.clientX - rect.left));
    const t = tOfX(x, p);
    if (dragging) opts.onSeek(t);
    showTooltip = true;
    opts.onHover(t);
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (!data) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    const p = plot();
    const rect = canvas.getBoundingClientRect();
    opts.onSeek(tOfX(Math.min(p.x + p.w, Math.max(p.x, e.clientX - rect.left)), p));
  });
  const endDrag = () => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => {
    showTooltip = false;
    opts.onHover(null);
  });

  return {
    setData(d) { data = d; render(); updateTooltip(); },
    setTokens(t) { tokens = t; render(); },
    setPlayhead(t) { playhead = t; render(); },
    /** Hover position shared between charts; only the hovered chart shows a tooltip. */
    setHover(t, local = false) {
      hoverT = t;
      if (!local) showTooltip = false;
      render();
      updateTooltip();
    },
    render,
  };
}
