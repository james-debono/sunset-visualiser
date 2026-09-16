# The maths behind the Sunset Visualiser

Every formula on this page is implemented in `js/physics/`, and each section names the function that does it. The verification suite ([`tests.html`](../tests.html), source in [`tests/physics.test.js`](../tests/physics.test.js)) checks these functions against published values, closed-form identities, and independent derivations of the same quantity. Every figure quoted here comes from running that code.

Nothing in `js/render/` or `js/main.js` computes physics. Those files only draw numbers they are handed.

---

## Contents

1. [Conventions](#1-conventions)
2. [The Sun's angular diameter](#2-the-suns-angular-diameter)
3. [Where the Sun is](#3-where-the-sun-is)
4. [Where the Sun appears from the ground](#4-where-the-sun-appears-from-the-ground)
5. [Globe model: why the Sun doesn't shrink](#5-globe-model-why-the-sun-doesnt-shrink)
6. [Flat model: why it would](#6-flat-model-why-it-would)
7. [Refraction](#7-refraction)
8. [The camera](#8-the-camera)
9. [What is decorative](#9-what-is-decorative)
10. [Known simplifications](#10-known-simplifications)
11. [Headline results](#11-headline-results)

---

## 1. Conventions

| Quantity | Value | Where |
|---|---|---|
| Astronomical unit | 149,597,870.700 km (exact) | `constants.js` `AU_KM` |
| Solar radius | 695,700 km (IAU nominal) | `constants.js` `R_SUN_KM` |
| Earth radius | 6,378.137 km (WGS-84 equatorial) | `solar.js` `R_EARTH_KM` |
| Mean solar day | 86,400 s | `constants.js` `SOLAR_DAY_S` |

- Distances are in km, times in hours, and angles in degrees unless stated.
- **Time is apparent solar time**: the Sun is due south or north at 12:00. The hour angle is $H = 15^\circ \times (t - 12)$.
- **Earth is a sphere** of radius equal to the equatorial radius. In the default scenario the subsolar point runs along the equator, where that radius is exact. Oblateness is discussed in [§10](#10-known-simplifications).
- **Default scenario**: an observer on the equator (0°, 0°), eye height 1.7 m, on 23 September 2026, the day of the September equinox. The window runs from three hours before geometric sunset (15:00) to sunset (18:00).

---

## 2. The Sun's angular diameter

`solar.js` → `angularDiameterDeg(distanceKm)`

A sphere of radius $r$ seen from distance $d$ to its centre subtends

$$\theta = 2 \arcsin\left(\frac{r}{d}\right)$$

Note that this is arcsin, not arctan. The sight lines graze the limb, so they are tangent to the sphere and do not pass through its centre plane. The test suite pins this with a sphere at $d = 2r$, which must subtend exactly 60°.

At 1 AU: $\theta = 0.53291^\circ = 31.97'$.

---

## 3. Where the Sun is

`solar.js` → `solarPosition(date)`

This uses the U.S. Naval Observatory / *Astronomical Almanac* low-precision formulae, which are accurate to about 0.01° in ecliptic longitude between 1950 and 2050. With $n$ = days since J2000.0 (2000 January 1, 12:00 TT):

$$
\begin{aligned}
L &= 280.460^\circ + 0.9856474^\circ\,n &&\text{mean longitude}\\
g &= 357.528^\circ + 0.9856003^\circ\,n &&\text{mean anomaly}\\
\lambda &= L + 1.915^\circ \sin g + 0.020^\circ \sin 2g &&\text{ecliptic longitude}\\
\varepsilon &= 23.439^\circ - 0.0000004^\circ\,n &&\text{obliquity}\\
\delta &= \arcsin(\sin\varepsilon \sin\lambda) &&\text{declination}\\
D &= 1.00014 - 0.01671\cos g - 0.00014\cos 2g \ \text{AU} &&\text{Earth–Sun distance}
\end{aligned}
$$

**Checked against:**

| Check | Model | Published |
|---|---|---|
| Declination at J2000.0 | −23.03° | −23.03° |
| Earth–Sun distance at J2000.0 | 0.98331 AU | 0.98330 AU |
| September 2026 equinox (δ = 0) | 00:17 UTC, 23 Sep | 00:05 UTC, 23 Sep |
| Perihelion / aphelion 2026 | 0.9833 / 1.0167 AU | 0.9833 / 1.0167 AU |

The equinox falls 12 minutes off, which is within the formula's stated accuracy.

---

## 4. Where the Sun appears from the ground

### 4.1 Altitude

`solar.js` → `altitudeGeocentricDeg(lat, dec, H)`

$$\sin a = \sin\varphi \sin\delta + \cos\varphi \cos\delta \cos H$$

For an observer on the equator ($\varphi = 0$) at an equinox ($\delta = 0$), this reduces to $a = 90^\circ - H$. The Sun is at **exactly 45° at 15:00** and **0° at 18:00**, and it descends at exactly 15° per hour.

`altitudeTopocentricDeg` then subtracts diurnal parallax, which is at most 8.79″ for the Sun. That is negligible, but it is included.

### 4.2 The central angle

`solar.js` → `centralAngleDeg`, `groundDistanceToSubsolarKm`

The **subsolar point** is the place on Earth where the Sun is directly overhead. The angle at Earth's centre between the observer and the subsolar point is

$$\psi = 90^\circ - a$$

The great-circle ground distance to that point is $R\psi$ (with $\psi$ in radians). At 15:00 in the default scenario this is **5,009.4 km**. This is a measurable distance on the real Earth, and it matters in [§6](#6-flat-model-why-it-would).

### 4.3 Sunset

`solar.js` → `hourAngleAtAltitude(lat, dec, h0)`

$$\cos H_0 = \frac{\sin h_0 - \sin\varphi\sin\delta}{\cos\varphi\cos\delta}$$

With $h_0 = 0$ (geometric sunset, Sun's centre on the horizon) this gives $H_0 = 90^\circ$, so sunset is at 18:00. The function returns `null` when $|\cos H_0| > 1$, which is polar day or night. The app refuses to build a scenario in that case rather than inventing one.

### 4.4 The sea horizon

`solar.js` → `horizonDipDeg`, `horizonDistanceKm`

For an eye at height $h$ above a spherical sea:

$$\text{dip} = \arccos\frac{R}{R+h}, \qquad \text{distance} = \sqrt{h(2R+h)}$$

At 1.7 m the dip is **2.51′** and the horizon is **4.66 km** away.

---

## 5. Globe model: why the Sun doesn't shrink

### 5.1 Observer–Sun distance

`globe.js` → `observerSunDistanceKm(D, a)`

The observer stands at distance $R$ from Earth's centre, and the Sun is at distance $D$. The angle between those two directions, measured at Earth's centre, is $\psi$. By the law of cosines:

$$d^2 = D^2 + R^2 - 2DR\cos\psi = D^2 + R^2 - 2DR\sin a$$

since $\cos\psi = \sin a$. The test suite checks two exact cases:

- **Sun overhead** ($a = 90^\circ$): $d = D - R$.
- **Sun on the horizon** ($a = 0$): $d = \sqrt{D^2 + R^2}$.

### 5.2 Two effects change the distance, and both are included

| Effect | Change over 15:00 → 18:00 |
|---|---|
| **Rotation.** The observer is carried from 45° to 0° altitude, which moves them about $R\cos 45^\circ$ further from the Sun. | **+4,510 km** |
| **Orbit.** In September Earth is heading towards perihelion, so the Earth–Sun distance $D$ itself shrinks. | **−5,244 km** |
| **Net** | **−734 km** |

These are the observer–Sun distances the app computes:

- **At 15:00:** 150,107,466 km
- **At 18:00:** 150,106,732 km

The net change is 734 km out of 150 million, or **0.0005%**.

The distance goes *down*, so on this date the Sun is very slightly *larger* at sunset than three hours earlier. Many treatments quote only the rotational term. Doing so would overstate the change, so the code computes both.

### 5.3 The resulting angular size

| | Angular diameter |
|---|---|
| 15:00 | 0.531097° |
| 18:00 | 0.531100° |
| Change | **+0.0094″** (+0.0005%) |

The unaided eye resolves about 60″, which is more than 6,000 times this change.

### 5.4 Rate of change

`globe.js` → `angularRateBreakdown(t)` (analytic) and `angularRateDegPerHour(t)` (numerical)

Differentiating $\theta = 2\arcsin(r/d)$:

$$\frac{d\theta}{dt} = -\frac{2\,(r/d^2)}{\sqrt{1-(r/d)^2}}\;\frac{dd}{dt}$$

Differentiating $d^2 = D^2 + R^2 - 2DR\sin a$:

$$d\,\frac{dd}{dt} = \underbrace{(D - R\sin a)\,\frac{dD}{dt}}_{\text{orbital}} \;-\; \underbrace{R D\cos a\,\frac{da}{dt}}_{\text{rotational}}$$

$dD/dt$ and $d\delta/dt$ come from differentiating the ephemeris series in §3, and $da/dt$ from differentiating §4.1 with $dH/dt = 15^\circ$ per hour. The ephemeris series run in hours of UTC, while the app's clock is apparent solar time. The two drift apart by about 2 parts in 10,000 through the equation of time, and the analytic form corrects for that. The correction matters here because the two terms nearly cancel.

| At | Rotational | Orbital | Total |
|---|---|---|---|
| 15:00 | −0.01504″/h | +0.02226″/h | **+0.00722″/h** |
| 18:00 | −0.02127″/h | +0.02227″/h | **+0.00100″/h** |

**Verification.** The numerical rate (a central difference on the sampled curve) and the analytic rate above are written independently and share no algebra. The suite requires them to agree to 1 part in 100,000 of the terms' magnitude at five points across the window.

---

## 6. Flat model: why it would

`flat.js` → `makeFlatModel`

### 6.1 The model

The ground is a plane. The Sun is a small sphere at constant height $h$ above it, and it travels horizontally away from the observer in a straight line. This is the most charitable version of the flat model. Its speed is the **measured speed of the subsolar point** over the real ground:

$$v = \frac{2\pi R\cos\delta}{24\ \text{h}} = 1{,}669.8\ \text{km/h at the equator}$$

`solar.js` → `subsolarSpeedKmh`. At the equator this agrees exactly with the arc length in §4.2: $5{,}009.4\ \text{km} = v \times 3\ \text{h}$. The suite checks the agreement to one part in $10^{12}$.

### 6.2 Where the flat Sun starts

A flat model has to put the Sun somewhere at 15:00. There are two ways to do it, and the app offers both.

**`'elevation'` (default).** Start the Sun at the elevation the real Sun actually has:

$$x_0 = \frac{h}{\tan a_0}$$

Both camera views then begin identical, so any later difference comes from the model alone. The cost is an inconsistency, which the app reports rather than hides. At $h$ = 1,000 mi the Sun must start **1,609 km** away horizontally, but the real subsolar point is **5,009 km** away.

**`'subsolar'`.** Place the Sun above the real subsolar point, $x(t) = R\,\psi(t)$. This has no free parameters, but the Sun then starts at the wrong elevation: 17.81° at 1,000 mi instead of 45°.

The two anchors agree at exactly one height: $h = 5{,}009\ \text{km} \times \tan 45^\circ \approx 5{,}009$ km. That height is offered as a preset.

### 6.3 The Sun's size is derived, not assumed

The flat Sun's physical radius is set so that it has the **real** angular diameter at the start of the window:

$$d_0 = \sqrt{x_0^2 + h^2}, \qquad r = d_0 \sin\left(\frac{\theta_0}{2}\right)$$

At 1,000 mi this gives a Sun **21.10 km** across. The model is handed the correct starting appearance and only has to get the next three hours right.

### 6.4 What happens next

$$x(t) = x_0 + v\,(t - t_0), \qquad d(t) = \sqrt{x^2 + h^2}, \qquad \theta(t) = 2\arcsin\frac{r}{d}, \qquad a(t) = \arctan\frac{h}{x}$$

At 1,000 mi with the elevation anchor:

| | 15:00 | 18:00 (real sunset) |
|---|---|---|
| Horizontal distance | 1,609 km | 6,619 km |
| Line of sight | 2,276 km | 6,812 km |
| Angular diameter | 0.5311° | **0.1775°** (33.4% of start) |
| Elevation | 45.00° | **13.67°** |

The Sun shrinks by **21.22′**, which is **136,140×** the globe model's change.

Since $a = \arctan(h/x)$ is positive for any finite $x$, **the flat Sun can never set**. It only approaches the horizon asymptotically.

### 6.5 Rate of change

In the `'elevation'` mode $x$ is linear in $t$, so $\dfrac{dd}{dt} = \dfrac{xv}{d}$ and

$$\frac{d\theta}{dt} = -\frac{2\,(r/d^2)}{\sqrt{1-(r/d)^2}}\;\frac{xv}{d}$$

**Where the shrink is fastest.** Since $\theta \approx 2r/d$, the rate is proportional to $x/(x^2+h^2)^{3/2}$. That peaks at $x = h/\sqrt{2}$, where the elevation is $\arctan\sqrt{2} = 54.7^\circ$. The window starts at 45°, below that peak, so the flat Sun shrinks fastest at the start and slows down:

- **At 15:00:** −16.53″ per minute
- **At 18:00:** −2.54″ per minute

**Verification.** The suite compares this closed form with a central difference. It then halves the step four times and requires the gap to fall by 4× each time. That is second-order convergence, which shows the gap is truncation error and not an algebra error.

### 6.6 How high would the flat Sun need to be?

`flat.js` → `minimumHeightForImperceptibleShrink`

This solves by bisection on $h$ for the lowest height at which the shrink over the window stays under 1′, the naked-eye limit:

| Anchor | Minimum height | Elevation at real sunset |
|---|---|---|
| `'elevation'` | **78,504 km** (6.2 Earth diameters) | 43.2° |
| `'subsolar'` | **33,439 km** | 73.3° |

At those heights the flat model hides the shrink only by failing to set at all.

---

## 7. Refraction

`refraction.js`. **Off by default**, and applied equally to both models when switched on.

The argument on this page is about angular *size*, and refraction acts on the vertical axis. It is implemented and documented anyway, so that the question "what about refraction?" has an answer.

**Sæmundsson (1986)**, from true altitude $h$ (the direction the app uses, since geometry is computed first):

$$R = \frac{1.02'}{\tan\left(h + \dfrac{10.3}{h + 5.11}\right)}$$

**Bennett (1982)**, from apparent altitude $h_a$ (used to cross-check):

$$R = \frac{1'}{\tan\left(h_a + \dfrac{7.31}{h_a + 4.4}\right)}$$

Both assume 1010 hPa and 10 °C, and scale by $\dfrac{P}{1010}\cdot\dfrac{283}{273+T}$.

| Check | Value |
|---|---|
| Bennett at apparent 0° | 34.48′ (standard figure about 34.5′) |
| Sæmundsson at true 0° | 28.98′ |
| Sæmundsson at 45° | 1.01′ |
| Round trip, true → apparent → true | within 1′ from 0° to 60° |

**Disc shape at the horizon.** `apparentDiscDeg` refracts the upper and lower limbs separately. The lower limb is lifted more, so the disc is squashed vertically to **85.5%** of its width, which is 0.4540° tall. The width is unchanged. Refraction can only compress the image, never enlarge it.

**Horizon dip.** With refraction on, the sea-horizon dip uses the navigational value $1.76'\sqrt{h\,[\text{m}]}$, which is 2.29′ at 1.7 m against a geometric 2.51′ (Bowditch). On the flat model the horizon is the vanishing line of the plane, at exactly 0°.

---

## 8. The camera

`optics.js`

### 8.1 Lens

A pinhole (rectilinear) lens on a full-frame 36 × 24 mm sensor. Focal length refers to the **24 mm height**, because vertical framing is what the scene is about.

$$\text{vertical FOV} = 2\arctan\frac{12\ \text{mm}}{f}$$

At 24 mm the vertical field of view is 53.13°. Horizontal field extends to fill the pane.

### 8.2 Projection

`project`, `projectVector`

A direction $\hat d$ in local east–north–up coordinates, seen by a camera with basis (forward, right, up), lands at

$$x = f_{px}\,\frac{\hat d\cdot\hat r}{\hat d\cdot\hat f}, \qquad y = f_{px}\,\frac{\hat d\cdot\hat u}{\hat d\cdot\hat f}, \qquad f_{px} = H_{px}\cdot\frac{f}{24\ \text{mm}}$$

The Sun's outline is built on the sphere (`discOutline`) and then projected, so the lens distorts it exactly as a real lens would.

### 8.3 Framing

`pitchForHorizonFractionDeg`, `defaultFraming`

To put the horizon a fraction $k$ of the frame height above the bottom edge:

$$\tan(\text{pitch}) = (1 - 2k)\tan\frac{\text{vfov}}{2}$$

The default lens is the longest common focal length that fits everything from the horizon to the top of the Sun at 15:00 ($45^\circ + \theta/2 = 45.27^\circ$), with 2% margins:

$$f \le \frac{12\ \text{mm}\,(1 - 2\times 0.02)}{\tan(45.27^\circ/2)} = 27.63\ \text{mm}$$

The longest common lens that fits is **24 mm**. The horizon then sits 8.31% of the frame height above the bottom, and that fraction is held fixed as the lens is changed.

### 8.4 Why the loupe is a separate camera

A rectilinear lens stretches objects off-axis. At 24 mm the Sun at 45° is 22.6° off-axis, where a disc is drawn **16.9% taller** than on-axis.

That is correct lens behaviour and the main view reproduces it. But enlarging that frame would make the Sun appear to change size as it crossed the frame, which is exactly the effect under test. So the loupe is a second camera **aimed straight at the Sun**, where the disc is undistorted. The suite verifies that a disc viewed head-on spans exactly $2f\tan r$ in both axes at any altitude.

### 8.5 Glow brightness

The Sun's surface brightness does not change with distance. The light received is therefore proportional to its solid angle, which goes as $(\theta/\theta_0)^2$, and the glow's opacity is scaled by that ratio. At real sunset the flat Sun would deliver **11%** of its 15:00 light, which is another observable it would fail.

---

## 9. What is decorative

These carry no part of the argument. Both models use the same functions for them.

- **Sky and sea colours.** They vary with solar altitude to look like a sunset, but they are not a radiative-transfer model.
- **Glow shape and radius.** Only the glow's relative brightness is physical (§8.5).
- **Globe side view distances.** Earth and Sun sizes and spacing are schematic and labelled as such, with the true-scale sizes printed. The angles are exact.
- **Flat side view Sun size.** It is drawn at a 4.5 px minimum when its true size would be sub-pixel, with the enlargement factor shown. Its position and line of sight are never adjusted.

---

## 10. Known simplifications

| Simplification | Size of effect | Why it can't change the conclusion |
|---|---|---|
| Spherical Earth; oblateness 0.34% ignored | Changes $R$ by at most 21 km, so the 4,510 km rotational term by at most ~15 km | Moves the globe result by at most ~0.0003″ |
| Low-precision ephemeris | ~0.01° in solar longitude | The globe result depends on distance *changes* of thousands of km; the ephemeris is good to far better |
| Flat model moves in a straight line (steelman) | On the azimuthal-equidistant map the flat Sun would circle at 2,623 km/h over the equator | A faster Sun shrinks faster, so the default is the model's best case |
| Declination held fixed for the flat Sun's speed | δ changes ~0.05° over the window | Changes $v$ by about 3 parts in a million near the equinox |
| Refraction formulae | Unreliable below about −1° apparent altitude | Only the last few minutes are affected, and only vertically |
| Naked-eye resolution taken as 1′ | A rule of thumb | The globe change is 6,000× smaller; the threshold could be off by 1000× without mattering |

---

## 11. Headline results

Default scenario: equator, 23 September 2026, 15:00 → 18:00 apparent solar time, flat Sun at 1,000 mi with the elevation anchor.

| | Globe | Flat |
|---|---|---|
| Angular diameter at 15:00 | 0.531097° | 0.531097° (calibrated) |
| Angular diameter at 18:00 | 0.531100° | 0.1775° |
| Change | +0.0094″ | −1,273″ (−21.22′) |
| Size at 18:00 vs 15:00 | 100.0005% | 33.4% |
| Altitude at 18:00 | 0.00° | 13.67° |
| Distance to Sun, change | −734 km | +4,536 km |
| Light received at 18:00 vs 15:00 | 100.001% | 11.2% |

The flat model's change is **136,140×** the globe model's.
