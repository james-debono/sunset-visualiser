/**
 * Verification suite for the physics layer.
 *
 * The page makes a strong empirical claim, so the numbers behind it should be
 * checkable without taking anyone's word for it. These tests fall into three
 * kinds:
 *
 *   1. Against published values -- the Sun's declination and distance at
 *      J2000.0, standard refraction at the horizon, the length of a solar day.
 *   2. Against closed-form identities -- cases where the geometry collapses to
 *      something exactly calculable by hand.
 *   3. Two independent derivations of the same quantity agreeing -- notably the
 *      numerical and analytic rates of change of angular size, which are
 *      written separately and would not agree if either contained an error.
 */

import {
  suite, test, assert, approx, approxRel, lessThan, greaterThan, between, note,
} from './harness.js';

import {
  AU_KM, R_SUN_KM, R_EARTH_EQUATORIAL_KM, SOLAR_DAY_S, KM_PER_MILE,
  NAKED_EYE_RESOLUTION_DEG, milesToKm, norm180, norm360,
} from '../js/physics/constants.js';

import {
  R_EARTH_KM, solarPosition, angularDiameterDeg, distanceForAngularDiameter,
  altitudeGeocentricDeg, azimuthDeg, centralAngleDeg, groundDistanceToSubsolarKm,
  subsolarSpeedKmh, hourAngleAtAltitude, hourAngleFromSolarTime,
  solarTimeFromHourAngle, horizonDipDeg, horizonDistanceKm, horizontalParallaxDeg,
} from '../js/physics/solar.js';

import { makeGlobeModel, observerSunDistanceKm } from '../js/physics/globe.js';
import { makeFlatModel, minimumHeightForImperceptibleShrink } from '../js/physics/flat.js';
import {
  refractionFromTrueDeg, refractionFromApparentDeg, apparentAltitudeDeg, apparentDiscDeg,
  apparentHorizonDipDeg, conditionsFactor, REFRACTION_PRESETS, STANDARD_CONDITIONS,
  MONOTONIC_LIMIT,
} from '../js/physics/refraction.js';
import { buildScenario, summarise, DEFAULT_SCENARIO } from '../js/physics/scenario.js';
import { formatDistance, formatSpeed, formatSolarTime } from '../js/physics/units.js';
import {
  verticalFovDeg, focalForVerticalFovMm, focalPx, cameraBasis, project,
  pitchForHorizonFractionDeg, defaultFraming, discOutline, projectVector,
} from '../js/physics/optics.js';
import { orthographic, inverseOrthographic } from '../js/physics/geo.js';

// -----------------------------------------------------------------------------

suite('Constants and conversions', () => {
  test('mile and foot conversions are the exact defined values', () => {
    approx(KM_PER_MILE, 1.609344, 0, 'international mile is exactly 1.609344 km');
    approx(milesToKm(1000), 1609.344, 1e-9, '1000 miles');
  });

  test('a mean solar day is 86400 s by definition', () => {
    approx(SOLAR_DAY_S, 86400, 0);
  });

  test('angle normalisation', () => {
    approx(norm360(-10), 350, 1e-12);
    approx(norm360(370), 10, 1e-12);
    approx(norm180(350), -10, 1e-12);
    approx(norm180(180), 180, 1e-12);
  });
});

suite('Solar angular diameter', () => {
  test('the Sun subtends 0.5329 deg (31.97 arcmin) at 1 AU', () => {
    const theta = angularDiameterDeg(AU_KM);
    note('theta at 1 AU', `${theta.toFixed(5)} deg = ${(theta * 60).toFixed(3)} arcmin`);
    // Published apparent diameter at 1 AU is 31.97 arcmin / 1919 arcsec.
    approx(theta * 60, 31.97, 0.01, 'arcminutes at 1 AU');
  });

  test('angular diameter and its inverse round-trip', () => {
    const d = 1.23e8;
    approxRel(distanceForAngularDiameter(angularDiameterDeg(d)), d, 1e-12);
  });

  test('angular diameter uses asin, not atan (they differ at close range)', () => {
    // At one solar radius of clearance the two disagree grossly; this pins the
    // geometry as "tangent to the limb" rather than "through the centre plane".
    const d = 2 * R_SUN_KM;
    approx(angularDiameterDeg(d), 60, 1e-9, 'a sphere at 2R subtends exactly 60 deg');
  });

  test('solar horizontal parallax is about 8.79 arcsec', () => {
    const p = horizontalParallaxDeg(AU_KM) * 3600;
    note('horizontal parallax', `${p.toFixed(3)} arcsec`);
    approx(p, 8.794, 0.01);
  });
});

