# Labor Page — Storyboard & Build Spec

Foxconn Zhengzhou interactive site · Labor section · v1 (2026-09-30)

This file is the build brief for the Labor page. It lists every scene, what data drives it, how it animates into the next scene, and what each chart must disclose. Placeholders are marked **[PLACEHOLDER]**. Open decisions are at the end.

Reference images live in `design/reference/`:

- `storyboard_sketch.jpg`: hand sketch of the scene flow
- `factory_exploded.png`: 4-floor exploded factory (1F = labor floor, used as the index in Scene 3)
- `floorplan_1F.png`: empty isometric 1F assembly floor with a loading dock (left), two workbench lines (center), a forklift, pallets and shelving. Transparent background, 719×440. This is the Scene 2 floor plan.
- `wage_calculator_ref.png`: layout reference for Scene 4
- `cube_grid_ref.webp`: high-contrast cube reference for Scene 5
- `vibe_dot_grid_poster.webp`: mood reference, a poster built from a grid of equal dots in flat saturated colors on a warm sand ground
- `vibe_concentric_rings_poster.webp`: mood reference, a dot grid where each cell is a disc, ring or nested rings of different sizes
- `vibe_beeswarm_dark_ui.webp`: mood reference, a dark data dashboard with a beeswarm of colored dots per row over a year axis
- `vibe_network_dark_ui.webp`: mood reference, a dark network graph with pastel nodes and small monospace pill-shaped legend labels

There might be more mood references that was not specified above but always look for it in the folder. 

Mood references set the general look (see "Visual direction"). They are not layouts to copy.

---

## Scope note: which plants the numbers cover

Foxconn Zhengzhou's four legal entities, and where they sit:

| Entity | Short name | Zone | In CLW's workforce estimates? |
|---|---|---|---|
| 鸿富锦精密电子（郑州） | Hongfujin | Airport Economy Zone (航空港) | Yes |
| 富联裕展科技（河南） | FII Yuzhan | Airport Economy Zone | Yes |
| 河南富驰科技 | Henan Fuchi | Airport Economy Zone | Yes |
| 富联精密电子（郑州）（原富泰华） | FII Precision | Economic-Technological Development Zone (经开区) | **No** |

**CLW's total-workforce figures (the 150k–300k peaks) describe the Airport Economy Zone campus only.** `outputs/labor_analysis_output/A1_说明.md` states this, and the existing A1 chart compares CLW only against the airport-zone entities. FII Precision is a separate site with no CLW estimate.

Consequences for the build:

- Any "CLW total vs. insured" comparison (Scene 3) uses **airport-zone insured workers only**, i.e. excludes FII Precision.
- FII Precision still appears in Scene 1, but its dispatch estimate borrows the airport-zone share as an assumption, and the chart must say so.
- Inconsistency to fix: `outputs/labor_analysis_output/tables/A2_dispatch_estimate_vs_insured_PROXY.csv` uses the four-entity insured sum (61,825 for 2025) against CLW. The airport-only sum is 53,208. Scene 3 should use the airport-only figure.

---

## Shared rules (all scenes)

- **English only.** Every piece of text a viewer sees is English: titles, labels, legends, tooltips, notes, entity and court names. The site data in `site/data/labor/` is already translated, and the export script refuses to write any Chinese text. Chinese remains only in the source files under `data/`.
- **USD everywhere.** Every amount is shown in US dollars, with the original RMB value in parentheses after it, e.g. "$3.73 (¥25) / hour". Conversion: ¥6.70 = $1 (`fx_cny_per_usd` in `scene4_pay_model.json`). No amount is ever shown in RMB alone.

- **Color follows the worker type everywhere on the page.** A worker type keeps one color from Scene 1 to Scene 4. Proposed mapping (validate with `validate_palette.js` before shipping):
  - Insured / full-time: **blue**
  - Dispatch, all types combined (Scenes 1–3): **orange**
  - Rebate-type dispatch: orange (light step)
  - Hourly-type dispatch: orange (dark step). Rebate and hourly are both dispatch, so they share a hue family and are told apart by lightness plus labels.
  - Student / summer: **aqua**
  - Short-term: **muted grey-violet**
  - Legal cap: **red, outline only**. Red is reserved for "over the legal limit" and is never a worker fill.
