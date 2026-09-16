# Sources

Every constant and formula in `js/physics/` traces to one of these.

## Constants

| Value | Source |
|---|---|
| Astronomical unit, 149,597,870,700 m (exact) | IAU 2012 Resolution B2, *Re-definition of the astronomical unit of length* |
| Nominal solar radius, 6.957 × 10⁸ m | IAU 2015 Resolution B3, *Recommended nominal conversion constants for selected solar and planetary properties* |
| Earth equatorial radius, 6,378,137 m | World Geodetic System 1984 (WGS-84), NIMA Technical Report TR8350.2 |
| Earth mean radius, 6,371,008.8 m | Moritz, H. (2000), *Geodetic Reference System 1980*, Journal of Geodesy 74, 128–133 (IUGG values) |
| Mean sidereal day, 86,164.0905 s | IERS Conventions (2010), IERS Technical Note 36 |
| International mile, 1,609.344 m; foot, 0.3048 m (exact) | International Yard and Pound Agreement (1959) |

## Solar position

- **Low-precision formulae for the Sun's coordinates.** U.S. Naval Observatory, *The Astronomical Almanac*, Section C ("Sun"). Stated accuracy 0.01° over 1950–2050.
- Meeus, J. (1998), *Astronomical Algorithms*, 2nd ed., Willmann-Bell, ch. 13 (coordinate transformations), ch. 15 (rising and setting), ch. 25 (solar coordinates).

## Refraction and horizon dip

- Sæmundsson, Þ. (1986), *Astronomical refraction*, Sky & Telescope 72, 70.
- Bennett, G. G. (1982), *The calculation of astronomical refraction in marine navigation*, Journal of Navigation 35, 255–259.
- Bowditch, N., *The American Practical Navigator* (NGA Pub. 9), altitude corrections: dip of the sea horizon, 1.76′ √h (h in metres).

## Values used to check the code

| Check | Value | Source |
|---|---|---|
| Solar declination and distance at J2000.0 | −23.03°, 0.98330 AU | *The Astronomical Almanac* for 2000 |
| September 2026 equinox | 2026-09-23 00:05 UTC | USNO *Earth's Seasons* data; also [EarthSky](https://earthsky.org/astronomy-essentials/everything-you-need-to-know-september-equinox/), [Star Walk](https://starwalk.space/en/news/autumnal-equinox-first-day-of-fall) |
| Perihelion and aphelion distances | 0.9833 AU, 1.0167 AU | *The Astronomical Almanac* |
| Refraction at the horizon | about 34′ | Bennett (1982); standard navigational tables |
| Equation of time, early November | about +16.4 min | *The Astronomical Almanac* |

## Rules of thumb (flagged as such where used)

- **Naked-eye angular resolution of about 1′.** This is the definition of standard 6/6 (20/20) Snellen visual acuity: resolving detail that subtends one arcminute. It is used only to ask "could anyone see this change?", and the conclusion holds with any threshold within a factor of 1,000.