suite('Ephemeris against published values', () => {
  test('Sun at J2000.0: declination -23.03 deg, distance 0.98330 AU', () => {
    const s = solarPosition(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)));
    note('declination', `${s.declinationDeg.toFixed(4)} deg`);
    note('distance', `${s.distanceAU.toFixed(6)} AU`);
    note('right ascension', `${s.rightAscensionDeg.toFixed(3)} deg`);
    approx(s.declinationDeg, -23.03, 0.05, 'declination at J2000.0');
    approx(s.distanceAU, 0.98330, 0.0002, 'Earth-Sun distance at J2000.0');
    approx(s.rightAscensionDeg, 281.29, 0.15, 'right ascension at J2000.0');
  });

  test('the predicted September 2026 equinox lands within half an hour of the real one', () => {
    // Stronger than checking declination at an assumed instant: solve for the
    // moment the formula puts declination at zero, then compare that to the
    // published equinox (2026-09-23 00:05 UTC). The formula is specified as
    // good to 0.01 deg in ecliptic longitude, which is about 15 minutes of
    // time, so this is a real test of it rather than a restatement.
    let lo = Date.UTC(2026, 8, 22), hi = Date.UTC(2026, 8, 24);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (solarPosition(new Date(mid)).declinationDeg > 0) lo = mid; else hi = mid;
    }
    const predicted = (lo + hi) / 2;
    const published = Date.UTC(2026, 8, 23, 0, 5, 0);
    const errMin = (predicted - published) / 60000;
    note('predicted equinox', new Date(predicted).toISOString());
    note('published equinox', new Date(published).toISOString());
    note('error', `${errMin.toFixed(1)} minutes`);
    lessThan(Math.abs(errMin), 30, 'equinox timing error, minutes');
  });

  test('declination swings to the solstice extremes', () => {
    const jun = solarPosition(new Date(Date.UTC(2026, 5, 21, 12))).declinationDeg;
    const dec = solarPosition(new Date(Date.UTC(2026, 11, 21, 12))).declinationDeg;
    approx(jun, 23.44, 0.06, 'June solstice declination');
    approx(dec, -23.44, 0.06, 'December solstice declination');
  });

  test('Earth-Sun distance spans perihelion to aphelion correctly', () => {
    const per = solarPosition(new Date(Date.UTC(2026, 0, 3, 12))).distanceAU;
    const aph = solarPosition(new Date(Date.UTC(2026, 6, 6, 12))).distanceAU;
    note('perihelion', `${per.toFixed(5)} AU`);
    note('aphelion', `${aph.toFixed(5)} AU`);
    approx(per, 0.98330, 0.0005);
    approx(aph, 1.01670, 0.0005);
  });

  test('equation of time has the right sign and scale in early November', () => {
    // Near 3 November the Sun is about 16.4 minutes ahead of the mean Sun.
    const e = solarPosition(new Date(Date.UTC(2026, 10, 3, 12))).equationOfTimeMin;
    note('equation of time, 3 Nov', `${e.toFixed(2)} min`);
    between(e, 15.0, 17.5, 'equation of time in early November');
  });
});

suite('Observer geometry on a sphere', () => {
  test('equator at equinox: altitude equals 90 minus hour angle', () => {
    for (const H of [0, 15, 30, 45, 60, 75, 90]) {
      approx(altitudeGeocentricDeg(0, 0, H), 90 - H, 1e-9, `hour angle ${H}`);
    }
  });

  test('three hours before sunset on the equator, the Sun is at exactly 45 deg', () => {
    const H = hourAngleFromSolarTime(15);
    approx(H, 45, 1e-12);
    approx(altitudeGeocentricDeg(0, 0, H), 45, 1e-9);
  });

  test('geometric sunset on the equator at equinox is hour angle 90 (18:00)', () => {
    approx(hourAngleAtAltitude(0, 0, 0), 90, 1e-9);
    approx(solarTimeFromHourAngle(90), 18, 1e-12);
  });

  test('the Sun sets due west at the equinox', () => {
    approx(azimuthDeg(0, 0, 90), 270, 1e-6, 'azimuth at sunset');
    approx(azimuthDeg(40, 0, 90), 270, 1e-6, 'and from any latitude, at equinox');
  });

  test('polar night is reported as no sunset rather than a bogus number', () => {
    assert(hourAngleAtAltitude(85, -23.44, 0) === null, 'no sunrise inside the polar night');
  });

  test('central angle is the complement of altitude', () => {
    approx(centralAngleDeg(0, 0, 45), 45, 1e-9);
    approx(centralAngleDeg(0, 0, 90), 90, 1e-9);
  });

  test('ground distance to the subsolar point matches subsolar speed x time', () => {
    // At the equator at equinox the subsolar point runs along a great circle,
    // so these two independent routes to the same distance must agree exactly.
    const viaArc = groundDistanceToSubsolarKm(0, 0, 45);
    const viaSpeed = subsolarSpeedKmh(0) * 3;
    note('via great-circle arc', `${viaArc.toFixed(2)} km`);
    note('via subsolar speed x 3 h', `${viaSpeed.toFixed(2)} km`);
    approxRel(viaArc, viaSpeed, 1e-12, 'arc length vs speed x time');
  });

  test('subsolar speed at the equator is about 1670 km/h', () => {
    const v = subsolarSpeedKmh(0);
    note('subsolar speed', `${v.toFixed(2)} km/h = ${(v / KM_PER_MILE).toFixed(2)} mph`);
    approx(v, 1669.79, 0.01);
    approxRel(v, 2 * Math.PI * R_EARTH_EQUATORIAL_KM / 24, 1e-12);
  });

  test('horizon dip and distance for a standing observer', () => {
    const dip = horizonDipDeg(1.7), dist = horizonDistanceKm(1.7);
    note('dip at 1.7 m', `${(dip * 60).toFixed(2)} arcmin`);
    note('horizon distance at 1.7 m', `${dist.toFixed(2)} km`);
    approx(dist, 4.65, 0.05, 'about 4.7 km, the familiar figure');
    approx(dip * 60, 2.5, 0.1, 'about 2.5 arcmin');
  });
});

