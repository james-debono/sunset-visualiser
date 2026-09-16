/**
 * Canvas plumbing shared by every view: device-pixel-ratio handling, resize
 * tracking, and reading theme colours from CSS custom properties so diagrams
 * follow light and dark mode without duplicating the palette in JavaScript.
 */

/**
 * Wrap a canvas so drawing code can work in CSS pixels at any DPR.
 * @param {HTMLCanvasElement} canvas
 * @param {() => void} onResize  called after every size change
 */
export function createStage(canvas, onResize) {
  const ctx = canvas.getContext('2d');
  const stage = { canvas, ctx, width: 0, height: 0, dpr: 1 };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === stage.width && h === stage.height && dpr === stage.dpr) return;
    stage.width = w;
    stage.height = h;
    stage.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    onResize?.();
  }

  /** Reset the transform so subsequent drawing is in CSS pixels. */
  stage.begin = () => {
    ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
    ctx.clearRect(0, 0, stage.width, stage.height);
    return ctx;
  };

  new ResizeObserver(resize).observe(canvas);
  resize();
  return stage;
}

const TOKEN_NAMES = [
  'page', 'surface', 'surface-2', 'ink', 'ink-2', 'muted', 'grid', 'axis',
  'globe', 'flat', 'sun', 'sun-core', 'earth-day', 'earth-night', 'ground', 'fov',
];

/** Current theme colours, keyed by custom-property name without the dashes. */
export function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const n of TOKEN_NAMES) out[n] = cs.getPropertyValue(`--${n}`).trim();
  return out;
}

/** Call `fn` whenever the colour scheme may have changed. */
export function onThemeChange(fn) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn);
  new MutationObserver(fn).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme'],
  });
}

/** Font strings, kept in one place so canvas text matches the page. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const font = (px, weight = 400) => `${weight} ${px}px ${FONT}`;

/**
 * Draw text with a halo in the background colour so it stays legible where it
 * crosses lines. Text wears ink tokens, never series colours.
 */
export function haloText(ctx, text, x, y, { fill, halo, align = 'left', baseline = 'alphabetic', size = 11, weight = 400 } = {}) {
  ctx.font = font(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = halo;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Small filled arrowhead pointing along (dx, dy). */
export function arrowHead(ctx, x, y, dx, dy, size = 6) {
  const m = Math.hypot(dx, dy) || 1;
  const ux = dx / m, uy = dy / m;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * size - uy * size * 0.55, y - uy * size + ux * size * 0.55);
  ctx.lineTo(x - ux * size + uy * size * 0.55, y - uy * size - ux * size * 0.55);
  ctx.closePath();
  ctx.fill();
}
