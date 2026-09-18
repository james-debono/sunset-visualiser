/**
 * Application wiring: state, controls, and the render loop.
 *
 * Nothing in this file is physics. It samples the models in js/physics/,
 * applies refraction if the user has turned it on, and hands plain numbers to
 * the renderers in js/render/. If you are checking the science, start in
 * js/physics/ and tests/physics.test.js instead.
 */

import { AU_KM, KM_PER_MILE, DEG, RAD, milesToKm, kmToMiles, norm180, norm360 } from './physics/constants.js';

import { buildScenario, summarise } from './physics/scenario.js';
import {
  R_EARTH_KM, hourAngleAtAltitude, solarTimeFromHourAngle,
} from './physics/solar.js';
import { makeFlatModel, minimumHeightForImperceptibleShrink } from './physics/flat.js';
import { fluxRatio, airmass } from './physics/extinction.js';
import {
  apparentDiscDeg, apparentHorizonDipDeg, refractionFromTrueDeg, REFRACTION_PRESETS,
  MONOTONIC_LIMIT,
} from './physics/refraction.js';
import {
  COMMON_FOCAL_LENGTHS_MM, defaultFraming, verticalFovDeg, pitchForHorizonFractionDeg,
} from './physics/optics.js';
import {
  formatDistance, formatSpeed, formatSmallLength, formatAngularSize, formatSolarTime,
} from './physics/units.js';

import { createStage, readTokens, onThemeChange } from './render/stage.js';
import { drawCamera } from './render/camera.js';
import { drawGlobeSide } from './render/sideGlobe.js';
import { drawFlatSide, flatSideLayout } from './render/sideFlat.js';
import { createChart } from './render/charts.js';
import { createGlobePicker, LOCATION_PRESETS, MAX_LATITUDE } from './render/globePicker.js';

const $ = (id) => document.getElementById(id);

// -----------------------------------------------------------------------------
// The session: everything that depends on where the observer is standing.
//
// These are rebuilt when the location changes, which is why they are `let`
// rather than `const`. Every reference elsewhere reads them at call time.
// -----------------------------------------------------------------------------

/**
 * How far past geometric sunset the timeline runs.
 *
 * Five minutes is enough at the equator: the disc has fully gone about 5.2
 * minutes after the Sun's centre crosses the horizon, under any of the
 * refraction presets. Nearer the poles the Sun slides down at a shallow angle
 * and takes far longer, so the tail follows the time for the centre to reach
 * 1.3 degrees down, bounded either side. Fixed against the refraction setting,
 * so changing it never rescales the charts underneath you.
 */
const TIMELINE_TAIL_MIN_H = 5 / 60;
const TIMELINE_TAIL_MAX_H = 30 / 60;
const DISC_GONE_ALT_DEG = -1.3;

const HEIGHT_MIN_KM = 100;
const HEIGHT_MAX_KM = 500000;

let scenario, globe, cfg, declinationDeg;
let T0, TS, T1, START, CAMERA_YAW, FLAT_YAW, FRAMING;
let times, globeSeries, hourMarks, globeMarks;

const SAMPLE_STEP_H = 30 / 3600;
const toArcmin = (deg) => deg * 60;
const toArcsecPerMin = (degPerHour) => degPerHour * 60;   // deg/h -> arcsec/min

/**
 * Rebuild the scenario and everything derived from it.
 *
 * Away from the equator the Sun sets at an angle, so it also tracks sideways
 * across the window. The camera therefore faces the mean of its bearings
 * rather than its bearing at sunset, and the lens has to be wide enough for
 * the sideways swing as well as the drop.
 */
function rebuildSession() {
  scenario = buildScenario({
    latDeg: state.latDeg,
    lonDeg: state.lonDeg,
    date: new Date(`${state.dateISO}T00:00:00Z`),
  });
  globe = scenario.globe;
  cfg = scenario.config;
  declinationDeg = scenario.declinationDeg;
  T0 = scenario.startSolarTime;
  TS = scenario.sunsetSolarTime;
  const hGone = hourAngleAtAltitude(state.latDeg, declinationDeg, DISC_GONE_ALT_DEG);
  const gone = hGone != null ? solarTimeFromHourAngle(hGone) : TS + TIMELINE_TAIL_MIN_H;
  T1 = Math.min(
    Math.max(gone, TS + TIMELINE_TAIL_MIN_H),
    TS + TIMELINE_TAIL_MAX_H,
  );
  START = globe.sample(T0);

  // Mean bearing of the Sun across the window, as a direction rather than an
  // average of numbers, so it behaves either side of due north.
  let ex = 0, ny = 0;
  const bearings = [];
  for (let i = 0; i <= 12; i++) {
    const a = globe.sample(T0 + ((TS - T0) * i) / 12).azimuthDeg;
    bearings.push(a);
    ex += Math.sin(a * DEG);
    ny += Math.cos(a * DEG);
  }
  CAMERA_YAW = norm360(Math.atan2(ex, ny) * RAD);
  const swing = bearings.reduce((m, a) => Math.max(m, Math.abs(norm180(a - CAMERA_YAW))), 0);

  FRAMING = defaultFraming(
    Math.max(1, START.altitudeDeg) + START.angularDiameterDeg / 2,
    0.02,
    COMMON_FOCAL_LENGTHS_MM,
    2 * swing + START.angularDiameterDeg,
  );
  state.focalMm = FRAMING.focalMm;

  times = [];
  for (let t = T0; t <= T1 + 1e-9; t += SAMPLE_STEP_H) times.push(t);
  globeSeries = {
    size: times.map((t) => toArcmin(globe.sample(t).angularDiameterDeg)),
    rate: times.map((t) => toArcsecPerMin(globe.angularRateDegPerHour(t))),
  };

  hourMarks = [];
  for (let h = Math.ceil(T0 - 1e-9); h <= TS + 1e-9; h++) hourMarks.push(h);
  globeMarks = hourMarks.map((h) => ({
    psi: globe.sample(h).centralAngleDeg,
    label: formatSolarTime(h).slice(0, 5),
  }));

  state.t = Math.min(T1, Math.max(T0, state.t));
  $('scrub').max = String(Math.round((T1 - T0) * 3600));
  rebuildFlat();
  recomputeMinHeight();
}

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