suite('Observer-to-Sun distance', () => {
  const D = AU_KM, R = R_EARTH_KM;

  test('Sun overhead: distance is exactly D - R', () => {
    approxRel(observerSunDistanceKm(D, 90), D - R, 1e-12);
  });

  test('Sun on the horizon: distance is exactly sqrt(D^2 + R^2)', () => {
    approxRel(observerSunDistanceKm(D, 0), Math.hypot(D, R), 1e-12);
  });

  test('at 45 deg the observer is about 4500 km nearer than at the horizon', () => {
    const d45 = observerSunDistanceKm(D, 45);
    const d0 = observerSunDistanceKm(D, 0);
    note('distance change, 45 deg to horizon', `${(d0 - d45).toFixed(1)} km`);
    approx(d0 - d45, R * Math.SQRT1_2, 1.0, 'approximately R cos(45 deg)');
  });
});

suite('Globe model over the three-hour window', () => {
  const sc = buildScenario();
  const s = summarise(sc);

  test('the window starts at 15:00 and ends at 18:00 apparent solar time', () => {
    approx(sc.startSolarTime, 15, 0.02, 'start');
    approx(sc.endSolarTime, 18, 0.02, 'sunset');
  });

  test('the Sun starts at 45 deg and ends on the horizon', () => {
    note('start altitude', `${s.globe.startAltDeg.toFixed(4)} deg`);
    note('end altitude', `${s.globe.endAltDeg.toFixed(4)} deg`);
    approx(s.globe.startAltDeg, 45, 0.02);
    approx(s.globe.endAltDeg, 0, 0.02);
  });

  test('observer-Sun distance changes by only a few thousand km in 150 million', () => {
    note('start distance', `${s.globe.startDistanceKm.toFixed(0)} km`);
    note('end distance', `${s.globe.endDistanceKm.toFixed(0)} km`);
    note('change', `${s.globe.distanceChangeKm.toFixed(0)} km`);
    note('as a fraction', `${(s.globe.distanceChangeKm / s.globe.startDistanceKm * 100).toFixed(5)} %`);
    lessThan(Math.abs(s.globe.distanceChangeKm / s.globe.startDistanceKm), 1e-4,
      'distance change is under 0.01% of the distance');
  });

  test('angular diameter change is far below what an eye can resolve', () => {
    note('start', `${s.globe.startDeg.toFixed(6)} deg`);
    note('end', `${s.globe.endDeg.toFixed(6)} deg`);
    note('change', `${s.globe.changeArcsec.toFixed(4)} arcsec (${s.globe.changePercent.toFixed(5)} %)`);
    note('naked-eye limit', `${(NAKED_EYE_RESOLUTION_DEG * 3600).toFixed(0)} arcsec`);
    lessThan(Math.abs(s.globe.changeArcsec), NAKED_EYE_RESOLUTION_DEG * 3600 / 100,
      'change is at least 100x below naked-eye resolution');
  });

  test('rotation and orbital motion partly cancel, so the total is smaller still', () => {
    // Worth stating plainly: during a September afternoon the Sun is very
    // slightly *growing*, because Earth falls toward perihelion faster than
    // rotation carries the observer away. The honest total is the sum, and it
    // is smaller than either part -- so quoting only rotation would actually
    // overstate the change.
    const b = sc.globe.angularRateBreakdown(15);
    note('rotational', `${(b.rotationalDegPerHour * 3600).toExponential(4)} arcsec/h`);
    note('orbital', `${(b.orbitalDegPerHour * 3600).toExponential(4)} arcsec/h`);
    note('total', `${(b.totalDegPerHour * 3600).toExponential(4)} arcsec/h`);
    approx(b.rotationalDegPerHour + b.orbitalDegPerHour, b.totalDegPerHour, 1e-18,
      'the two parts must sum to the total exactly');
    lessThan(b.rotationalDegPerHour, 0, 'rotation carries the observer away: shrinking');
    greaterThan(b.orbitalDegPerHour, 0, 'in September Earth is approaching the Sun: growing');
  });

  test('numerical and analytic rates of change agree', () => {
    // Two independently written derivations: one differentiates the sampled
    // curve, the other the closed form. They share no algebra. Because the two
    // physical terms nearly cancel, the surviving total is a small residual, so
    // the comparison is made on an absolute scale set by the terms themselves
    // rather than on the residual, where any relative tolerance would be
    // meaningless.
    for (const t of [15, 15.75, 16.5, 17.25, 17.9]) {
      const num = sc.globe.angularRateDegPerHour(t);
      const ana = sc.globe.angularRateAnalyticDegPerHour(t);
      const b = sc.globe.angularRateBreakdown(t);
      const scale = Math.abs(b.rotationalDegPerHour) + Math.abs(b.orbitalDegPerHour);
      note(`t=${t.toFixed(2)}`,
        `numeric ${(num * 3600).toExponential(4)} vs analytic ${(ana * 3600).toExponential(4)} arcsec/h` +
        `  (diff ${((num - ana) / scale).toExponential(2)} of term scale)`);
      approx(num, ana, scale * 1e-5, `rate at solar time ${t}`);
    }
  });
});