- **Every chart shows its caveat in place**, not in a footnote the viewer never sees.
- **Estimates look different from measurements**: estimated quantities use a hatched or dotted fill, measured ones a solid fill. This carries through all scenes.
- Respect `prefers-reduced-motion`: every animation must have a static end state and a "skip" control.

- **Font**
Use Cormorant Garamond for titles and Inter for descriptive text

---

## Visual direction

From the mood references in `design/reference/vibe_*`. These set the look; the scene specs below still decide content.

- **The dot is the unit.** Workers, plants and hearings are all drawn as round marks: discs, rings and nested rings. This ties the page together. Scene 1's layered circles are nested rings, Scene 2's workers are dots, Scene 3's bars are stacked dots, and Scene 5's hearings are cubes (the one deliberate shape change, marking the shift into conflict).
- **Two grounds, one switch.**
  - Scenes 1–4: light warm sand/paper ground (like the two posters), flat saturated fills, no gradients or shadows on data marks.
  - Scene 5: near-black charcoal ground (like the two dashboards), where color carries the energy. The switch happens in the fire transition, so the page literally goes dark when pay fails.
- **Color:** flat and saturated, but the worker-type mapping in "Shared rules" still decides which color means what. The rich poster palettes are a mood, not extra categories. Every palette must pass `validate_palette.js` on its own ground (light for 1–4, dark for 5).
- **Texture through repetition.** Density and rhythm come from many small equal marks on a regular grid, not from decoration. Empty cells (no data) stay visible as faint dots or outlines, as in the poster grids.
- **Type:**
  - small monospace labels for numbers, years and legends, with tabular figures;
  - a clean sans for UI and body;
  - one display face for scene titles only.
- **Legends and tags:** small pill-shaped labels with a count, e.g. "Dispatch (170)", as in the network reference. Use the same pill style for the season tags in Scene 3 ("peak season", "off-season").
- **Chrome:** keep it minimal. A thin top bar, generous margins, and charts that sit directly on the ground without cards.

## Scene 1 — Zoom out: where the workers are

**Idea:** four nested circles, one per plant, sized by estimated total workforce. No map in this iteration. Circles are placed loosely but **roughly geographically**, using each plant's lat/lon in `scene1_plants.json` for relative position only: the three airport-zone plants cluster together, and FII Precision sits apart to the north-west, about 20 km away. Later they can drop onto the `outputs/map_insured_2025` basemap.

**Each circle has four layers (area-proportional):**

| Layer | What it is | Encoding |
|---|---|---|
| Outer disc | Estimated total workforce = insured + estimated dispatch | Hatched orange ring (estimate) |
| Inner disc | Insured staff (work-injury insurance headcount, 2025) | Solid blue (measured) |
| Red outline | **Legal-cap size**: the largest workforce this plant could have if dispatch were held to the 10% legal cap, i.e. insured ÷ 0.9 | Red stroke, no fill |
| Gap between red outline and outer edge | Dispatch workers above the legal limit | Reads as "excess" |

The red ring sits just outside the blue core; everything beyond it is over the cap. This matches the sketch.

**Estimation method** (the site must show this as a small "how we estimated" note):

- The 2014 Interim Provisions on Labor Dispatch cap dispatch at 10% of total workforce, so legal dispatch ≤ insured ÷ 9.
- Estimated dispatch = insured × s ÷ (1 − s), where s = dispatch share.
- **s = 57% (default)**: implied by CLW 2025's own split (~60–80k regular vs. ~80–110k dispatch at peak).
- **Decision: use 57% only, with no toggle.** CLW's stated minimum (">50%") is mentioned in the method note only.
- Plant-level dispatch data does not exist. The same campus-wide share is applied to every plant, and the chart must say this.

**2025 values (insured source: `outputs/labor_analysis_output/tables/A1_insured_workers_by_entity_annual.csv`):**