const state = {
  latDeg: 0,
  lonDeg: 0,
  locationLabel: 'Equator',
  dateISO: '2026-09-23',
  t: 15,
  playing: false,
  speed: 600,
  units: 'both',
  /**
   * One of REFRACTION_PRESETS. Standard air by default: real sunsets happen in
   * an atmosphere, and the comparison does not depend on it either way.
   */
  refraction: REFRACTION_PRESETS.find((p) => p.id === 'standard'),
  focalMm: 24,
  loupeMm: 1600,
  heightKm: milesToKm(1000),
  anchor: /** @type {'elevation'|'subsolar'} */ ('elevation'),
  path: /** @type {'straight'|'gleason'} */ ('straight'),
  flat: null,
  minHeightKm: null,
  showTable: false,
};

let tokens = readTokens();

// Declared before any stage exists: stages call this synchronously on creation.
let renderQueued = false;
function requestRender() {
  if (renderQueued || state.playing) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}


function rebuildFlat() {
  state.flat = makeFlatModel({
    globe, startSolarTime: T0, heightKm: state.heightKm, anchor: state.anchor,
    declinationDeg, path: state.path,
  });

  // The flat pane faces the middle of its own Sun's travel, so the start and
  // end of the window sit either side of centre. On the local plane the Sun
  // holds one bearing and this is simply that bearing; on the map it swings,
  // and facing the globe Sun's bearing would walk it off the right of frame.
  FLAT_YAW = state.path === 'gleason'
    ? meanBearingDeg(state.flat.map.bearingDeg(T0), state.flat.map.bearingDeg(T1))
    : START.azimuthDeg;
}

/** Midpoint of two compass bearings, taken as directions rather than numbers. */
function meanBearingDeg(a, b) {
  const x = Math.cos(a * DEG) + Math.cos(b * DEG);
  const y = Math.sin(a * DEG) + Math.sin(b * DEG);
  return norm360(Math.atan2(y, x) * RAD);
}

function recomputeMinHeight() {
  state.minHeightKm = minimumHeightForImperceptibleShrink({
    globe, startSolarTime: T0, endSolarTime: TS, anchor: state.anchor,
    declinationDeg, path: state.path,
  });
}

// -----------------------------------------------------------------------------
// Chart data
// -----------------------------------------------------------------------------

const sizeChart = createChart($('chart-size'), {
  formatTime: formatSolarTime,
  onSeek: seek,
  onHover: (t) => setHover(t, 'size'),
});
const rateChart = createChart($('chart-rate'), {
  formatTime: formatSolarTime,
  onSeek: seek,
  onHover: (t) => setHover(t, 'rate'),
});

function setHover(t, source) {
  sizeChart.setHover(t, source === 'size');
  rateChart.setHover(t, source === 'rate');
}

function updateCharts() {
  const flat = state.flat;
  const flatSize = times.map((t) => toArcmin(flat.sample(t).angularDiameterDeg));
  const flatRate = times.map((t) => toArcsecPerMin(flat.angularRateDegPerHour(t)));

  const sizeMax = Math.max(...globeSeries.size, ...flatSize);
  sizeChart.setData({
    times, x0: T0, x1: T1, y0: 0, y1: sizeMax * 1.14, sunset: TS,
    series: [
      { key: 'globe', label: 'Globe', values: globeSeries.size, at: (t) => toArcmin(globe.sample(t).angularDiameterDeg) },
      { key: 'flat', label: 'Flat', values: flatSize, at: (t) => toArcmin(state.flat.sample(t).angularDiameterDeg) },
    ],
    formatTick: (v) => `${v}′`,
    formatEnd: (v) => `${v.toFixed(1)}′`,
    formatValue: (v) => `${v.toFixed(3)}′`,
  });

  const lo = Math.min(...globeSeries.rate, ...flatRate);
  const hi = Math.max(...globeSeries.rate, ...flatRate);
  const y0 = lo * 1.12;
  const y1 = Math.max(hi * 1.12, -y0 * 0.08);
  rateChart.setData({
    times, x0: T0, x1: T1, y0, y1, sunset: TS,
    series: [
      { key: 'globe', label: 'Globe', values: globeSeries.rate, at: (t) => toArcsecPerMin(globe.angularRateDegPerHour(t)) },
      { key: 'flat', label: 'Flat', values: flatRate, at: (t) => toArcsecPerMin(state.flat.angularRateDegPerHour(t)) },
    ],
    formatTick: (v) => `${v}″`,
    formatEnd: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}″`,
    formatValue: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(4)}″/min`,
  });

  if (state.showTable) buildTable();
}

// -----------------------------------------------------------------------------
// Stages
// -----------------------------------------------------------------------------

const stages = {
  globeCamera: createStage($('globe-camera'), requestRender),
  globeSide: createStage($('globe-side'), requestRender),
  flatCamera: createStage($('flat-camera'), requestRender),
  flatSide: createStage($('flat-side'), requestRender),
};

// -----------------------------------------------------------------------------
// Formatting helpers bound to current units
// -----------------------------------------------------------------------------

const dist = (km, sig, signed = false) => formatDistance(km, state.units, sig, signed);