suite('Flat model: calibration and consequences', () => {
  const sc = buildScenario();
  const s = summarise(sc);

  test('the flat Sun is calibrated to the correct angular size at the start', () => {
    approxRel(s.flat.startDeg, s.globe.startDeg, 1e-12,
      'flat and globe must look identical at t=0 by construction');
  });

  test('with the elevation anchor it also starts at the correct elevation', () => {
    approx(s.flat.startAltDeg, s.globe.startAltDeg, 1e-9,
      'same starting elevation by construction');
  });

  test('the implied Sun is about 21 km across at 1000 miles up', () => {
    note('flat Sun diameter', `${s.flat.sunDiameterKm.toFixed(2)} km`);
    note('height', `${DEFAULT_SCENARIO.flatHeightKm.toFixed(1)} km (1000 miles)`);
    approx(s.flat.sunDiameterKm, 21.17, 0.1);
  });

  test('the flat Sun shrinks to about a third of its starting size', () => {
    note('start', `${s.flat.startDeg.toFixed(4)} deg`);
    note('end', `${s.flat.endDeg.toFixed(4)} deg`);
    note('remaining fraction', `${(s.flat.remainingFraction * 100).toFixed(1)} %`);
    approx(s.flat.remainingFraction, 0.334, 0.005);
  });

  test('the shrink is thousands of times larger than the globe model predicts', () => {
    note('ratio of the two changes', `${s.ratio.toExponential(3)} times`);
    greaterThan(s.ratio, 1000, 'flat-model change vs globe-model change');
  });

  test('the flat Sun never reaches the horizon', () => {
    note('altitude at the moment of real sunset', `${s.flat.endAltDeg.toFixed(2)} deg`);
    greaterThan(s.flat.endAltDeg, 5, 'still well above the horizon when the real Sun has set');
    // And it stays up indefinitely: check far past the window.
    const late = sc.flat.sample(sc.endSolarTime + 6).altitudeDeg;
    note('altitude six hours later', `${late.toFixed(2)} deg`);
    greaterThan(late, 0, 'a Sun on a plane can only approach the horizon asymptotically');
  });

  test('numerical and analytic rates of change agree', () => {
    for (const t of [15, 16, 17, 18]) {
      const num = sc.flat.angularRateDegPerHour(t);
      const ana = sc.flat.angularRateAnalyticDegPerHour(t);
      note(`t=${t}`, `${(num * 60).toFixed(4)} vs ${(ana * 60).toFixed(4)} arcmin/h`);
      approxRel(num, ana, 5e-5, `flat rate at solar time ${t}`);
    }
  });

  test('the residual gap is central-difference truncation, not an algebra error', () => {
    // A central difference has error O(step^2), so halving the step must
    // quarter the gap. If instead the two derivations disagreed because one was
    // wrong, the gap would stay put. This distinguishes the two cases outright.
    const ana = sc.flat.angularRateAnalyticDegPerHour(15);
    const errs = [1 / 30, 1 / 60, 1 / 120, 1 / 240].map(
      (h) => Math.abs(sc.flat.angularRateDegPerHour(15, h) - ana),
    );
    for (let i = 1; i < errs.length; i++) {
      const factor = errs[i - 1] / errs[i];
      note(`step halved (${i})`, `error fell by ${factor.toFixed(2)}x`);
      approx(factor, 4, 0.3, 'second-order convergence');
    }
  });

  test('a higher Sun shrinks less, monotonically', () => {
    let prev = -Infinity;
    for (const h of [500, 1000, 2000, 5000, 20000, 100000]) {
      const m = sc.withFlatHeight(h);
      const frac = m.sample(sc.endSolarTime).angularDiameterDeg
                 / m.sample(sc.startSolarTime).angularDiameterDeg;
      note(`h = ${h} km`, `shrinks to ${(frac * 100).toFixed(1)} %`);
      greaterThan(frac, prev, 'remaining fraction must increase with height');
      prev = frac;
    }
  });

  test('to hide the shrink the Sun would need to be tens of thousands of km up', () => {
    const h = sc.minimumImperceptibleHeightKm();
    note('minimum height for a sub-arcminute change', `${h.toFixed(0)} km`);
    note('that is', `${(h / (2 * R_EARTH_KM)).toFixed(1)} Earth diameters`);
    between(h, 50000, 120000, 'minimum height');
  });

  test('the subsolar anchor uses the measured ground distance instead', () => {
    const f = sc.withFlatHeight(DEFAULT_SCENARIO.flatHeightKm, 'subsolar');
    note('measured ground distance at t=0', `${f.startHorizontalKm.toFixed(0)} km`);
    note('starting elevation', `${f.sample(sc.startSolarTime).altitudeDeg.toFixed(2)} deg`);
    approxRel(f.startHorizontalKm, sc.globe.sample(sc.startSolarTime).groundDistanceToSubsolarKm,
      1e-12, 'subsolar anchor must use the measured distance verbatim');
    approx(f.sample(sc.startSolarTime).altitudeDeg, 17.81, 0.1,
      'and consequently starts at the wrong elevation');
  });

  test('the elevation anchor reports its own inconsistency', () => {
    const f = sc.flat;
    note('implied ground distance', `${f.startHorizontalKm.toFixed(0)} km`);
    note('measured ground distance', `${f.measuredGroundDistanceKm.toFixed(0)} km`);
    greaterThan(Math.abs(f.measuredGroundDistanceKm - f.startHorizontalKm), 1000,
      'the gap is large and must be surfaced, not hidden');
  });
});

