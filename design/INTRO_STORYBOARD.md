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

## Screen 3 — Environmental footprint

To come.