| Plant | Insured (measured) | Legal-cap total (insured ÷ 0.9) | Est. dispatch @57% | Est. total @57% | ~~Est. total @50%~~ (not used) |
|---|---|---|---|---|---|
| Hongfujin | 33,498 | 37,220 | 44,404 | 77,902 | 66,996 |
| FII Yuzhan | 12,784 | 14,204 | 16,946 | 29,730 | 25,568 |
| Henan Fuchi | 6,926 | 7,696 | 9,181 | 16,107 | 13,852 |
| FII Precision* | 8,617 | 9,574 | 11,423 | 20,040 | 17,234 |

\*Outside CLW's survey area; airport-zone share applied as an assumption.

Cross-check to display: the airport-zone estimated total at 57% is ~124k, below CLW's 2025 peak of 150–200k. The insured count likely undercounts regular staff (CLW puts regular workers at 60–80k vs. 53k insured). The per-plant figures are therefore conservative, and the note should say so.

**Comparison marker (bottom-right):** a small green circle drawn to the same area scale for **Harvard University, Fall 2025: 24,317 degree students** ([Harvard OIRA Fact Book](https://oira.harvard.edu/factbook/fact-book-enrollment/), University Total; students in more than one school counted once).

**Hover:** plant name (English), zone, insured, legal-cap total, estimated dispatch, estimated total, share used.

**Transition to Scene 2:** click a circle (or scroll). The circles break apart into small worker dots.

---

## Scene 2 — On the line: worker density

**Idea:** the big circles dismantle into individual dots that pour onto a single assembly-line floor plan.

- **Floor plan:** `design/reference/floorplan_1F.png`, an empty isometric 1F with a loading dock (left), two workbench lines (center), a forklift, pallets and shelving. Still a stand-in for a real Foxconn layout.
  - **Dots must sit on the floor in the same isometric projection.** Lay the dots out on a flat 2D grid, then apply one affine transform (rotate + scale-Y, or a CSS/SVG matrix) that maps the grid onto the floor parallelogram. Calibrate it once from the four inner floor corners in the image.
  - **Keep dots off the furniture**: define keep-out polygons, in grid space, for the benches, pallets, shelving, forklift and dock. Dots cluster along the two workbench lines, where people would stand, and fill the open floor inside the yellow markings.
  - **Draw order:** image first, dots on top. Walls and pillars then need a second, masked copy of the image layered above the dots, so dots behind a pillar are hidden.
  - **Resolution:** 719×440 is low for retina screens. Fine for v1; ask for a larger export before final.
- **Dots keep the split** from Scene 1 (blue insured / orange dispatch). **Decision: 1 dot = 100 workers.** Each plant gets round(est_total_low ÷ 100) dots, split into insured and dispatch by that plant's Scene 1 insured/total ratio, summed in `scene2_floor.json` (currently 1,548 dots: 618 insured + 930 dispatch). Show the unit in the legend ("1 dot = 100 workers"). The dots are laid on an even grid parallel to the floor edges and cover the whole floor, with no outline (illustrative; they are not placed per real workstation), colored with a fixed seed so the layout is stable across reloads.
- **Right side, "space per worker" block:** a square drawn at true scale representing the average m² per worker. **[PLACEHOLDER value: 16 m²]**
  - This is campus-level: NYT 2016, ~350,000 workers on ~5.7 km² ≈ 16 m² per worker (land area, not floor area).
  - To replace: take one zone's EIA design headcount (e.g. K区 60,000 or G区 30,000, from `data/automation/自动化_环评设备定员产能面板与月度时间线_2010-2026.xlsx`) ÷ that zone's footprint traced in Google Earth × floor count.
  - Optional second square: space per worker *on shift*. Plants run 3 × 8h shifts, so roughly ⅓ of the headcount is present at once.
- **Label the placeholder visibly** ("placeholder until floor-area measurement") so it can't be mistaken for a finding.

**Transition to Scene 3:** the floor plan, dots and all, shrinks and slides to the left edge, becoming 1F of the floor index. As Scene 3's autoplay reaches each year, that year's dots stream out of 1F and stack into their bar, so the workforce chart builds one bar at a time (no pile of waiting dots over the chart) (**decision:** the stacking rides the autoplay, ~0.8s per year). The dots are a motif that carries across the screen, not a one-to-one count: a Scene 3 dot is not 100 workers, so dots may fade in or out on the way.

---

## Scene 3 — Over time: who is insured, who is hired

**Layout:** two charts side by side, plus the floor index. The floor index is always on the **left** of the content (Scenes 3–5), never the right.

- **Left edge:** the exploded-factory image as a small index (`factory_exploded.png`) , showing where the viewer is in the building.
- **Left chart, workforce composition by year:** modeled on `outputs/labor_analysis_output/charts/A1_insured_workers_vs_total_workforce.png`. The dots from Scene 2 settle into the bars.
- **Right chart, recruitment posts by type:** modeled on `outputs/labor_analysis_output/charts/C1_post_type_counts_over_time.png`.

**Animation:** year by year, 2016 → 2025. Each step reveals that year in **both charts at the same moment**. **Decision: plays automatically** when the scene comes into view, ~0.8s per year. Keep a small pause/replay control (needed for reduced-motion users), and a draggable year scrubber once finished.

**Year range: 2016–2025.** Insured data runs 2016–2025 and posts run 2010–2026, so the overlap is 2016–2025. 2026 is excluded: partial year, and no insured data.

**Left chart data (airport zone only, see scope note):**

| Year | Airport insured | CLW total (season) | Uninsured gap shown |
|---|---|---|---|
| 2016 | 222,182 | — no estimate | none, mark "no total estimate" |
| 2017 | 205,938 | >300,000 (peak) | ~94,000+ |
| 2018 | 167,156 | ~60,000 (trough) | not shown (see flag below) |
| 2019 | 92,319 | >150,000 (Aug) | ~58,000+ |
| 2020 | 88,802 | — | none, mark "no total estimate" |
| 2021 | 70,528 | — | none, mark "no total estimate" |
| 2022 | 69,526 | 60,000–70,000 (trough) | ~0 (see flag below) |
| 2023 | 64,663 | >300,000 (peak) | ~235,000+ |
| 2024 | 55,384 | — | none, mark "no total estimate" |
| 2025 | 53,208 | 150,000–200,000 (peak) | ~97,000–147,000 (range bar) |

- Bars: solid blue = insured (measured); hatched orange stacked above = gap to the CLW total (inferred: dispatch, student and other uninsured workers).
- **Years without a CLW estimate:** show the insured bar only, with an outlined, empty "?" cap and the label "no total estimate".
- **Flag on 2018 and 2022:** CLW's figure is an off-season trough while the insured count is a year-end snapshot, so no gap is drawn. Show a small season tag ("peak" / "trough") on every CLW year.
- Henan Fuchi reports 1 insured worker for 2020, a reporting gap. Show as a gap, not a real drop.
- Source files: `outputs/labor_analysis_output/tables/A1_insured_workers_by_entity_annual.csv`, `outputs/labor_analysis_output/tables/A1_total_workforce_point_estimates.csv`.

**Right chart data:** `outputs/labor_analysis_output/tables/C1_post_type_counts_by_year.csv`, 2016–2025, stacked counts by post type (hourly-type dispatch, rebate-type dispatch, regular/unspecified, student/summer, short-term).

- Colors match the shared mapping, so "regular" (blue) lines up visually with "insured" in the left chart.
- Caveat to show: post counts are small in early years (8, 9 and 7 posts in 2016–2018), so shares in those years rest on very few posts.

**Transition to Scene 4:** the post-type colors carry over. Four circles, one per worker type, separate out of the right chart.

---

## Scene 4 — How work is paid

**Idea:** four worker types, each a circle in its post-type color (circles are placeholders for later figures): full-time (blue), rebate-type dispatch (light orange), hourly-type dispatch (dark orange), student (aqua). Selecting one updates the calculator. Default selection: hourly-type dispatch. Layout follows `wage_calculator_ref.png`.

**Controls:**

- **Work hours:** slider, 40–75 h/week, default **60**, with −/+ buttons. Show "≈ N hours / month" (monthly = weekly × 4.35, so 60 → ≈ 261).
- **Work duration:** slider, 30–180 days employed, default **90**, with −/+ buttons.
- **"Still employed on the payout month's 25th?"** Yes/No toggle (applies to hourly-type).

**Outputs:**

- Hourly rate, e.g. "$3.73 (¥25) / hour", with a breakdown line ("$1.79 (¥12) paid monthly + $1.94 (¥13) conditional").
- Monthly pay, e.g. "$970 (¥6,500) / month", with the note "before deductions · includes conditional pay". Bar labels follow the same pattern: "$466 (¥3,120) paid monthly", "$504 (¥3,380) deferred".
- Split bar: solid navy = take-home paid this month; hatched = deferred/conditional pay.
  - When a condition fails, the hatched segment turns into an empty outline labeled "forfeited".
- Benefits list and contract type per worker type.
- FX rate: ¥6.70 = $1, used throughout. USD first, RMB in parentheses (see Shared rules).

**Pay model** (from `outputs/labor_analysis_output/tables/B1c_pay_calculation_peak_month_2025.csv`, `outputs/labor_analysis_output/tables/B1_income_calculator_scenarios.csv`, `outputs/labor_analysis_output/tables/B1_pay_structure_by_worker_type.csv`):

- **Hours split** (per week, then × 4.35):
  - first 40 h regular;
  - hours above 40 split 50/50 between weekday overtime (1.5×) and rest-day overtime (2×).
  - Check: at 60 h this gives 40 / 10 / 10, matching the source scenario (¥905/week full-time).

| Type | Paid monthly | Conditional / deferred | Deductions | Condition |
|---|---|---|---|---|
| Full-time (insured) | Base ¥2,100/month for 174 h (≈ ¥12.07/h) + OT at 1.5× / 2× | none | −¥348/month social insurance (personal share) | none |
| Rebate-type dispatch | Base ≈ ¥2,100 + OT at legal rates (assumed) | Rebate ¥4,800–9,800, shown as ÷3 per month over the 90-day period. Default ¥9,800, show the range. | none | Paid only if days employed ≥ 90; leaving earlier forfeits the whole rebate |
| Hourly-type dispatch | ¥12/h × all hours, no OT multiplier | ¥13/h × all hours, paid at the end of the following month | none | Must be employed on the 25th; "No" forfeits the deferred amount (the source estimates ~¥5,200–6,000 lost across two months) |
| Student / summer | ¥12/h base + OT at 1.5× / 2× | none | none | none |

**Benefits / contract text** (from B1 table):

- Full-time: labor contract; social insurance yes; partial paid sick leave with a medical record.
- Rebate-type: signs a "Rebate Agreement"; no social insurance; no sick leave.
- Hourly-type: signs a "Wage-Difference Confirmation"; no social insurance; no work-injury insurance; no sick leave; overtime built into the flat rate.
- Student: school-partnership labor contract; no social insurance.

**Caveat to show:** "Modeled from CLW-reported pay rules and recruitment posts, not payslips. Overtime split and rebate amount are assumptions."

---

## Scene 5 — When pay fails: the disputes

**Opening transition:** the wage calculator burns away (fire animation from the bottom edge upward, ~1.5s), revealing a black background.

- Build as canvas/WebGL particles or a masked noise shader; avoid heavy video.
- Reduced-motion fallback: a quick fade to black.

**Visualization:** high-contrast cube grid on black, after `cube_grid_ref.webp`.

- **One cube = one hearing announcement** (150 total), grouped into year columns 2015–2026.
- Cube color = dispute category (5 categories). Use a separate dark-mode palette tuned for a black background, not the worker-type colors: this scene encodes case type, not worker type, and reusing blue would wrongly suggest "insured". Validate with `validate_palette.js --mode dark`.
  - Labor & employment
  - Commercial contract
  - Intellectual property
  - Personal injury / rights
  - Other / administrative
- Headline number: **56%** (84 of 150) are labor & employment.

**Hover (per cube):**

- hearing date
- court (English name)
- cause of action (English) and category
- Foxconn entity involved
- parties by role, with outcome where recorded (e.g. "Plaintiff: Individual (claim not upheld) · Defendant: Hongfujin (Foxconn)")
- source link, labeled "Source: Qichacha court-notice listing (Chinese)". The link opens the entity's listing page, not the single case.
- **Decision: hover on desktop, tap to open a detail card on touch devices.**

**Data:** `data/legal/法律_郑州富士康四家公司开庭公告.xlsx`, sheet `开庭公告`. Category mapping is in `scripts/legal_disputes_by_year.py`; counts are in `outputs/legal_analysis_output/tables/legal_disputes_by_year_category.csv`.

**Data notes to handle:**

- **Anonymize individuals (done in the export).** Private individuals appear only as "Individual". Foxconn entities, Apple and government agencies are named; all other companies appear as "Other company". Case numbers are not exported because they are in Chinese.
- **Timestamps:** some `开庭时间` values disagree with the date in the notice text (the `时间核对` column flags "字段与正文不同"). Prefer `正文明确时间` when present.
- **Caveats to display:**
  - these are hearing announcements, not unique lawsuits or rulings;
  - a postponed case can appear twice;
  - scraping completeness is unverified;
  - 2026 is a partial year (1 hearing).

**End of Labor page (decision):** the page ends after the grid settles, with a closing line. No teaser or link to other floors in v1.

---

## Data file index

| Scene | File |
|---|---|
| 1, 3 | `outputs/labor_analysis_output/tables/A1_insured_workers_by_entity_annual.csv` |
| 1, 3 | `outputs/labor_analysis_output/tables/A1_total_workforce_point_estimates.csv` |
| 1 | `outputs/labor_analysis_output/tables/A2_dispatch_share_point_estimates_CLW.csv` |
| 2 | `data/automation/自动化_环评设备定员产能面板与月度时间线_2010-2026.xlsx` (zone design headcounts) |
| 3 | `outputs/labor_analysis_output/tables/C1_post_type_counts_by_year.csv` |
| 4 | `outputs/labor_analysis_output/tables/B1c_pay_calculation_peak_month_2025.csv`, `outputs/labor_analysis_output/tables/B1_income_calculator_scenarios.csv`, `outputs/labor_analysis_output/tables/B1_pay_structure_by_worker_type.csv` |
| 5 | `data/legal/法律_郑州富士康四家公司开庭公告.xlsx`, `outputs/legal_analysis_output/tables/legal_disputes_by_year_category.csv` |

**Site data (done):** `scripts/export_site_data.py` exports all of the above into `site/data/labor/`. The site reads only these files, never the Excel workbooks. Re-run the script from the project root after any change to the source tables.

| File | Scene | Contents |
|---|---|---|
| `site/data/labor/scene1_plants.json` | 1 | 4 plants: lat/lon, insured 2025, legal-cap size, estimated dispatch/total at 57%, GSD comparison |
| `site/data/labor/scene2_floor.json` | 2 | dots at 100 workers/dot (currently 1,548), split by plant and by insured/dispatch; space-per-worker placeholder |
| `site/data/labor/scene3_workforce_by_year.json` | 3 | 2016–2025 airport-zone insured, per-entity insured, CLW total with season and gap, flags |
| `site/data/labor/scene3_posts_by_year.json` | 3 | 2016–2025 recruitment post counts by type |
| `site/data/labor/scene4_pay_model.json` | 4 | calculator parameters, defaults, ranges, benefits, contracts, check values |
| `site/data/labor/scene5_hearings.json` | 5 | 150 hearings with category, date, court, anonymized parties, source link |

---

## Decisions (resolved 2026-09-30)

1. **Dispatch share:** 57% only, no toggle.
2. **Scene 1 placement:** loose, roughly geographic (lat/lon for relative position), no basemap.
3. **Scene 2 dots:** 1 dot = 100 workers (currently 1,548 dots), even grid covering the whole floor.
4. **Scene 3 animation:** plays automatically, with pause/replay.
5. **Scene 5 on touch devices:** tap opens a detail card.
6. **Page end:** the Labor page ends with the dispute grid. No management-floor teaser.
7. **Language and currency:** English throughout; USD first with RMB in parentheses.