suite('Refraction', () => {
  test('refraction at the horizon is about 34 arcmin (Bennett, apparent altitude 0)', () => {
    const r = refractionFromApparentDeg(0) * 60;
    note('Bennett at apparent 0 deg', `${r.toFixed(2)} arcmin`);
    approx(r, 34.5, 0.3);
  });

  test('refraction at true altitude 0 is about 29 arcmin (Saemundsson)', () => {
    const r = refractionFromTrueDeg(0) * 60;
    note('Saemundsson at true 0 deg', `${r.toFixed(2)} arcmin`);
    approx(r, 29.0, 0.5);
  });

  test('the two formulae are mutual inverses to within an arcminute', () => {
    for (const trueAlt of [0, 1, 5, 20, 60]) {
      const app = apparentAltitudeDeg(trueAlt);
      const back = app - refractionFromApparentDeg(app);
      approx(back, trueAlt, 1 / 60, `round trip at true altitude ${trueAlt}`);
    }
  });

  test('refraction falls off rapidly with altitude', () => {
    approx(refractionFromTrueDeg(45) * 60, 1.0, 0.2, 'about 1 arcmin at 45 deg');
    lessThan(refractionFromTrueDeg(80) * 60, 0.3, 'negligible near the zenith');
  });

  test('the disc is squashed vertically at the horizon but not widened', () => {
    const d = apparentDiscDeg(0, 0.5329);
    note('vertical', `${d.verticalDeg.toFixed(4)} deg`);
    note('horizontal', `${d.horizontalDeg.toFixed(4)} deg`);
    note('flattening', `${(d.flattening * 100).toFixed(1)} % of circular`);
    between(d.flattening, 0.78, 0.92, 'roughly 15% flattening at the horizon');
    approx(d.horizontalDeg, 0.5329, 1e-12, 'width is untouched');
    lessThan(d.verticalDeg, 0.5329, 'refraction can only compress the disc, never enlarge it');
  });

  test('refraction reduces the sea-horizon dip, but only slightly', () => {
    const geo = horizonDipDeg(1.7) * 60, app = apparentHorizonDipDeg(1.7) * 60;
    note('geometric dip at 1.7 m', `${geo.toFixed(2)} arcmin`);
    note('apparent dip at 1.7 m', `${app.toFixed(2)} arcmin`);
    lessThan(app, geo, 'refraction lifts the horizon');
    approx(app / geo, 1.76 / 1.93, 0.01, 'the standard navigational ratio');
  });

  test('refraction is negligible at the start of the window', () => {
    lessThan(refractionFromTrueDeg(45) * 3600, 70,
      'under 70 arcsec at 45 deg, against a 1919 arcsec disc');
  });
});

suite('Scenario robustness', () => {
  test('a mid-latitude scenario builds and still shows the same contrast', () => {
    const sc = buildScenario({
      label: 'Melbourne, equinox',
      latDeg: -37.8136, lonDeg: 144.9631,
    });
    const s = summarise(sc);
    note('sunset (apparent solar)', formatSolarTime(sc.sunsetSolarTime));
    note('start altitude', `${s.globe.startAltDeg.toFixed(2)} deg`);
    note('globe change', `${s.globe.changeArcsec.toFixed(4)} arcsec`);
    note('flat remaining', `${(s.flat.remainingFraction * 100).toFixed(1)} %`);
    lessThan(Math.abs(s.globe.changeArcsec), 1, 'globe model still essentially unchanged');
    lessThan(s.flat.remainingFraction, 0.9, 'flat model still shrinks noticeably');
  });

  test('a solstice scenario builds and the subsolar speed drops with declination', () => {
    const sc = buildScenario({ date: new Date(Date.UTC(2026, 5, 21)), latDeg: 23.44 });
    note('declination', `${sc.declinationDeg.toFixed(2)} deg`);
    note('subsolar speed', `${sc.flat.speedKmh.toFixed(1)} km/h`);
    approx(sc.flat.declinationDeg, sc.declinationDeg, 1e-12,
      'the scenario and the flat model must use one declination, not two');
    approxRel(sc.flat.speedKmh, subsolarSpeedKmh(sc.declinationDeg), 1e-12);
    lessThan(sc.flat.speedKmh, subsolarSpeedKmh(0), 'slower than at the equator');
  });

  test('polar day is refused with a clear message, not a silent wrong answer', () => {
    let threw = false;
    try {
      buildScenario({ date: new Date(Date.UTC(2026, 5, 21)), latDeg: 85 });
    } catch (e) {
      threw = true;
      assert(/polar/i.test(e.message), 'message should explain why');
    }
    assert(threw, 'should refuse to build a scenario with no sunset');
  });
});