/** Space a diagram must leave for its readout -- none when the readout sits below it. */
const readoutReserve = (el) => (getComputedStyle(el).position === 'absolute' ? el.offsetWidth + 20 : 0);
const pct = (x, d) => `${(x * 100).toFixed(d)} %`;
const arcmin = (degrees, d = 2) => `${(degrees * 60).toFixed(d)}′`;
const deg = (x, d = 2) => {
  const text = Math.abs(x).toFixed(d);
  const zero = Number(text) === 0;
  return `${x < 0 && !zero ? '−' : ''}${text}°`;
};
const signed = (x, d, unit = '') => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}${unit}`;

function fillReadout(dl, rows) {
  dl.replaceChildren();
  for (const [label, value, strong] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    if (strong) dd.className = 'strong';
    dl.append(dt, dd);
  }
}

function relativeToSunset(t) {
  const mins = Math.round((t - TS) * 60);
  if (mins === 0) return 'sunset';
  const a = Math.abs(mins), h = Math.floor(a / 60), m = a % 60;
  const span = h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
  return mins < 0 ? `sunset in ${span}` : `${span} after sunset`;
}

// -----------------------------------------------------------------------------
// Render
// -----------------------------------------------------------------------------

/** Apparent disc for a true altitude, under the selected refraction preset. */
function apparent(trueAltDeg, diameterDeg) {
  if (!state.refraction.on) {
    return { alt: trueAltDeg, hR: diameterDeg / 2, vR: diameterDeg / 2, lift: 0 };
  }
  const c = state.refraction.conditions;
  const d = apparentDiscDeg(trueAltDeg, diameterDeg, c);
  return {
    alt: d.apparentCentreAltDeg,
    hR: d.horizontalDeg / 2,
    vR: d.verticalDeg / 2,
    lift: d.apparentCentreAltDeg - trueAltDeg,
  };
}

/**
 * Readout rows shared by both camera panes. With refraction on it also shows
 * the apparent width and height, which is where the point lives: however
 * strong refraction gets, it squashes the height and never touches the width.
 */
function cameraRows(sample, app, startDiameterDeg, sizeDecimals) {
  const rows = [['Angular diameter', formatAngularSize(sample.angularDiameterDeg), true]];
  const modelled = sample.altitudeDeg >= MONOTONIC_LIMIT.trueDeg;
  if (state.refraction.on && modelled) {
    rows.push(['Apparent W × H', `${arcmin(app.hR * 2)} × ${arcmin(app.vR * 2)}`]);
    rows.push(['Refraction lift', `+${arcmin(app.lift)}`]);
  } else if (state.refraction.on) {
    // Far below the horizon the formulae are out of range, so say so rather
    // than quote a number the code cannot stand behind.
    rows.push(['Refraction', 'not modelled this low']);
  }
  rows.push(['Size vs start', pct(sample.angularDiameterDeg / startDiameterDeg, sizeDecimals)]);
  rows.push([
    state.refraction.on && modelled ? 'Altitude (apparent)' : 'Altitude',
    deg(state.refraction.on && modelled ? app.alt : sample.altitudeDeg, 2),
  ]);
  return rows;
}

function render() {
  const t = state.t;
  const flat = state.flat;
  const g = globe.sample(t);
  const f = flat.sample(t);
  const f0 = flat.sample(T0);

  const pitch = pitchForHorizonFractionDeg(state.focalMm, FRAMING.horizonFraction);
  const vfov = verticalFovDeg(state.focalMm);
  const ghostLabel = `size at ${formatSolarTime(T0).slice(0, 5)}`;

  // --- Globe camera
  const gApp = apparent(g.altitudeDeg, g.angularDiameterDeg);
  const startApp = apparent(START.altitudeDeg, START.angularDiameterDeg);
  const globeFlux = fluxRatio({
    angularDiameterDeg: g.angularDiameterDeg,
    startAngularDiameterDeg: START.angularDiameterDeg,
    apparentAltDeg: gApp.alt,
    startApparentAltDeg: startApp.alt,
  });
  const globeHorizon = -(state.refraction.on
    ? apparentHorizonDipDeg(cfg.eyeHeightM, state.refraction.conditions)
    : g.horizonDipDeg);
  drawCamera(stages.globeCamera, {
    focalMm: state.focalMm, horizonFraction: FRAMING.horizonFraction, yawDeg: CAMERA_YAW,
    sunAltDeg: gApp.alt, sunAzDeg: g.azimuthDeg, sunHRadiusDeg: gApp.hR, sunVRadiusDeg: gApp.vR,
    ghostRadiusDeg: START.angularDiameterDeg / 2,
    fluxRatio: globeFlux,
    horizonAltDeg: globeHorizon,
    loupeMm: state.loupeMm, ghostLabel,
  });

  // On the local plane the Sun recedes in a straight line, so its bearing
  // cannot change; on the map it circles the pole, and the bearing swings
  // wildly -- 45 deg away from due west by sunset at the equator, where anyone
  // with a compass can see it does not.
  const flatBearing = state.path === 'gleason'
    ? flat.map.bearingDeg(t)
    : START.azimuthDeg;

  // --- Flat camera. The plane's horizon is its vanishing line, at exactly 0 deg.
  // The flat Sun holds the bearing the real Sun has at the start of the window:
  // it recedes in a straight line, so its bearing cannot change. Away from the
  // equator the real Sun's bearing does swing, which is one more difference the
  // two panes show.
  const fApp = apparent(f.altitudeDeg, f.angularDiameterDeg);
  const f0App = apparent(f0.altitudeDeg, f0.angularDiameterDeg);
  const flatFlux = fluxRatio({
    angularDiameterDeg: f.angularDiameterDeg,
    startAngularDiameterDeg: f0.angularDiameterDeg,
    apparentAltDeg: fApp.alt,
    startApparentAltDeg: f0App.alt,
  });
  drawCamera(stages.flatCamera, {
    focalMm: state.focalMm, horizonFraction: FRAMING.horizonFraction, yawDeg: FLAT_YAW,
    sunAltDeg: fApp.alt, sunAzDeg: flatBearing, sunHRadiusDeg: fApp.hR, sunVRadiusDeg: fApp.vR,
    ghostRadiusDeg: f0.angularDiameterDeg / 2,
    fluxRatio: flatFlux,
    horizonAltDeg: 0,
    loupeMm: state.loupeMm, ghostLabel,
  });

  fillReadout($('globe-camera-readout'), cameraRows(g, gApp, START.angularDiameterDeg, 4));
  fillReadout($('flat-camera-readout'), [
    ...cameraRows(f, fApp, f0.angularDiameterDeg, 1),
    ...(t >= TS ? [['Real Sun has set', 'this one has not', true]] : []),
  ]);

  // --- Globe side
  const globeReadout = $('globe-side-readout');
  fillReadout(globeReadout, [
    ['Distance to Sun', dist(g.distanceKm, 9), true],
    ['Change since start', dist(g.distanceKm - START.distanceKm, 4, true)],
    ['Earth has turned', `${(15 * (t - T0)).toFixed(2)}°`],
    ['Sun altitude', deg(g.altitudeDeg, 2)],
  ]);
  drawGlobeSide(stages.globeSide, {
    centralAngleDeg: g.centralAngleDeg,
    marks: globeMarks,
    startPsi: START.centralAngleDeg,
    endPsi: globe.sample(T1).centralAngleDeg,
    angleLabel: deg(g.altitudeDeg, 2),
    pitchDeg: pitch, vfovDeg: vfov,
    auLabel: `${(START.earthSunDistanceKm / AU_KM).toFixed(4)} AU`,
    distanceLabel: formatDistance(START.earthSunDistanceKm, state.units, 4),
    reserveLeft: readoutReserve(globeReadout),
  }, tokens);

  // --- Flat side
  const flatReadout = $('flat-side-readout');
  const imperial = state.units === 'imperial';
  const flatView = {
    heightKm: flat.config.heightKm,
    horizontalKm: f.horizontalKm,
    startHorizontalKm: flat.startHorizontalKm,
    endHorizontalKm: flat.horizontalKm(T1),
    sunRadiusKm: flat.sunRadiusKm,
    angleLabel: deg(f.altitudeDeg, 2),
    pitchDeg: pitch, vfovDeg: vfov,
    marks: hourMarks.map((h) => ({ x: flat.horizontalKm(h), label: formatSolarTime(h).slice(0, 5) })),
    tickUnit: imperial ? 'mi' : 'km',
    kmPerTickUnit: imperial ? KM_PER_MILE : 1,
    hLabel: `h = ${dist(flat.config.heightKm, 4)}`,
    xLabel: `x = ${dist(f.horizontalKm, 4)}`,
    dLabel: `d = ${dist(f.distanceKm, 4)}`,
    reserveLeft: readoutReserve(flatReadout),
    plan: state.path === 'gleason' ? {
      observerRadiusKm: flat.map.observerRadiusKm,
      sunRadiusKm: flat.map.sunRadiusKm,
      equatorRadiusKm: flat.map.equatorRadiusKm,
      rimRadiusKm: flat.map.rimRadiusKm,
      hourAngleDeg: g.hourAngleDeg,
      startHourAngleDeg: START.hourAngleDeg,
      size: flatReadout.offsetHeight,
    } : null,
  };
  const flatRows = (layout) => {
    const rows = [];
    if (t >= TS) rows.push(['Real Sun has set. This one is', `still ${deg(f.altitudeDeg, 1)} up`, true]);
    rows.push(
      ['Sun speed', formatSpeed(flat.speedKmh, state.units, 5), true],
      ['Sun diameter (implied)', dist(flat.sunDiameterKm, 3)],
      ['Horizontal distance', dist(f.horizontalKm, 4)],
      ['Line of sight', dist(f.distanceKm, 4)],
    );
    if (state.path === 'gleason') {
      // Paired with the measured value, because the gap is the point.
      rows.push(['Bearing: map vs measured',
        `${deg(flat.map.bearingDeg(t), 0)} vs ${deg(g.azimuthDeg, 0)}`]);
      rows.push(['Equator: map vs measured',
        `${Math.round(flat.map.equatorLengthKm).toLocaleString()} vs ` +
        `${Math.round(2 * Math.PI * R_EARTH_KM).toLocaleString()} km`]);
    } else if (state.anchor === 'elevation') {
      rows.push(['Start: point below Sun', dist(flat.startHorizontalKm, 4)]);
      rows.push(['Start: real subsolar point', dist(flat.measuredGroundDistanceKm, 4)]);
    }
    const scale = `1 px = ${dist(layout.kmPerPx, 2)}`;
    rows.push(['Drawing scale', layout.enlarge > 1.05 ? `${scale}; Sun ×${layout.enlarge.toFixed(layout.enlarge >= 10 ? 0 : 1)}` : scale]);
    return rows;
  };
  // Two passes: the readout's width decides the drawing scale, and the scale is
  // one of the readout rows.
  fillReadout(flatReadout, flatRows(flatSideLayout(stages.flatSide.width, stages.flatSide.height, flatView)));
  flatView.reserveLeft = readoutReserve(flatReadout);
  fillReadout(flatReadout, flatRows(flatSideLayout(stages.flatSide.width, stages.flatSide.height, flatView)));
  // The inset is sized to match the readout beside it, which is only measurable
  // once this frame's rows are in place.
  if (flatView.plan) flatView.plan.size = flatReadout.offsetHeight;
  drawFlatSide(stages.flatSide, flatView, tokens);

  // --- Charts
  sizeChart.setPlayhead(t);
  rateChart.setPlayhead(t);

  // --- Comparison
  renderCompare(g, f, f0, gApp, fApp, globeFlux, flatFlux);

  // --- Transport
  $('clock-time').textContent = formatSolarTime(t);
  $('clock-rel').textContent = relativeToSunset(t);
  const scrub = $('scrub');
  if (document.activeElement !== scrub) scrub.value = String(Math.round((t - T0) * 3600));
  scrub.setAttribute('aria-valuetext', `${formatSolarTime(t)}, ${relativeToSunset(t)}`);

  const lens = `${state.focalMm} mm · ${vfov.toFixed(1)}° vertical`;
  $('globe-camera-meta').textContent = `${lens} · facing ${Math.round(CAMERA_YAW)}°`;
  $('flat-camera-meta').textContent = `${lens} · facing ${Math.round(FLAT_YAW)}°`;
}

function renderCompare(g, f, f0, gApp, fApp, gFlux, fFlux) {
  const body = $('compare').tBodies[0];
  const gRate = toArcsecPerMin(globe.angularRateDegPerHour(state.t));
  const fRate = toArcsecPerMin(state.flat.angularRateDegPerHour(state.t));
  const gRatio = g.angularDiameterDeg / START.angularDiameterDeg;
  const fRatio = f.angularDiameterDeg / f0.angularDiameterDeg;
  const rows = [
    ['Angular diameter', formatAngularSize(g.angularDiameterDeg), formatAngularSize(f.angularDiameterDeg)],
    ['Size vs start', pct(gRatio, 4), pct(fRatio, 1)],
    ['Changing by', signed(gRate, 4, '″/min'), signed(fRate, 2, '″/min')],
    ['Light reaching you', pct(gFlux, 2), pct(fFlux, 2)],
    [state.refraction.on ? 'Altitude (apparent)' : 'Altitude', deg(gApp.alt, 2), deg(fApp.alt, 2)],
    ['Distance to Sun', dist(g.distanceKm, 9), dist(f.distanceKm, 4)],
  ];
  body.replaceChildren();
  for (const [label, a, b] of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('td');
    th.textContent = label;
    const ta = document.createElement('td');
    ta.textContent = a;
    const tb = document.createElement('td');
    tb.textContent = b;
    tr.append(th, ta, tb);
    body.appendChild(tr);
  }
  $('compare-time').textContent = formatSolarTime(state.t);
}

function renderVerdict() {
  const s = summarise({ globe, flat: state.flat, startSolarTime: T0, endSolarTime: TS });
  const p = $('verdict');
  p.replaceChildren();
  const add = (text, strong) => {
    const el = strong ? document.createElement('strong') : document.createTextNode(text);
    if (strong) el.textContent = text;
    p.appendChild(el);
  };
  add(`From ${formatSolarTime(T0).slice(0, 5)} to sunset the flat Sun would shrink to `);
  add(`${(s.flat.remainingFraction * 100).toFixed(1)} %`, true);
  add(' of its width; the real one changes by ');
  add(`${Math.abs(s.globe.changeArcsec).toFixed(4)}″`, true);
  add(`, a difference of ${Math.round(s.ratio).toLocaleString()}×. The flat Sun would still be `);
  add(deg(s.flat.endAltDeg, 1), true);
  add(' up at sunset.');
  if (state.minHeightKm) {
    add(` To hide the shrink it would need to be at least ${dist(state.minHeightKm, 3)} high.`);
  }
}

function buildTable() {
  const view = $('table-view');
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const h of ['Time', 'Globe ′', 'Flat ′', 'Globe ″/min', 'Flat ″/min', 'Globe alt', 'Flat alt']) {
    const th = document.createElement('th');
    th.textContent = h;
    head.appendChild(th);
  }
  const body = table.createTBody();
  for (let t = T0; t <= T1 + 1e-9; t += 0.25) {
    const g = globe.sample(t), f = state.flat.sample(t);
    const cells = [
      formatSolarTime(t),
      toArcmin(g.angularDiameterDeg).toFixed(4),
      toArcmin(f.angularDiameterDeg).toFixed(4),
      signed(toArcsecPerMin(globe.angularRateDegPerHour(t)), 5),
      signed(toArcsecPerMin(state.flat.angularRateDegPerHour(t)), 3),
      deg(g.altitudeDeg, 3),
      deg(f.altitudeDeg, 3),
    ];
    const tr = body.insertRow();
    for (const c of cells) tr.insertCell().textContent = c;
  }
  view.replaceChildren(table);
}

// -----------------------------------------------------------------------------
// Playback
// -----------------------------------------------------------------------------

let lastFrame = null;

function frame(now) {
  if (!state.playing) { lastFrame = null; return; }
  if (lastFrame != null) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    state.t += (dt * state.speed) / 3600;
    if (state.t >= T1) {
      state.t = T1;
      setPlaying(false);
    }
  }
  lastFrame = now;
  render();
  if (state.playing) requestAnimationFrame(frame);
}

const PLAY_ICON = 'M4 2.5v11l9.5-5.5z';
const PAUSE_ICON = 'M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z';

function setPlaying(on) {
  if (on && state.t >= T1 - 1e-6) state.t = T0;
  state.playing = on;
  $('play-icon').firstElementChild.setAttribute('d', on ? PAUSE_ICON : PLAY_ICON);
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  if (on) {
    requestAnimationFrame(frame);
  } else {
    // The URL only tracks time when the clock is not running, so that playback
    // does not rewrite history sixty times a second.
    writeState();
    requestRender();
  }
}

function seek(t) {
  state.t = Math.min(T1, Math.max(T0, t));
  writeState();
  if (!state.playing) requestRender();
}

// -----------------------------------------------------------------------------
// Controls
// -----------------------------------------------------------------------------

/** Mark the pressed button of a segmented control from a value. */
function syncSegmented(el, value) {
  for (const b of el.querySelectorAll('button[data-value]')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === value));
  }
}

function bindSegmented(el, onChange) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    for (const x of el.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    onChange(b.dataset.value);
  });
}

bindSegmented($('units'), (v) => {
  state.units = v;
  writeState();
  syncHeightControls();
  renderScenarioLine();
  renderVerdict();
  requestRender();
});

$('anchor').addEventListener('change', (e) => {
  state.anchor = e.target.value;
  applyFlatModelChange();
});

bindSegmented($('path'), (v) => {
  state.path = v;
  applyFlatModelChange();
});

/** Anything that changes which flat model is on screen goes through here. */
function applyFlatModelChange() {
  const onMap = state.path === 'gleason';
  $('anchor-field').hidden = onMap;
  $('path-note').hidden = !onMap;
  writeState();
  rebuildFlat();
  recomputeMinHeight();
  buildPresets();
  updateCharts();
  renderVerdict();
  requestRender();
}

/**
 * Refraction presets. Each label carries the horizon refraction the code
 * actually produces for that preset, so a label cannot drift from the maths.
 */
function buildRefractionOptions() {
  const select = $('refraction');
  select.replaceChildren();
  for (const p of REFRACTION_PRESETS) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.on
      ? `${p.label} — ${arcmin(refractionFromTrueDeg(0, p.conditions), 0)} at horizon`
      : p.label;
    o.title = p.note;
    select.appendChild(o);
  }
  select.value = state.refraction.id;
  $('refraction-note').textContent = state.refraction.note;
}

$('refraction').addEventListener('change', (e) => {
  state.refraction = REFRACTION_PRESETS.find((p) => p.id === e.target.value) ?? REFRACTION_PRESETS[0];
  $('refraction-note').textContent = state.refraction.note;
  writeState();
  requestRender();
});

$('play').addEventListener('click', () => setPlaying(!state.playing));
$('restart').addEventListener('click', () => { seek(T0); });

// Scrubber, in seconds from the start.
const scrub = $('scrub');
scrub.addEventListener('input', () => seek(T0 + Number(scrub.value) / 3600));

function buildScrubTicks() {
  const el = $('scrub-ticks');
  el.replaceChildren();
  const place = (t, text, cls) => {
    const s = document.createElement('span');
    s.textContent = text;
    if (cls) s.className = cls;
    s.style.left = `${((t - T0) / (T1 - T0)) * 100}%`;
    el.appendChild(s);
  };
  for (const h of hourMarks) {
    if (Math.abs(h - TS) < 2 / 60) continue;
    place(h, formatSolarTime(h).slice(0, 5));
  }
  place(TS, `sunset ${formatSolarTime(TS).slice(0, 5)}`, 'sunset');
}

// Speed: logarithmic, 1x to 3600x.
const SPEED_MAX = 3600;
const speed = $('speed');
const speedFromSlider = (v) => Math.pow(SPEED_MAX, v / 1000);
const sliderFromSpeed = (s) => Math.round((Math.log(s) / Math.log(SPEED_MAX)) * 1000);
function syncSpeed() {
  speed.value = String(sliderFromSpeed(state.speed));
  const secs = ((T1 - T0) * 3600) / state.speed;
  const dur = secs >= 120 ? `${(secs / 60).toFixed(0)} min` : `${secs.toFixed(0)} s`;
  $('speed-value').textContent = `×${Math.round(state.speed)} · ${dur}`;
}
speed.addEventListener('input', () => {
  state.speed = speedFromSlider(Number(speed.value));
  syncSpeed();
  writeState();
});

// Lens: snaps to common focal lengths.
const focal = $('focal');
focal.max = String(COMMON_FOCAL_LENGTHS_MM.length - 1);
function syncFocal() {
  focal.value = String(COMMON_FOCAL_LENGTHS_MM.indexOf(state.focalMm));
  $('loupe').value = String(state.loupeMm);
  $('focal-value').textContent = `${state.focalMm} mm`;
  focal.setAttribute('aria-valuetext', `${state.focalMm} millimetres`);
}
focal.addEventListener('input', () => {
  state.focalMm = COMMON_FOCAL_LENGTHS_MM[Number(focal.value)];
  syncFocal();
  writeState();
  requestRender();
});

$('loupe').addEventListener('change', (e) => {
  state.loupeMm = Number(e.target.value);
  writeState();
  requestRender();
});

// Sun height: logarithmic slider plus a typed value in the current unit.
const heightSlider = $('height-slider');
const heightInput = $('height-input');
const logMin = Math.log10(HEIGHT_MIN_KM), logMax = Math.log10(HEIGHT_MAX_KM);
const sliderFromHeight = (km) => Math.round(((Math.log10(km) - logMin) / (logMax - logMin)) * 1000);
const heightFromSlider = (v) => Math.pow(10, logMin + (v / 1000) * (logMax - logMin));
const inputInMiles = () => state.units === 'imperial';

function syncHeightControls() {
  heightSlider.value = String(sliderFromHeight(state.heightKm));
  const v = inputInMiles() ? kmToMiles(state.heightKm) : state.heightKm;
  if (document.activeElement !== heightInput) heightInput.value = String(Math.round(v));
  $('height-unit').textContent = inputInMiles() ? 'mi' : 'km';
  // The other system alongside, so a height typed in one is readable in both.
  const other = inputInMiles()
    ? `= ${Math.round(state.heightKm).toLocaleString()} km`
    : `= ${Math.round(kmToMiles(state.heightKm)).toLocaleString()} mi`;
  $('height-alt').textContent = state.units === 'both' ? other : '';
  heightSlider.setAttribute('aria-valuetext', dist(state.heightKm, 4));

  const select = $('height-presets');
  let matched = false;
  for (const o of select.options) {
    if (!o.dataset.km) continue;
    o.textContent = o.dataset.label.replace('{h}', dist(Number(o.dataset.km), 4));
    if (Math.abs(Number(o.dataset.km) - state.heightKm) < 0.5) {
      select.value = o.value;
      matched = true;
    }
  }
  if (!matched) select.value = 'custom';
}

function setHeight(km) {
  state.heightKm = Math.min(HEIGHT_MAX_KM, Math.max(HEIGHT_MIN_KM, km));
  rebuildFlat();
  syncHeightControls();
  updateCharts();
  renderVerdict();
  writeState();
  requestRender();
}

heightSlider.addEventListener('input', () => setHeight(heightFromSlider(Number(heightSlider.value))));
heightInput.addEventListener('change', () => {
  const n = Number(heightInput.value);
  if (!Number.isFinite(n) || n <= 0) { syncHeightControls(); return; }
  setHeight(inputInMiles() ? milesToKm(n) : n);
});

function buildPresets() {
  const select = $('height-presets');
  select.replaceChildren();
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = 'Presets…';
  custom.disabled = true;
  select.appendChild(custom);

  const presets = [
    { km: milesToKm(1000), label: '{h} — a commonly quoted flat-Earth height' },
    { km: milesToKm(3000), label: '{h} — another commonly quoted height' },
    {
      // The one height at which both start positions coincide: the Sun is
      // above the real subsolar point AND at the real elevation.
      km: START.groundDistanceToSubsolarKm * Math.tan(START.altitudeDeg * Math.PI / 180),
      label: '{h} — both start positions agree',
    },
  ];
  if (state.minHeightKm) {
    presets.push({ km: state.minHeightKm, label: '{h} — lowest height where the shrink is under 1′ (naked-eye limit)' });
  }
  presets.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.dataset.km = String(p.km);
    o.dataset.label = p.label;
    select.appendChild(o);
  });
  syncHeightControls();
}

$('height-presets').addEventListener('change', (e) => {
  const o = e.target.selectedOptions[0];
  if (o?.dataset.km) setHeight(Number(o.dataset.km));
});

$('table-toggle').addEventListener('click', (e) => {
  state.showTable = !state.showTable;
  e.currentTarget.setAttribute('aria-expanded', String(state.showTable));
  e.currentTarget.textContent = state.showTable ? 'Show comparison' : 'Show data table';
  $('table-view').hidden = !state.showTable;
  $('compare-view').hidden = state.showTable;
  if (state.showTable) buildTable();
});

// Keyboard: space to play, arrows to step, Home/End to jump.
document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
  if (tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === ' ' && tag !== 'BUTTON') {
    e.preventDefault();
    setPlaying(!state.playing);
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && tag !== 'INPUT') {
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) / 60;
    seek(state.t + (e.key === 'ArrowRight' ? step : -step));
  } else if (e.key === 'Home' && tag !== 'INPUT') {
    e.preventDefault(); seek(T0);
  } else if (e.key === 'End' && tag !== 'INPUT') {
    e.preventDefault(); seek(T1);
  }
});

// -----------------------------------------------------------------------------
// Location
// -----------------------------------------------------------------------------

const picker = createGlobePicker($('location-globe'), {
  onPick: (lat, lon) => changeLocation(lat, lon),
});

const formatCoords = (lat, lon) =>
  `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}, ` +
  `${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`;

function locationName(lat, lon) {
  const near = LOCATION_PRESETS.find(
    (p) => Math.abs(p.latDeg - lat) < 0.02 && Math.abs(p.lonDeg - lon) < 0.02,
  );
  return near ? near.name : formatCoords(lat, lon);
}

/**
 * Move the observer. Everything downstream of latitude changes: the time of
 * sunset, how steeply the Sun falls, which way it sets, and so the lens.
 */
function changeLocation(latDeg, lonDeg) {
  const lat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latDeg));
  const lon = norm180(lonDeg);
  applyScenarioChange(() => {
    state.latDeg = lat;
    state.lonDeg = lon;
    state.locationLabel = locationName(lat, lon);
  });
}

const DATE_PRESETS = [
  { name: 'March equinox', iso: '2026-03-20' },
  { name: 'June solstice', iso: '2026-06-21' },
  { name: 'September equinox', iso: '2026-09-23' },
  { name: 'December solstice', iso: '2026-12-21' },
];

/**
 * Change the date. Declination moves, so sunset time, the Sun's path and the
 * subsolar speed all move with it. Some combinations of date and latitude have
 * no sunset at all, and those are refused rather than half-drawn.
 */
function changeDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) {
    syncDateControls();
    return;
  }
  applyScenarioChange(() => { state.dateISO = iso; });
}

/**
 * Apply a change to the scenario, and put it back if the result is a day with
 * no sunset. Holds position through the window, so changing date or place at
 * sunset leaves you at sunset.
 */
function applyScenarioChange(mutate) {
  const fraction = (state.t - T0) / (T1 - T0);
  const previous = { lat: state.latDeg, lon: state.lonDeg, date: state.dateISO };
  mutate();
  try {
    rebuildSession();
  } catch (err) {
    state.latDeg = previous.lat;
    state.lonDeg = previous.lon;
    state.dateISO = previous.date;
    rebuildSession();
    setPickerNote('No sunset there on that date \u2014 the Sun never crosses the horizon. Try another date or latitude.');
    syncLocationControls();
    syncDateControls();
    return;
  }
  state.t = T0 + fraction * (T1 - T0);
  setPickerNote(null);

  syncLocationControls();
  syncDateControls();
  syncFocal();
  buildPresets();
  buildScrubTicks();
  syncSpeed();
  renderScenarioLine();
  updateCharts();
  renderVerdict();
  writeState();
  requestRender();
}

const DEFAULT_PICKER_NOTE = $('picker-note').textContent;
function setPickerNote(text) {
  const el = $('picker-note');
  el.textContent = text ?? DEFAULT_PICKER_NOTE;
  el.style.color = text ? 'var(--flat)' : '';
}

function syncDateControls() {
  $('date-input').value = state.dateISO;
  for (const b of $('date-presets').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.iso === state.dateISO));
  }
}

function buildDatePresets() {
  const el = $('date-presets');
  el.replaceChildren();
  for (const d of DATE_PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = d.name;
    b.dataset.iso = d.iso;
    b.addEventListener('click', () => changeDate(d.iso));
    el.appendChild(b);
  }
  syncDateControls();
}

$('date-input').addEventListener('change', (e) => changeDate(e.target.value));

function syncLocationControls() {
  $('location-label').textContent = state.locationLabel;
  if (document.activeElement !== $('lat-input')) $('lat-input').value = state.latDeg.toFixed(2);
  if (document.activeElement !== $('lon-input')) $('lon-input').value = state.lonDeg.toFixed(2);
  picker.setPoint(state.latDeg, state.lonDeg);
  for (const b of $('location-presets').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.name === state.locationLabel));
  }
}

function buildLocationPresets() {
  const el = $('location-presets');
  el.replaceChildren();
  for (const p of LOCATION_PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p.name;
    b.dataset.name = p.name;
    b.title = formatCoords(p.latDeg, p.lonDeg);
    b.addEventListener('click', () => changeLocation(p.latDeg, p.lonDeg));
    el.appendChild(b);
  }
}

for (const id of ['lat-input', 'lon-input']) {
  $(id).addEventListener('change', () => {
    const lat = Number($('lat-input').value), lon = Number($('lon-input').value);
    if (Number.isFinite(lat) && Number.isFinite(lon)) changeLocation(lat, lon);
    else syncLocationControls();
  });
}

const locationPanel = $('location-panel');
const locationBtn = $('location-btn');
function setPanelOpen(open) {
  locationPanel.hidden = !open;
  locationBtn.setAttribute('aria-expanded', String(open));
  if (open) picker.render();
}
locationBtn.addEventListener('click', () => setPanelOpen(locationPanel.hidden));
document.addEventListener('pointerdown', (e) => {
  if (!locationPanel.hidden && !locationPanel.contains(e.target) && !locationBtn.contains(e.target)) {
    setPanelOpen(false);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !locationPanel.hidden) setPanelOpen(false);
});

function renderScenarioLine() {
  const date = cfg.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const where = state.latDeg === 0 && state.lonDeg === 0
    ? 'on the equator'
    : `at ${formatCoords(state.latDeg, state.lonDeg)}`;
  $('scenario-line').textContent =
    `Observer ${where}, ${date} (equinox), eye height ${formatSmallLength(cfg.eyeHeightM, state.units)}. ` +
    `Sunset ${formatSolarTime(TS).slice(0, 5)}; times are apparent solar time.`;
}

onThemeChange(() => {
  tokens = readTokens();
  sizeChart.setTokens(tokens);
  rateChart.setTokens(tokens);
  picker.setTokens(tokens);
  requestRender();
});

// -----------------------------------------------------------------------------
// URL state
//
// Every setting lives in the location hash. That makes a given moment
// shareable, and it means leaving for the maths page and pressing Back
// restores what you had. Browsers also restore raw form values on history
// navigation, which used to leave a slider sitting at one value while the
// model held another; every control is now written from state, so the two
// cannot disagree.
// -----------------------------------------------------------------------------

let writeStateQueued = false;
function writeState() {
  if (writeStateQueued) return;
  writeStateQueued = true;
  requestAnimationFrame(() => {
    writeStateQueued = false;
    const p = new URLSearchParams({
      d: state.dateISO,
      lat: state.latDeg.toFixed(3),
      lon: state.lonDeg.toFixed(3),
      t: state.t.toFixed(4),
      h: state.heightKm.toFixed(3),
      a: state.anchor,
      p: state.path,
      u: state.units,
      r: state.refraction.id,
      f: String(state.focalMm),
      l: String(state.loupeMm),
      s: String(Math.round(state.speed)),
    });
    history.replaceState(null, '', `#${p}`);
  });
}

