# Labor Page — Storyboard & Build Spec

Foxconn Zhengzhou interactive site · Labor section · v1 (2026-09-30)

This file is the build brief for the Labor page. It lists every scene, what data drives it, how it animates into the next scene, and what each chart must disclose. Placeholders are marked **[PLACEHOLDER]**. Open decisions are at the end.

Reference images live in `design/reference/`:

- `storyboard_sketch.jpg`: hand sketch of the scene flow
- `factory_exploded.png`: 4-floor exploded factory (1F = labor floor); the original Scene 3 index, now replaced by the separate floors in `index stack/`
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

- **English only.** Every piece of text a viewer sees is English: titles, labels, legends, tooltips, notes, entity and court names. The site data in `site/data/labor/` is already translated, and the export script refuses to write any Chinese text. Chinese remains only in the source files under `data/`. **Exception:** the 3→4 word cloud shows each word's Chinese original beside its English gloss (user decision).
- **USD everywhere.** Every amount is shown in US dollars, with the original RMB value in parentheses after it, e.g. "$3.73 (¥25) / hour". Conversion: ¥6.70 = $1 (`fx_cny_per_usd` in `scene4_pay_model.json`). No amount is ever shown in RMB alone.

- **Color follows the worker type everywhere on the page.** A worker type keeps one color from Scene 1 to Scene 4. Proposed mapping (validate with `validate_palette.js` before shipping):
  - Insured / full-time: **blue**
  - Dispatch, all types combined (Scenes 1–3): **orange**
  - Rebate-type dispatch: orange (light step)
  - Hourly-type dispatch: orange (dark step). Rebate and hourly are both dispatch, so they share a hue family and are told apart by lightness plus labels.
  - Student / summer: **aqua**
  - Short-term: **muted grey-violet** (no longer used: short-term posts count as dispatch, see Scene 3)
  - Recruitment posts that state no worker type: **light grey** ("Not stated", `--color-not-stated`), a deliberate neutral, not a worker type
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

**Idea:** the big circles dismantle into individual dots, one per worker, that fill one assembly floor and, next to it, one dorm room.

- **Assembly floor:** `design/reference/production line.png` (isometric, 11 assembly lines). **Decision: 120 dots on every line**, one per worker (China Labor Watch, Sept 2025, p. 25: "Her production line has over 120 workers"), so 1,320 dots. Each line's dots run along its own row of workstations, on both sides of the line; line centres were found from the rows of workstation monitors in the image.
- **Layout:** the assembly floor (bigger) and the dorm (smaller) side by side; the per-person space is a side note under the dorm. As the dots arrive on the floor (the 1 → 2 transition, or shortly after a direct load), the floor image fades to about 40% opacity so the dots read.
- **Dorm room:** `design/reference/dorm.jpg` (three bunks, white background made transparent). One dot per bed, 6 per room (CLW 2025, p. 19: new workers were put in the Fuhang building, six to a room).
- **Per-person space:** about 5 m² each: the Chinese design standard JGJ 36-2016 sets ≥ 5 m² of usable floor per person for a 6-person bunk room (30 m² room). Drawn as a square (≈ 2.24 m × 2.24 m, dimension lines) inside a 30 m² room outline, same scale, with a 1 m scale bar. It replaces the old 16 m²-of-land placeholder.
- **Dots keep the split** from Scene 1 (blue insured / orange dispatch): Scene 1's campus-wide low-end insured share (≈ 40%), so 48 insured + 72 dispatch per line and 2 + 4 per room. Mixed with a fixed seed so the layout is stable across reloads. Legend: per line / per room counts and "1 dot = 1 worker".
- Data: `scene2_floor.json` (line and bed coordinates, counts, sources, caveats); optimized images in `site/assets/labor/`, both from `export_site_data.py`.
- **Caveat:** one worker's account of her own line, applied to every line; the floor and room are illustrative stand-ins; the insured / dispatch mix is the campus-wide average; the dorm size is the design standard, not a measured Foxconn room.

**Transition to Scene 3:** the assembly-floor image shrinks and slides to the left edge, becoming 1F of the floor index (the dorm fades with the rest of Scene 2), while all the dots, lines and beds, lift off into their own band of space opened between Scene 3's summary and its charts, keeping the floor's shape at a smaller size (nothing is covered; the band closes once the last dot lands). Waiting and flying dots are drawn in page coordinates, so they scroll with the page instead of covering the text. As Scene 3's autoplay reaches each year, that year's dots stream out of the band into **both** charts, so each year's pair of bars builds together (**decision:** the stacking rides the autoplay, ~0.8s per year). Workforce chart: insured → solid dots, dispatch → ring dots. Recruitment chart: insured → "direct hire (stated)" posts, dispatch → dispatch posts; student and "not stated" posts have no floor dots, so they just appear in place. The dots are a motif that carries across the screen, not a one-to-one count: a Scene 3 dot is not 100 workers, so dots may fade in or out on the way.

---

## Scene 3 — Over time: who is insured, who is hired

**Layout:** two charts side by side, plus the floor index. The floor index is always on the **left** of the content (Scenes 3–5), never the right.