suite('Formatting', () => {
  test('distance formats in both systems', () => {
    note('metric', formatDistance(5009.4, 'metric'));
    note('imperial', formatDistance(5009.4, 'imperial'));
    note('both', formatDistance(5009.4, 'both'));
    assert(formatDistance(5009.4, 'metric').includes('km'));
    assert(formatDistance(5009.4, 'imperial').includes('mi'));
    assert(formatDistance(5009.4, 'both').includes('km') &&
           formatDistance(5009.4, 'both').includes('mi'));
  });

  test('speed formats in both systems', () => {
    note('both', formatSpeed(1669.79, 'both'));
    assert(formatSpeed(1669.79, 'imperial').includes('mph'));
  });

  test('solar time formats as a clock', () => {
    approx(0, 0, 0);
    assert(formatSolarTime(15.5) === '15:30:00', formatSolarTime(15.5));
    assert(formatSolarTime(18) === '18:00:00', formatSolarTime(18));
  });
});

suite('Camera optics', () => {
  test('field of view matches the textbook figures for full frame', () => {
    note('24 mm', `${verticalFovDeg(24).toFixed(2)} deg vertical`);
    note('35 mm', `${verticalFovDeg(35).toFixed(2)} deg vertical`);
    approx(verticalFovDeg(24), 53.13, 0.01, '24 mm vertical FOV');
    approx(verticalFovDeg(50), 26.99, 0.01, '50 mm vertical FOV');
    approxRel(focalForVerticalFovMm(verticalFovDeg(85)), 85, 1e-12, 'round trip');
  });

  test('a point straight ahead projects to the image centre', () => {
    const cam = { basis: cameraBasis(270, 20), fPx: 1000 };
    const p = project(20, 270, cam);
    approx(p.x, 0, 1e-9); approx(p.y, 0, 1e-9);
  });

  test('projection is rectilinear: offset = f tan(angle)', () => {
    const cam = { basis: cameraBasis(270, 0), fPx: 1000 };
    approx(project(30, 270, cam).y, 1000 * Math.tan(30 * Math.PI / 180), 1e-9, 'vertical');
    // Facing west, north is to the right.
    greaterThan(project(0, 300, cam).x, 0, 'north of west appears to the right');
    assert(project(0, 90, cam) === null, 'a point behind the camera is not drawn');
  });

  test('the loupe must be aimed at the Sun: edge-of-frame stretch is real and large', () => {
    // Why the loupe is its own camera. A 0.53 deg disc 22.6 deg off-axis is
    // drawn noticeably taller than the same disc on-axis.
    const cam = { basis: cameraBasis(270, 22.63), fPx: 1000 };
    const r = 0.5329 / 2;
    const onAxis = project(22.63 + r, 270, cam).y - project(22.63 - r, 270, cam).y;
    const offAxis = project(45 + r, 270, cam).y - project(45 - r, 270, cam).y;
    note('vertical stretch 22.6 deg off-axis', `${((offAxis / onAxis - 1) * 100).toFixed(1)} %`);
    between(offAxis / onAxis, 1.15, 1.20, 'about 1/cos^2(22.6 deg)');
  });

  test('pitch places the horizon at the requested height in frame', () => {
    const f = 24, H = 1000, frac = 0.08;
    const cam = { basis: cameraBasis(270, pitchForHorizonFractionDeg(f, frac)), fPx: focalPx(f, H) };
    const yFromBottom = H / 2 + project(0, 270, cam).y;
    approx(yFromBottom / H, frac, 1e-9);
  });

  test('default framing: 24 mm is the narrowest common lens holding horizon to Sun at 2% margins', () => {
    const top = 45 + 0.5311 / 2;
    const fr = defaultFraming(top, 0.02);
    note('longest lens that fits', `${fr.maxFocalMm.toFixed(2)} mm`);
    note('chosen', `${fr.focalMm} mm`);
    note('horizon from bottom', `${(fr.horizonFraction * 100).toFixed(2)} % of frame height`);
    assert(fr.focalMm === 24, `expected 24 mm, got ${fr.focalMm}`);
    greaterThan(fr.horizonFraction, 0.02, 'margin respected');
    // And the Sun's top edge is inside the frame by the same margin.
    const cam = { basis: cameraBasis(270, top / 2), fPx: focalPx(24, 1000) };
    const topY = 500 + project(top, 270, cam).y;
    approx(1 - topY / 1000, fr.horizonFraction, 1e-9, 'symmetric margins');
  });

  test('a disc outline viewed head-on subtends exactly its angular diameter', () => {
    // Aim a camera straight at the disc: the projected outline must span
    // 2 f tan(r) in both axes, for any altitude of the disc.
    for (const alt of [0, 20, 45, 70]) {
      const cam = { basis: cameraBasis(270, alt), fPx: 1000 };
      const pts = discOutline(alt, 270, 0.25, 0.25, 64).map((v) => projectVector(v, cam));
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const expected = 2 * 1000 * Math.tan(0.25 * Math.PI / 180);
      approxRel(Math.max(...xs) - Math.min(...xs), expected, 1e-6, `width at altitude ${alt}`);
      approxRel(Math.max(...ys) - Math.min(...ys), expected, 1e-6, `height at altitude ${alt}`);
    }
  });
});