function readState() {
  if (!location.hash || location.hash.length < 2) return;
  const p = new URLSearchParams(location.hash.slice(1));
  const num = (key) => {
    const v = Number(p.get(key));
    return p.has(key) && Number.isFinite(v) ? v : null;
  };

  const d = p.get('d');
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
    state.dateISO = d;
  }

  const lat = num('lat'), lon = num('lon');
  if (lat !== null) state.latDeg = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  if (lon !== null) state.lonDeg = norm180(lon);
  state.locationLabel = locationName(state.latDeg, state.lonDeg);

  const r = REFRACTION_PRESETS.find((x) => x.id === p.get('r'));
  if (r) state.refraction = r;
  if (['metric', 'imperial', 'both'].includes(p.get('u'))) state.units = p.get('u');
  if (['elevation', 'subsolar'].includes(p.get('a'))) state.anchor = p.get('a');
  if (['straight', 'gleason'].includes(p.get('p'))) state.path = p.get('p');

  const f = num('f');
  if (f !== null && COMMON_FOCAL_LENGTHS_MM.includes(f)) state.focalMm = f;
  const l = num('l');
  if (l !== null && [400, 800, 1600].includes(l)) state.loupeMm = l;
  const sp = num('s');
  if (sp !== null) state.speed = Math.min(3600, Math.max(1, sp));
  const h = num('h');
  if (h !== null) state.heightKm = Math.min(HEIGHT_MAX_KM, Math.max(HEIGHT_MIN_KM, h));
  const t = num('t');
  if (t !== null) state.t = t;   // clamped to the window once the session exists
}

// -----------------------------------------------------------------------------
// Start
// -----------------------------------------------------------------------------

readState();
rebuildSession();
buildRefractionOptions();
buildLocationPresets();
buildDatePresets();
syncLocationControls();
buildPresets();
buildScrubTicks();
syncSpeed();
syncFocal();
syncSegmented($('units'), state.units);
syncSegmented($('path'), state.path);
$('anchor').value = state.anchor;
$('anchor-field').hidden = state.path === 'gleason';
$('path-note').hidden = state.path !== 'gleason';
renderScenarioLine();
sizeChart.setTokens(tokens);
rateChart.setTokens(tokens);
picker.setTokens(tokens);
updateCharts();
renderVerdict();
render();

// Exposed for inspection from the browser console -- handy for checking a
// number on screen against the model directly.
window.sunset = {
  state,
  changeLocation,
  get scenario() { return scenario; },
  get globe() { return globe; },
  get flat() { return state.flat; },
  get T0() { return T0; },
  get TS() { return TS; },
  get T1() { return T1; },
  get FRAMING() { return FRAMING; },
  /** Jump to a solar time and draw synchronously (works even in a hidden tab). */
  renderAt(t) { state.t = Math.min(T1, Math.max(T0, t)); render(); },
};
