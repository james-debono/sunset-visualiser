# Sunset Visualiser

**The Sun keeps the same size all the way down. On a flat Earth it could not.**

An interactive, side-by-side model of a sunset on a spherical Earth and on a flat one. It starts three hours before sunset, with both Suns identical in size and position, and lets you watch what each model predicts.

| | Globe | Flat (Sun 1,000 mi up) |
|---|---|---|
| Angular diameter, 3 h before sunset | 0.5311° | 0.5311° (set to match) |
| Angular diameter at sunset | 0.5311° | **0.1775°** |
| Change | +0.0094″ | −21.2′ (shrinks to 33%) |
| Altitude at sunset | 0° | **13.7°** (never sets) |

The flat model's size change is **136,000 times** the globe's. Real sunsets look like the globe column.

## Four views

- **Globe · camera.** What a 24 mm lens sees, with the horizon near the bottom of the frame. A loupe aimed at the Sun shows the disc against a dashed ring at its starting size.
- **Globe · side.** The Sun stays put and the Earth turns. The observer's horizon tips up past the Sun, and the angle between them is drawn exactly.
- **Flat · camera.** The same lens and framing, if the Sun were a small object moving away above a plane.
- **Flat · side.** Drawn to scale, so the angles are true. You can set the Sun's height; its size is derived so that it starts at the real angular diameter.

The charts beneath show angular size and its rate of change over time, and a table compares the two models moment by moment.

## Check it yourself

The whole point is that you don't have to take this on trust.

- **[The maths](maths.html)** (`maths.html`) has every formula, the function that implements it, the numbers it produces, and the source of every constant. Open it from the page itself, or on the published site.
- **[`tests.html`](tests.html)** runs 69 checks in your browser: against published astronomical values, closed-form identities, and independent derivations of the same quantity that would disagree if either were wrong.
- **`js/physics/`** contains all the physics as small pure functions with no dependencies. `js/render/` only draws what it is handed.

In the page's browser console, `sunset.globe.sample(16.5)` and `sunset.flat.sample(16.5)` return the full model state at 16:30.

## What it is careful about

- **Both distance effects on the globe.** Earth's rotation carries the observer 4,510 km further from the Sun over the window, but in September the orbit brings Earth 5,244 km closer. The net result is quoted, not just the convenient half.
- **The flat model at its strongest.** The Sun gets the correct starting size and elevation for free, moving in a straight line at the measured speed of the subsolar point. A second mode places it above the real subsolar point instead, and the inconsistency each mode carries is shown on screen.
- **Lens distortion.** A wide lens stretches objects near the edge of frame by about 17%. The main view reproduces this, and the loupe is a separate camera aimed at the Sun so distortion can't masquerade as a size change.
- **Refraction.** Off by default because it only affects the vertical axis, but adjustable from hot-day to extreme-mirage conditions for both models. However strong it gets, it squashes the disc's height and leaves its width untouched, which is why it cannot rescue the flat model.
- **Decorative versus physical.** Sky colours are decorative, and the docs say so. Positions, sizes, angles and relative brightness are computed.

## Run locally

It's a static site with no build step. Serve the folder, since ES modules won't load from `file://`:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/> and <http://localhost:8000/tests.html>.

## Structure

```
index.html            the visualiser
tests.html            the verification suite
maths.html            the maths and sources
css/style.css
js/
  physics/            all the physics, as pure functions
    constants.js        published constants and unit conversions
    solar.js            ephemeris and observer geometry
    globe.js            spherical-Earth model
    flat.js             flat-Earth model
    refraction.js       Sæmundsson / Bennett refraction, horizon dip
    optics.js           rectilinear camera and framing
    scenario.js         default scenario and headline summary
    units.js            metric / imperial formatting
  render/             canvas drawing only
  main.js             state, controls, render loop
tests/
  harness.js          ~100-line dependency-free test runner
  physics.test.js
```

## Default scenario

An observer on the equator at the September 2026 equinox, eye height 1.7 m, from 15:00 to sunset at 18:00 apparent solar time. This is the cleanest case, since the Sun sets straight down at exactly 15° per hour. It is also the case where the subsolar point moves fastest, which favours the flat model.

## Licence

[MIT](LICENSE)