suite('Refraction settings', () => {
  test('standard conditions are the unscaled formula', () => {
    approx(conditionsFactor(), 1, 1e-12, 'no arguments means standard');
    approx(conditionsFactor(STANDARD_CONDITIONS), 1, 1e-12);
  });

  test('denser air refracts more, thinner air less', () => {
    const cold = conditionsFactor({ temperatureC: -20, pressureHPa: 1020 });
    const hot = conditionsFactor({ temperatureC: 40, pressureHPa: 1005 });
    note('cold 1020 hPa / -20 C', `x${cold.toFixed(4)}`);
    note('hot 1005 hPa / 40 C', `x${hot.toFixed(4)}`);
    greaterThan(cold, 1, 'cold, high pressure');
    lessThan(hot, 1, 'hot, low pressure');
    // Weather alone spans only a narrow range, which is why `scale` exists.
    between(cold / hot, 1.2, 1.5, 'full weather range, cold vs hot');
  });

  test('the anomalous-refraction multiplier scales the result exactly', () => {
    for (const scale of [0.5, 2, 4]) {
      approxRel(refractionFromTrueDeg(0, { scale }), refractionFromTrueDeg(0) * scale, 1e-12,
        `scale ${scale}`);
    }
  });

  test('every preset reports the refraction the code produces, in order', () => {
    const on = REFRACTION_PRESETS.filter((p) => p.on);
    const values = on.map((p) => refractionFromTrueDeg(0, p.conditions) * 60);
    on.forEach((p, i) => note(p.label, `${values[i].toFixed(1)} arcmin at the horizon`));
    assert(REFRACTION_PRESETS[0].on === false, 'the first preset is "off"');
    const byId = (id) => values[on.findIndex((p) => p.id === id)];
    lessThan(byId('hot'), byId('standard'), 'hot day vs standard');
    greaterThan(byId('cold'), byId('standard'), 'cold day vs standard');
    greaterThan(byId('cold-high'), byId('cold'), 'cold and high pressure vs cold');
    greaterThan(byId('inversion'), byId('cold-high'), 'inversion vs the weather extreme');
    greaterThan(byId('mirage'), byId('inversion'), 'mirage vs inversion');
    approx(byId('mirage'), byId('standard') * 4, 1e-9, 'the x4 preset is exactly x4');
  });

  test('no amount of refraction widens the disc: width is exactly untouched', () => {
    // The whole reason refraction cannot rescue the flat model. However hard it
    // is pushed, and however far below the horizon the Sun goes, it compresses
    // the height and leaves the width alone.
    //
    // The below-horizon altitudes here matter: without the monotonic clamp in
    // refraction.js, the Saemundsson formula turns over near -1.9 deg and
    // refracts the upper limb more than the lower, which stretched the disc to
    // 75 arcmin tall against a 32 arcmin width. The app's timeline reaches
    // those altitudes, so the test has to as well.
    const theta = 0.5311;
    for (const p of REFRACTION_PRESETS.filter((x) => x.on)) {
      for (const alt of [45, 20, 5, 1, 0, -0.5, -1, -1.9, -2.5, -3.5, -4]) {
        const d = apparentDiscDeg(alt, theta, p.conditions);
        approx(d.horizontalDeg, theta, 0, `${p.id} at ${alt} deg: width`);
        lessThan(d.verticalDeg, theta + 1e-12, `${p.id} at ${alt} deg: height`);
      }
    }
    const extreme = apparentDiscDeg(0, theta, { scale: 4 });
    note('at x4 refraction on the horizon', `height ${(extreme.flattening * 100).toFixed(1)} % of width`);
    lessThan(extreme.flattening, 0.6, 'a x4 disc is squashed hard');
  });

  test('refraction never falls as the Sun sinks: it saturates instead', () => {
    // Real refraction keeps growing with depth; the formulae stop doing so
    // below their turning point, so they are clamped there. Holding the value
    // understates the lift, which is the safe direction to be wrong in.
    note('Saemundsson clamp', `${MONOTONIC_LIMIT.trueDeg.toFixed(4)} deg true altitude`);
    note('Bennett clamp', `${MONOTONIC_LIMIT.apparentDeg.toFixed(4)} deg apparent altitude`);
    let prev = 0;
    for (let alt = 60; alt >= -6; alt -= 0.25) {
      const r = refractionFromTrueDeg(alt);
      assert(r >= prev - 1e-12, `refraction fell going down past ${alt} deg`);
      prev = r;
    }
    const atLimit = refractionFromTrueDeg(MONOTONIC_LIMIT.trueDeg);
    approx(refractionFromTrueDeg(-6), atLimit, 1e-12, 'held at the clamp below the limit');
    note('maximum modelled refraction', `${(atLimit * 60).toFixed(2)} arcmin (standard air)`);

    let prevB = 0;
    for (let alt = 60; alt >= -6; alt -= 0.25) {
      const r = refractionFromApparentDeg(alt);
      assert(r >= prevB - 1e-12, `Bennett fell going down past ${alt} deg`);
      prevB = r;
    }
  });

  test('a x4 mirage lifts the Sun by about two degrees', () => {
    const lift = refractionFromTrueDeg(0, { scale: 4 });
    note('lift at true altitude 0', `${lift.toFixed(3)} deg`);
    between(lift, 1.8, 2.1);
  });

  test('stronger refraction lifts the sea horizon further', () => {
    const one = apparentHorizonDipDeg(1.7);
    const two = apparentHorizonDipDeg(1.7, { scale: 2 });
    note('dip at standard', `${(one * 60).toFixed(2)} arcmin`);
    note('dip at x2', `${(two * 60).toFixed(2)} arcmin`);
    lessThan(two, one, 'more refraction means less dip');
    greaterThan(two, 0, 'but the horizon does not rise above the horizontal here');
  });
});

