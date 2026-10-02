# Introduction — storyboard

The site's second page, beside Labor: a few short screens that set the scale of Foxconn Zhengzhou before the Labor story. Same look and shared rules as `LABOR_STORYBOARD.md` (sand ground, Cormorant / Inter / IBM Plex Mono, caveats in place, English only, `prefers-reduced-motion` respected). Reached from the header switcher; screens are `#intro-1`, `#intro-2`, … with their own arrow bar.

Data lives in `site/data/intro/` (written by `scripts/export_intro_data.py`) and `site/data/comparison/`. Sizes and facts are hand-picked headline figures with sources, not full data tables.

---

## Screen 1 — Size

**Idea:** Foxconn Zhengzhou's airport zone next to two familiar campuses, Apple Park and Harvard's Science and Engineering Complex (with its outdoor space), side by side on one baseline at the same scale (layout: `design/reference/size comparison sketch.png`).

- Each site is a Google Earth screenshot cut out to its own traced outline (outside removed), from `design/reference/google_earth/cropped/*_cutout.png`. Imagery credit "© Google" shown under the figure.
- Rough width and length dimension lines from each KML outline (east-west and north-south extents): Foxconn from `foxconn zhengzhou google earth.kml`, Apple Park from the "apple campus" placemark in `apple hq 2.kml`, Harvard SEC from the "SEC COMPLEX" placemark in `Haravard SEC campus - including outdoor.kml` (screenshot `harvard SEC including outdoor.png`). Each cut-out is drawn at the scale that matches its outline to its own KML extents.
- Under each site: area in hectares, then acres in parentheses, then km² smaller.
  - Foxconn: from its KML polygon (601.5 ha).
  - Apple Park: Apple's published 175 acres (Apple Newsroom, Feb 2017); its outline is illustrative only.
  - Harvard SEC: from its KML polygon (2.92 ha, 7.21 acres).
- Under each comparison site: "Foxconn Zhengzhou is N× this size" (≈ 8.5× Apple Park, ≈ 206× the Harvard SEC), from the ratios in the JSON. Foxconn takes the width left after one fixed column per comparison site; that sets the shared scale.
- Legend: outline, dimension lines, same scale; a 1 km scale bar.
- Data: `site/data/comparison/campus_sizes.json` (areas, sources, and the cut-out geometry under `layout`). Note: this file was written by a one-off script that is not yet in `scripts/`.

## Screen 2 — Production pace

**Idea:** at the reported peak, how fast iPhones come off the line, shown as one day's output stacked flat next to Mount Fuji (rough storyboard: `design/reference/production scale sketch.png`).

**Data** (`site/data/intro/production.json`; the site computes everything derived):

| Field | Value | Source / caveat |
|---|---|---|
| `peak_iphones_per_day` | 500,000 | China Daily 2017-09-19; Silicon UK 2023-01-04 citing Henan Daily. Press-reported peak, not confirmed by Foxconn or Apple, whole Zhengzhou site. |
| `hours_per_day` | 24 | The daily peak is spread evenly over 24 hours. |
| `phone_thickness_mm` | 8.75 | iPhone 17 Pro, Apple tech specs (support.apple.com/en-us/125090). Assumes every phone is a Pro; the 2025 peak model was the iPhone 17 (China Labor Watch, Sept 2025). Mockup is illustrative. |
| `mount_fuji_height_m` | 3,776 | |

Computed in JS: ≈ 5.8 a second (shown "about 6"), stack ≈ 4,375 m, ≈ 600 m higher than Fuji, Fuji's summit reached after ≈ 431,500 phones ≈ 20 h 43 min.

**Animation** (one canvas, starts when scrolled into view; Pause / Skip / Replay):

1. **Fill:** 6 back-view iPhone mockups appear each second in a loose grid of fixed-size cells, with "time elapsed" and "iPhones made" counters. Always fills complete rows, never a half-filled one: as many full rows as fit in the top 65% of the canvas and can be made within 12 s at 6 a second (18 × 4 = 72 phones, exactly 12 s, on a desktop screen; narrower screens fit fewer rows and finish sooner).
2. **Stack:** each phone turns flat (crossfades to the side view) and slides into one vertical stack at centre-bottom.
3. **Zoom out:** one linear height scale whose top grows geometrically while the clock runs to 24 h and the counter to 500,000. The stack moves left; individual phones merge into one bar once each is thinner than a few pixels ("width not to scale"). Fuji rises into frame at the same vertical scale, beside a height axis in metres. When the Fuji photo at true height would not fit its half of the screen, a simple silhouette is drawn instead.
4. **Crossing beat:** a short pause and a dashed summit line when the stack passes Fuji, labelled with the computed time and phone count; then it keeps rising.
5. **End:** "Stacked flat, one day's peak production of iPhone 17 Pros would rise about 4.4 km — higher than Mount Fuji (3,776 m)." plus a legend: stack height, Fuji's height, the difference.

- Hover or tap the stack: "phones × 8.75 mm = height".
- Reduced motion: the end state, no animation, no playback controls.
- Caveats in small text: the peak caveat, the phone caveat, and "Heights are to scale; widths are not."
- Assets: optimized copies in `site/assets/intro/` (`iphone_back`, `iphone_side`, `fuji`), made from `design/reference/` by `scripts/export_intro_data.py`.

## Screen 3 — Wastewater