- **Left edge:** the floor index, showing where the viewer is in the building: the four floors from `design/reference/index stack/` stacked 1F (bottom) to 4F, upper floors in front (copies and hover outlines written by `export_site_data.py` to `floor_index.json` / `site/assets/labor/floor_*.webp`). Floors: 1F Assembly Line, 2F Automation Equipment, 3F Management, 4F Waste and Water Processing. Every floor is clickable (and Tab + Enter): the clicked floor becomes active, drawn in front at full colour with the others faded, and its number and name sit under the stack (default 1F). Hovering a floor fades all the others further and shows a legend on the left, level with the floor: big bold floor number, a short line to the floor, the name below (plain text, no box; style after `index stack/design reference.png`, in ink rather than blue, since blue is the insured colour). A faint grey divider runs beside the index, from the top floor down to the floor name.
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
- **Legal line (decision):** on every year with a comparable CLW estimate (2017, 2019, 2023, 2025; not the off-season 2018 and 2022), a red dashed line (red as in Scene 1, but dashed) at 90% of CLW's total: the level regular workers should reach if dispatch stays within the 10% cap (`legal_regular_floor_low` / `legal_cap_share` in the JSON). On 2025's range it sits at 90% of the high end (180,000), the total the bar is drawn to, so line and bar agree; the hover gives the range (135,000–180,000). Hover: the line's value and how far insured workers fall short. In the legend.
- No separate line marks 2025's low end of the CLW range or the off-season CLW figures (2018, 2022); those values are in the bar's hover card.
- Henan Fuchi reports 1 insured worker for 2020, a reporting gap. Show as a gap, not a real drop.
- Source files: `outputs/labor_analysis_output/tables/A1_insured_workers_by_entity_annual.csv`, `outputs/labor_analysis_output/tables/A1_total_workforce_point_estimates.csv`.

**Right chart data:** `scene3_posts_by_year.json`, 2016–2025, stacked counts in four groups. **Decision (regrouping):** labor_data.py's C1 table called any post with an hourly-pay field "hourly-type", but 122 of its 139 "hourly" posts list both the rebate and the hourly scheme (menu posts, mostly 2025), and its "regular/unspecified" bucket was really "nothing stated". `export_site_data.py` now re-sorts every post from C1's pay-field flags plus the post text (title + summary, plus the body unless the site later overwrote it), in this order:
  1. **Dispatch (orange):** a rebate or hourly pay field.
  2. **Student / summer (aqua):** student, summer or winter-break workers (kept as their own group).
  3. **Dispatch (orange):** the text names an agency scheme: rebate, hourly worker, wage difference, dispatch, short-term, day pay. Rebate, hourly and short-term are all one dispatch group.
  4. **Direct hire, stated (blue):** the text explicitly says regular worker (正式工) or direct hire (直招).
  5. **Not stated (light grey):** everything else.

  Totals over all 449 posts: dispatch 251, student 30, direct hire 7, not stated 161. 2025 is 96 of 97 dispatch; 2016–2018 are nearly all "not stated".

- Colors match the shared mapping, so "direct hire" (blue) lines up visually with "insured" in the left chart.
- The method note spells out the rule (`rule` in the JSON). Caveat to show: post counts are small in early years (8, 9 and 7 posts in 2016–2018); every post comes from a labor-agency site, so "direct hire" is the post's own claim and most "not stated" posts are likely agency recruiting too.
- The charts that labor_data.py saved in `outputs/` still use its original categories.

**Transition to Scene 4:** the post-group colors carry over. The rest of Scene 3 dims and three clusters rise out of the right chart: blue (direct hire, labelled with Scene 4's "Full-time (insured)" name and contract), orange (labelled "Dispatch (agency)", rebate-type or hourly-type dispatch), green (student) and grey ("Not stated", "The post names no worker type"). The grey cluster has no pay row: it stays behind and fades as Scene 4 comes in.
- **Words layer (decision):** below the clusters, a word cloud of the most-used words in the summaries (摘要) of all 449 scraped hiring posts (2010–2026, not split by type) fills the screen. Size = share of posts using the word; colour = the post group (direct hire, dispatch, student, not stated) whose posts use it most (as a share of that group's own posts, needing ≥ 8 of them), shown in the group's own colour, exactly matching the cluster dots above (not darkened for text contrast, by user decision). The method and colour rule sit behind a "How the words were picked" toggle; only the caveat stays under the cloud. Each word is shown as its English gloss followed by its **Chinese original**, same size and colour (`zh` in the JSON; the one exception to English-only, at the user's request). Job-type labels (hourly worker, rebate worker, student worker) are left out as uninformative. Generic words (Foxconn, Zhengzhou, recruit, sign up, website, we/you, dates, numbers) are left out; 58 words chosen for what they say about pay, urgency, screening and the work. Hover/focus a word: posts using it, share of all posts, mentions, share of its type's posts. Data: `scene4_post_words.json` (from `export_site_data.py`, jieba segmentation, English glosses plus the Chinese originals). The transition **holds here until the viewer presses the next arrow** in the bottom bar (or →); there is no Continue button, and a hint line under the subtitle says to use the arrow. Pressing next before the words are up, or again during the drop, jumps to the finished Scene 4 (never past it). Skip/Esc still jump to Scene 4. Reduced motion: clusters, labels and words appear in place, and the next arrow goes straight to Scene 4.
- Then Scene 4 fades in. The orange cluster first splits into two halves that turn to the rebate-type and hourly-type shades (its label fades as it parts), and every cluster drops into its pay row's legend dot: blue → full-time, the two orange halves → rebate-type and hourly-type, green → student. The orange dots are split evenly between the two rows (a visual split: the posts do not say which scheme each worker took).

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