suite('Globe projection (location picker)', () => {
  test('projecting and un-projecting a point returns the same place', () => {
    const views = [[0, 0], [-37.8, 144.96], [64, -22], [80, 170]];
    const points = [[0, 0], [51.5, -0.13], [-33.87, 151.21], [-0.18, -78.47], [64.13, -21.9], [89, 45]];
    for (const [lat0, lon0] of views) {
      for (const [lat, lon] of points) {
        const p = orthographic(lat, lon, lat0, lon0);
        if (!p.visible) continue;
        const back = inverseOrthographic(p.x, p.y, lat0, lon0);
        approx(back.latDeg, lat, 1e-9, `latitude from view ${lat0},${lon0}`);
        // Longitude is undefined at the poles, where every meridian meets.
        if (Math.abs(lat) < 89.999) {
          const wrapped = ((back.lonDeg - lon + 540) % 360) - 180;   // to (-180, 180]
          approx(wrapped, 0, 1e-7, 'longitude');
        }
      }
    }
  });

  test('the point under the viewer is at the centre, and the far side is hidden', () => {
    const p = orthographic(-37.8, 144.96, -37.8, 144.96);
    approx(p.x, 0, 1e-12); approx(p.y, 0, 1e-12);
    assert(p.visible, 'the point being looked at is visible');
    const anti = orthographic(37.8, 144.96 - 180, -37.8, 144.96);
    assert(!anti.visible, 'its antipode is not');
  });

  test('a click outside the disc is rejected rather than snapped to the edge', () => {
    assert(inverseOrthographic(1.2, 0, 0, 0) === null);
    assert(inverseOrthographic(0.8, 0.8, 0, 0) === null, 'outside by the diagonal');
    assert(inverseOrthographic(0.7, 0.7, 0, 0) !== null, 'just inside');
  });

  test('north is up: increasing latitude moves up the screen', () => {
    const a = orthographic(10, 0, 0, 0), b = orthographic(20, 0, 0, 0);
    greaterThan(b.y, a.y, 'higher latitude is higher on screen');
    const e = orthographic(0, 10, 0, 0);
    greaterThan(e.x, 0, 'east is to the right');
  });
});

suite('Framing away from the equator', () => {
  test('a Sun that swings in azimuth forces a wider lens', () => {
    // Vertical span alone would allow a long lens at high latitude, but the
    // Sun also tracks sideways, and the frame has to hold that too.
    const tall = defaultFraming(8, 0.02, undefined, 0);
    const swinging = defaultFraming(8, 0.02, undefined, 40);
    note('8 deg vertical, no swing', `${tall.focalMm} mm`);
    note('8 deg vertical, 40 deg swing', `${swinging.focalMm} mm`);
    lessThan(swinging.focalMm, tall.focalMm, 'the swing wins');
    lessThan(swinging.maxFocalMm, 18 / Math.tan(20 * Math.PI / 180) + 1e-9, 'bounded by width');
  });

  test('at the equator the Sun does not swing, so the lens is unchanged', () => {
    const a = defaultFraming(45.27, 0.02, undefined, 0.53);
    assert(a.focalMm === 24, `expected 24 mm, got ${a.focalMm}`);
    approx(a.horizonFraction, 0.0831, 0.001, 'horizon still 8.3% up the frame');
  });

  test('the horizon stays near the bottom when the swing sets the lens', () => {
    // High latitude: a low Sun but a wide sideways swing. Centring the content
    // vertically would put the horizon 40% up the frame and fill the rest
    // with sea.
    const f = defaultFraming(8, 0.02, undefined, 45);
    note('chosen lens', `${f.focalMm} mm`);
    note('horizon from bottom', `${(f.horizonFraction * 100).toFixed(1)} %`);
    lessThan(f.horizonFraction, 0.125, 'horizon kept low in frame');
    greaterThan(f.horizonFraction, 0, 'but some ground is still visible');
  });

  test('capping the horizon never pushes the Sun out of frame', () => {
    // Raising the pitch to drop the horizon drops the Sun too. Check the top
    // of the Sun, and the horizon, are both still on screen across the range
    // of latitudes the picker allows.
    for (const [span, az] of [[45.27, 0.53], [34, 32], [26, 39], [8, 45], [4, 50]]) {
      const fr = defaultFraming(span, 0.02, undefined, az);
      const pitch = pitchForHorizonFractionDeg(fr.focalMm, fr.horizonFraction);
      const cam = { basis: cameraBasis(270, pitch), fPx: focalPx(fr.focalMm, 1000) };
      const top = 500 - project(span, 270, cam).y;
      between(top, 0, 1000, `span ${span} deg, swing ${az} deg: top of Sun on screen`);
      const horizon = 500 - project(0, 270, cam).y;
      between(horizon, 0, 1000, `span ${span} deg: horizon on screen`);
    }
  });
});