**Idea:** one year of the airport zone's wastewater as Olympic swimming pools. A tank of water sits across the top with a moving, wavy surface (colours and look from `design/reference/water tank.png`). Pools appear one by one in reading order, each drawn from `design/reference/olympic size pool.png` (drained, then full). A stream pours from the tank into each new pool and it fills from the bottom up with a waving waterline. It starts slowly, so a single pool can be read, then speeds up until all are full (about 18 s). Pools are drawn large (about 42 px wide, so the page runs long); the tank and the counters stay pinned to the top while the page automatically scrolls to follow the filling row (scrolling by hand stops the follow until Replay). The waves keep moving after the end, except under reduced motion.

**Data** (`site/data/intro/wastewater.json`, read by `scripts/export_intro_data.py` from `data/environment/环境_环评核定与验收历史排放_2010-2026.xlsx`):

| Plant | Wastewater / year | Source (EIA) |
|---|---|---|
| Hongfujin | 328 万 m³ ≈ 3.28 bn L (whole plant, all wastewater) | K-zone heat-source station expansion EIA, May 2023, tables 2-12 to 2-49 |
| FII Yuzhan | 354.15 万 m³ ≈ 3.54 bn L (whole plant, industrial) | Structure-part upgrade + earphone-part line EIA, Dec 2020, table 52 |
| **Total** | **≈ 6.82 bn L ≈ 2,729 Olympic pools** (2,500 m³ each: 50 × 25 × 2 m) | |

- **Decision:** the EIA figure, not the earlier "300 million L / 120 pools" (about 10× lower than the EIAs; likely a 万m³ / liter mix-up).
- Counters: liters and pools filled. Pause / Skip / Replay; starts in view; reduced motion shows the end state. Hover a pool: what one pool holds.
- **Caveat:** approved design figures, not measured discharge; two of the zone's three plants (Henan Fuchi has no figure); the two EIAs count wastewater differently; FII Yuzhan took over some Hongfujin projects, so they may overlap slightly.

## Screen 4 — Hazardous waste

**Idea:** from one day of hazardous waste (trucks loading at each plant) to one year of it (Eiffel Towers). Hazardous waste here means solid and liquid waste (spent filters and activated carbon, used containers and oils, sludge) hauled away by licensed contractors; it is not air emissions and not wastewater.

**Data** (`site/data/intro/hazardous_waste.json`, from `scripts/export_intro_data.py`; the site computes every total):

| Plant | Tonnes / year | Source | Status |
|---|---|---|---|
| Hongfujin (iPhone assembly) | 9,619.311 (spent activated carbon 9,244.288, waste containers 374.1, lubricating oil 0.4, other 0.523) | 2023 K-zone EIA, table 2-49, existing works through 2022 (entered in the script; not in the workbook) | EIA estimate |
| FII Yuzhan (phone metal parts) | 8,713.71 | April 2026 EIA, table 2-13, existing works as of 2025 (read from the environment workbook) | EIA figure |
| Henan Fuchi | not available ("no data found") | | not drawn; one note under the lanes |

Truck payload 20 t (assumption, labelled); Eiffel Tower 10,100 t (Wikipedia; the JSON also carries the 7,300 t metal structure, not shown). Computed: at least ≈ 18,333 t a year, ≈ 50.2 t and ≈ 2.5 truckloads a day, ≈ 917 a year, ≈ 1.8 towers.

**Animation** (one SVG, one clock; starts in view; Pause / Skip / Replay; reduced motion shows the end state):

Layout: the day on the left (the truck lanes), the year on the right (the Eiffel Towers); no chart titles, the Time counter carries the day.

1. **Day** (fast, ≈ 2.6 s): one truck lane per plant (no clock). The truck at the dock fills with that plant's daily tonnes (≈ 26.4 t, ≈ 23.9 t); each full 20 t truck is parked beside it ("full, ready to go"). The same tonnes fill the towers at the same time, so the day is only a thin first layer at the base, marked "one day →". "About 2.5 truckloads a day, on average: a thin first layer in the tower."
2. **Year:** after a short, smooth pause (≈ 1.8 s), the trucks stay exactly as the day left them (one parked, one part-filled) and only the towers keep filling. The year starts slowly (day 2, day 3, …) and speeds up (≈ 7.5 s for the year), with day, tonnes and truckload counters. "The same 2.5 truckloads, every day for a year: 917 in all." No flying dots and no refilling trucks.
3. **Towers:** original, detailed Eiffel Tower silhouettes (legs and arch, three platform decks, lattice X-bays, lantern and spire; after `design/reference/Eiffel tower.avif`), labelled "Eiffel Tower 1 / 2", filled by area (full when the silhouette is), stacked by plant on one tonnes scale: Hongfujin first, FII Yuzhan on top, overflowing into the second tower (to ≈ 0.8). One dashed baseline: "One Eiffel Tower, 10,100 t".
4. **End line:** "At least 18,000 tonnes of hazardous waste a year from two airport-zone plants: about 1.8 Eiffel Towers."

- Plant colours: a brown (`--color-hw-hongfujin` #c0731f) and a darker brown (`--color-hw-yuzhan` #7b3f0a), from truck cargo to tower fill (validated, all checks pass on sand). Legend lists the two plants.
- Hover / tap a fill: plant, tonnes, tonnes ÷ 10,100, status, source.
- **Caveat** in place: EIA estimates and approved amounts, not measured shipments; different years (works through 2022 vs 2025); Henan Fuchi not included, so totals are minimums; truck size is an assumption; a small Hongfujin / FII Yuzhan overlap not ruled out; separate from wastewater and air emissions.
