"""
Export the Labor-page data for the website into small JSON files.

Reads the analysis tables in outputs/ and the hearing workbook in data/legal/,
writes site/data/labor/*.json. The site reads only these JSON files, never the
Excel workbooks.

Display rules (see design/LABOR_STORYBOARD.md):
- Every string meant for display is English. No Chinese text is exported,
  except the word cloud's "zh" field (each word's Chinese original, shown
  beside its English gloss at the user's request).
- Money is stored in RMB (the source unit) together with the USD value at
  FX_CNY_PER_USD. The site shows USD first, e.g. "$3.73 (¥25)".
- Private individuals are never named: they are exported as "Individual".

Run from the project root:  python3 scripts/export_site_data.py
"""
import json, re
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parent.parent  # project root
LT = BASE / "outputs" / "labor_analysis_output" / "tables"
COORDS = BASE / "outputs" / "map_insured_2025" / "data" / "insured_2025_coords.csv"
LEGAL_XLSX = BASE / "data" / "legal" / "法律_郑州富士康四家公司开庭公告.xlsx"
LEGAL_SCRIPT = BASE / "scripts" / "legal_disputes_by_year.py"
OUT = BASE / "site" / "data" / "labor"
OUT.mkdir(parents=True, exist_ok=True)

FX_CNY_PER_USD = 6.70
CJK = re.compile(r"[㐀-鿿（）：，]")

def usd(cny):
    return round(cny / FX_CNY_PER_USD, 2)

def money(cny):
    return {"cny": cny, "usd": usd(cny)}

def assert_english(obj, path="$", allow=()):
    """Fail loudly if any exported string contains Chinese characters."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k not in allow: assert_english(v, f"{path}.{k}", allow)
    elif isinstance(obj, list):
        for i, v in enumerate(obj): assert_english(v, f"{path}[{i}]", allow)
    elif isinstance(obj, str) and CJK.search(obj):
        raise ValueError(f"Chinese text in export at {path}: {obj[:60]}")

def write(name, obj, allow=()):
    assert_english(obj, allow=allow)
    p = OUT / name
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  {p.relative_to(BASE)}  ({p.stat().st_size/1024:.1f} KB)")

def num(x):
    return None if pd.isna(x) else (int(x) if float(x).is_integer() else float(x))

# 实体简称 -> (id, English name, zone, in CLW survey area)
ENTITIES = {
    "鸿富锦":           ("hongfujin",     "Hongfujin",     "airport",  True),
    "富联裕展/河南裕展": ("fii_yuzhan",    "FII Yuzhan",    "airport",  True),
    "河南富驰":         ("henan_fuchi",   "Henan Fuchi",   "airport",  True),
    "富联精密/富泰华":   ("fii_precision", "FII Precision", "econ_dev", False),
}
COORD_NAME = {"鸿富锦": "鸿富锦", "富联裕展/河南裕展": "富联裕展", "河南富驰": "河南富驰", "富联精密/富泰华": "富联精密"}
ZONES = {"airport": "Zhengzhou Airport Economy Zone", "econ_dev": "Zhengzhou Economic-Technological Development Zone"}

ins = pd.read_csv(LT / "A1_insured_workers_by_entity_annual.csv")
ins = ins[ins["实体简称"].isin(ENTITIES)]
coords = pd.read_csv(COORDS).set_index("name")

# ---------------------------------------------------------------- scene 1
# CLW's 2025 airport-zone dispatch estimate is campus-wide (80,000-110,000 at
# peak), not per plant. Split it across the three airport plants in
# proportion to each plant's insured headcount -- the only real per-plant
# measure we have -- so each plant's share of the campus total stays fixed
# whether CLW's low or high end is used.
CLW_DISPATCH_LOW, CLW_DISPATCH_HIGH = 80_000, 110_000
LEGAL_CAP = 0.10  # dispatch may not exceed 10% of a plant's TOTAL workforce

airport_insured = {
    short: int(ins[(ins["实体简称"] == short) & (ins["年份"] == 2025)]["工伤保险参保人数"].iloc[0])
    for short, (pid, en, zone, in_clw) in ENTITIES.items() if in_clw
}
airport_total_insured = sum(airport_insured.values())

# FII Precision has no CLW figure. Borrow the airport zone's low-end dispatch
# intensity (dispatch per insured worker) so its dispatch share of total matches
# the airport low end exactly.
AIRPORT_LOW_RATIO = CLW_DISPATCH_LOW / airport_total_insured  # dispatch per insured
FII_PRECISION_SHARE = CLW_DISPATCH_LOW / (CLW_DISPATCH_LOW + airport_total_insured)  # dispatch / total

# The legal rule caps dispatch at 10% of a plant's TOTAL workforce, so regular
# workers must be at least 90% of the total. We draw the red "legal line" at
# that 90%-of-total level: it sits near the outer (estimated-total) edge, far
# outside the blue insured core, because actual regular workers are only ~40%
# of the total while the law requires >=90%. The band from blue to red is the
# dispatch that is filling jobs the law reserves for regular staff (the illegal
# excess); the thin band from red to the outer edge is the legal 10% dispatch.
def legal_fields(total):
    legal_dispatch = round(LEGAL_CAP * total)
    regular_floor = round((1 - LEGAL_CAP) * total)
    assert abs((total - regular_floor) / total - LEGAL_CAP) < 1e-3, "legal line must be 90% of TOTAL"
    return legal_dispatch, regular_floor

plants = []
for short, (pid, en, zone, in_clw) in ENTITIES.items():
    insured = int(ins[(ins["实体简称"] == short) & (ins["年份"] == 2025)]["工伤保险参保人数"].iloc[0])
    c = coords.loc[COORD_NAME[short]]

    plant = {
        "id": pid, "name": en, "zone": zone, "zone_label": ZONES[zone],
        "lat": float(c["latitude"]), "lon": float(c["longitude"]),
        "location_approximate": bool(c["location_approx"]),
        "insured_2025": insured,
    }

    if in_clw:
        share = insured / airport_total_insured
        dispatch_low = round(CLW_DISPATCH_LOW * share)
        dispatch_high = round(CLW_DISPATCH_HIGH * share)
        total_low = insured + dispatch_low
        total_high = insured + dispatch_high
        legal_disp_low, regular_floor_low = legal_fields(total_low)
        legal_disp_high, regular_floor_high = legal_fields(total_high)
        plant.update({
            "clw_share_of_airport_dispatch": round(share, 4),
            "est_dispatch_low": dispatch_low,
            "est_dispatch_high": dispatch_high,
            "est_total_low": total_low,
            "est_total_high": total_high,
            # Dispatch as a share of THIS plant's own total workforce. Because
            # dispatch is allocated in proportion to insured headcount above,
            # this ratio comes out equal for all three airport plants -- it is
            # the derived per-plant share, not an input.
            "dispatch_share_of_plant_low": round(dispatch_low / total_low, 4),
            "dispatch_share_of_plant_high": round(dispatch_high / total_high, 4),
            # Legal line = 90% of total (regular floor). The red circle uses the
            # default (low) total. Legal max dispatch = 10% of total.
            "legal_regular_floor_low": regular_floor_low,
            "legal_regular_floor_high": regular_floor_high,
            "legal_max_dispatch_low": legal_disp_low,
            "legal_max_dispatch_high": legal_disp_high,
            "dispatch_over_cap_low": dispatch_low - legal_disp_low,
            "dispatch_over_cap_high": dispatch_high - legal_disp_high,
            "note": None,
        })
    else:
        dispatch = round(insured * AIRPORT_LOW_RATIO)
        total = insured + dispatch
        legal_disp, regular_floor = legal_fields(total)
        plant.update({
            "clw_share_of_airport_dispatch": None,
            "est_dispatch_low": dispatch,
            "est_dispatch_high": None,
            "est_total_low": total,
            "est_total_high": None,
            "dispatch_share_of_plant_low": round(dispatch / total, 4),
            "dispatch_share_of_plant_high": None,
            "legal_regular_floor_low": regular_floor,
            "legal_regular_floor_high": None,
            "legal_max_dispatch_low": legal_disp,
            "legal_max_dispatch_high": None,
            "dispatch_over_cap_low": dispatch - legal_disp,
            "dispatch_over_cap_high": None,
            "note": "Outside CLW's survey area; it has no CLW figure, so the airport zone's low-end dispatch share is borrowed as an assumption.",
        })
    plants.append(plant)

write("scene1_plants.json", {
    "year": 2025,
    "clw_dispatch_range": {"low": CLW_DISPATCH_LOW, "high": CLW_DISPATCH_HIGH},
    "clw_dispatch_source": "China Labor Watch's 2025 airport-zone estimate: about 80,000-110,000 dispatch workers at peak, campus-wide. Split across the three airport plants in proportion to each plant's insured headcount.",
    "fii_precision_dispatch_share": round(FII_PRECISION_SHARE, 4),
    "legal_cap_share": LEGAL_CAP,
    "legal_cap_source": "Interim Provisions on Labor Dispatch (2014): dispatch workers may not exceed 10% of a company's TOTAL workforce. So regular workers must be at least 90% of the total; the red legal line marks that 90% level, drawn against the default (low) total estimate.",
    "method": "Airport-zone plants: estimated dispatch = CLW's campus-wide 80,000-110,000 range, allocated to each plant in proportion to its insured headcount. FII Precision: no CLW figure, so it borrows the airport zone's low-end dispatch share. Legal line = 90% of each plant's total workforce (the regular-worker floor at which dispatch would be exactly 10%).",
    "placement": "Loose, roughly geographic: use lat/lon for relative position only (no basemap in v1). FII Precision sits about 20 km north-west of the airport-zone cluster.",
    "plants": plants,
    "comparison": {"label": "Harvard University students, Fall 2025", "value": 24317,
                   "source": "Harvard OIRA Fact Book, University Total degree students, Fall 2025 (students in more than one school counted once)",
                   "url": "https://oira.harvard.edu/factbook/fact-book-enrollment/"},
    "caveat": "Estimates. CLW's dispatch range is a campus-wide field estimate split across plants by insured share, not a plant-level count. FII Precision has no CLW figure at all; its dispatch is a 50% assumption.",
})

# ---------------------------------------------------------------- scene 2
# One assembly floor and one dorm room, one dot per worker. The insured /
# dispatch split is Scene 1's campus-wide low-end ratio, applied per line and
# per room. Line and bed positions are pixel coordinates in the two
# reference images (design/reference/production line.png, dorm.jpg): line
# centres were found from the rows of workstation monitors, beds by eye.
from PIL import Image
ASSET_OUT = BASE / "site" / "assets" / "labor"
ASSET_OUT.mkdir(parents=True, exist_ok=True)
REF = BASE / "design" / "reference"
CLW_2025 = "China Labor Watch, Zhengzhou Foxconn report (September 2025)"
WORKERS_PER_LINE = 120   # CLW 2025 p. 25: "Her production line has over 120 workers."
DORM_PEOPLE = 6          # CLW 2025 p. 19: new workers "where six people shared a room"
DORM_M2_PER_PERSON = 5   # JGJ 36-2016, class-4 dorm (6 people, bunk beds): 5 m2 per person
insured_share = sum(p["insured_2025"] for p in plants) / sum(p["est_total_low"] for p in plants)
def split(n):
    ins = round(n * insured_share)
    return {"insured": ins, "dispatch": n - ins}
LINES = [  # x0, x1, c: a line runs from x0 to x1 along y = 0.5 x + c (image px)
    (1072, 1286, -284), (1377, 1543, -269), (587, 707, -204), (811, 1044, -168), (1248, 1466, -165),
    (485, 684, -101), (387, 624, -4), (772, 1169, 2), (685, 1085, 124), (287, 535, 127), (732, 998, 218)]
BEDS = [(390, 195), (310, 435), (740, 290), (690, 520), (1150, 440), (1180, 690)]  # mattress centres

line_src = Image.open(REF / "production line.png").convert("RGBA")
line_src.save(ASSET_OUT / "production_line.webp", "WEBP", quality=88, method=6)
dorm_src = Image.open(REF / "dorm.jpg").convert("RGBA")
# White studio background -> transparent, so the room sits on the page ground.
px = dorm_src.load()
for y in range(dorm_src.height):
    for x in range(dorm_src.width):
        r_, g_, b_, _ = px[x, y]
        if min(r_, g_, b_) > 246:
            px[x, y] = (r_, g_, b_, 0)
dorm_src.save(ASSET_OUT / "dorm.webp", "WEBP", quality=88, method=6)

# Scene 1's own plant split, kept for the 1 -> 2 transition (circles break into dots).
dot_plants = []
for p in plants:
    n = round(p["est_total_low"] / 100)
    n_ins = round(n * p["insured_2025"] / p["est_total_low"])
    dot_plants.append({"id": p["id"], "name": p["name"], "dots": n, "insured_dots": n_ins, "dispatch_dots": n - n_ins})

write("scene2_floor.json", {
    "insured_share": round(insured_share, 4),
    "insured_share_source": "Scene 1: insured staff as a share of the estimated total workforce (low end), all four plants, 2025",
    "line": {
        "image": "production_line.webp", "image_px": list(line_src.size), "slope": 0.5,
        "lines": [{"x0": a, "x1": b, "c": c} for a, b, c in LINES],
        "workers_per_line": WORKERS_PER_LINE, "per_line": split(WORKERS_PER_LINE),
        "source": f"{CLW_2025}, p. 25: a worker says her production line has over 120 workers",
        "caveat": "One worker's account of her own line, applied to every line here; lines vary. The floor is an illustrative stand-in, not a measured Foxconn layout, and the insured / dispatch mix is the campus-wide average, not counted per line.",
    },
    "dorm": {
        "image": "dorm.webp", "image_px": list(dorm_src.size), "beds": [{"x": x, "y": y} for x, y in BEDS],
        "people": DORM_PEOPLE, "per_room": split(DORM_PEOPLE),
        "m2_per_person": DORM_M2_PER_PERSON, "room_m2": DORM_PEOPLE * DORM_M2_PER_PERSON,
        "people_source": f"{CLW_2025}, p. 19: new workers were put in the Fuhang building, six to a room",
        "size_source": "JGJ 36-2016 Code for Design of Dormitory Buildings: a 6-person room with bunk beds, at least 5 m2 of usable floor per person",
        "caveat": "Size is the Chinese design standard for a 6-person bunk room, not a measured Foxconn room; the room image is illustrative.",
    },
    "by_plant": dot_plants,
    "shift_note": "Plants run 3 x 8-hour shifts, so roughly one third of the headcount is on the floor at any moment.",
})

# ---------------------------------------------------------------- floor index
# The site-wide floor index (left column): the four floors of the illustrative
# factory, from design/reference/index stack/, stacked 1F at the bottom. Each
# floor gets a resized copy and the convex hull of its opaque pixels (in the
# copy's px), so only the floor itself, not its transparent box, takes hover.
FLOOR_INDEX_W = 480  # px wide per floor copy (the column is ~ 250 css px)
FLOORS = [  # id, source image, name
    ("1F", "labor f1.png", "Assembly Line"),
    ("2F", "automation f2.png", "Automation Equipment"),
    ("3F", "management f3.png", "Management"),
    ("4F", "enviornmental f4.png", "Waste and Water Processing"),
]


def convex_hull(points):
    pts = sorted(set(points))
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


floor_index = []
for fid, src, name in FLOORS:
    im = Image.open(REF / "index stack" / src).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    im = im.resize((FLOOR_INDEX_W, round(im.height * FLOOR_INDEX_W / im.width)), Image.LANCZOS)
    out = f"floor_{fid.lower()}.webp"
    im.save(ASSET_OUT / out, "WEBP", quality=86, method=6)
    a = im.getchannel("A").load()
    edge = []  # the leftmost and rightmost opaque pixel of every row
    for y in range(im.height):
        xs = [x for x in range(im.width) if a[x, y] > 128]
        if xs:
            edge += [(xs[0], y), (xs[-1], y)]
    floor_index.append({"id": fid, "name": name, "image": out, "image_px": list(im.size), "hull": [list(p) for p in convex_hull(edge)]})

write("floor_index.json", {
    "floors": floor_index,
    "note": "Illustrative floors of one factory building, not a measured Foxconn layout. The Labor page is on 1F, the assembly line.",
})

# ---------------------------------------------------------------- scene 3: workforce by year
YEARS = list(range(2016, 2026))
wf = pd.read_csv(LT / "A1_total_workforce_point_estimates.csv")
clw = wf[wf["kind"] == "CLW total workforce"]
SEASON = {"peak": "peak season", "trough": "off-season", "unspecified": "season not stated"}
airport_ids = [s for s, v in ENTITIES.items() if v[2] == "airport"]
rows = []
for y in YEARS:
    yr = ins[ins["年份"] == y]
    by_ent = {ENTITIES[s][0]: (int(yr.loc[yr["实体简称"] == s, "工伤保险参保人数"].sum()) if (yr["实体简称"] == s).any() else None)
              for s in ENTITIES}
    airport = int(yr[yr["实体简称"].isin(airport_ids)]["工伤保险参保人数"].sum())
    c = clw[clw["year"] == y]
    est = None
    if len(c):
        r = c.iloc[0]
        lo, hi = num(r["low"]), num(r["high"])
        lo = lo if lo is not None else hi; hi = hi if hi is not None else lo
        comparable = r["season"] != "trough"
        est = {"low": lo, "high": hi, "season": r["season"], "season_label": SEASON[r["season"]],
               "source": r["source"],
               "gap_low": max(lo - airport, 0) if comparable else None,
               "gap_high": max(hi - airport, 0) if comparable else None,
               "gap_shown": bool(comparable)}
    rows.append({"year": y, "airport_insured": airport, "insured_by_entity": by_ent, "clw_total": est})
write("scene3_workforce_by_year.json", {
    "scope": "Airport Economy Zone plants only (CLW's survey area). FII Precision is listed in insured_by_entity but excluded from airport_insured.",
    "entities": {v[0]: v[1] for v in ENTITIES.values()},
    "animation": {"autoplay": True, "seconds_per_year": 0.8},
    "years": rows,
    "flags": {
        "no_estimate": [r["year"] for r in rows if r["clw_total"] is None],
        "off_season_no_gap": [r["year"] for r in rows if r["clw_total"] and not r["clw_total"]["gap_shown"]],
        "reporting_gap": [{"entity": "henan_fuchi", "year": 2020, "value": 1, "note": "Reporting gap, not a real drop"}],
    },
    "caveat": "Gap = CLW total minus insured workers: inferred dispatch, student and other uninsured workers. CLW figures are field estimates tied to a season; insured counts are year-end filings. No gap is drawn for off-season years.",
})

# ---------------------------------------------------------------- scene 3: posts by year
# Each post is re-sorted here from labor_data.py's C1 table (its pay-field flags)
# plus the post text, into four groups. C1 put any post with an hourly field
# under "hourly", but most of those list both the rebate and the hourly scheme,
# and its "regular" bucket was really "nothing stated". Rules, in order:
#   1. dispatch: a rebate or hourly pay field
#   2. student: student / summer / winter-break worker (kept as its own group,
#      as in C1, even when the post also mentions an agency scheme)
#   3. dispatch: the text names an agency scheme (rebate, hourly worker, wage
#      difference, dispatch, short-term, day pay ...)
#   4. direct hire: the text explicitly says regular worker or direct hire
#   5. not stated: everything else
# Text = title + summary, plus the body unless the site later overwrote it with
# a template (C1's body_contaminated flag, LABOR_DATA.md rule).
POSTS_JSON = BASE / "data" / "原始文件_抓取数据" / "招聘帖全文抓取_fskzpw_2010-2026.json"
post_raw = json.loads(POSTS_JSON.read_text(encoding="utf-8"))["posts"]
DISPATCH_TEXT = ["返费", "小时工", "差价", "派遣", "劳务外包", "外包", "短期工", "短工", "日结", "临时工", "钟点工"]
STUDENT_TEXT = ["学生工", "暑假工", "寒假工", "暑期工", "学生兼职", "大学生", "假期工"]
DIRECT_TEXT = ["正式工", "直招", "官方直招", "厂方直招", "工厂直招"]
POST_GROUPS = {  # key -> label; key doubles as the colour key
    "regular": "Direct hire (stated)", "dispatch": "Dispatch (agency)",
    "student": "Student / summer", "not_stated": "Not stated"}
c1 = pd.read_csv(LT / "C1_post_type_classification.csv", dtype={"文章ID": str})


def post_text(r):
    p = post_raw.get(r["文章ID"], {})
    return f"{p.get('title', '')} {p.get('desc', '')}" + ("" if r["body_contaminated"] else f" {p.get('body', '')}")


def post_group(r):
    text = post_text(r)
    if r["has_rebate_field"] or r["has_hourly_field"]:
        return "dispatch"
    if any(k in text for k in STUDENT_TEXT):
        return "student"
    if any(k in text for k in DISPATCH_TEXT):
        return "dispatch"
    if any(k in text for k in DIRECT_TEXT):
        return "regular"
    return "not_stated"


c1["group"] = c1.apply(post_group, axis=1)
post_group_of = c1.set_index("文章ID")["group"]
by_year = pd.crosstab(c1["year"], c1["group"]).reindex(columns=list(POST_GROUPS), fill_value=0)
by_year = by_year[(by_year.index >= 2016) & (by_year.index <= 2025)]
write("scene3_posts_by_year.json", {
    "categories": [{"key": k, "label": l} for k, l in POST_GROUPS.items()],
    "years": [{"year": int(y), **{k: int(r[k]) for k in POST_GROUPS}, "total": int(r.sum())} for y, r in by_year.iterrows()],
    "rule": "Dispatch: a rebate or hourly pay figure, or the post names an agency scheme (rebate, hourly worker, wage difference, dispatch, short-term, day pay). Student: student, summer or winter-break workers. Direct hire: the post explicitly says regular worker or direct hire. Not stated: none of these.",
    "source": "Recruitment posts from fskzpw.com (a labor-agency site); pay fields from scripts/labor_data.py, groups assigned in scripts/export_site_data.py",
    "caveat": "Small samples in early years (8, 9 and 7 posts in 2016-2018). Posts cannot size the workforce. Every post is from a labor-agency site, so \"direct hire\" is the post's own claim, and most \"not stated\" posts are likely agency recruiting too.",
})

# ---------------------------------------------------------------- scene 4: pay model (RMB source values + USD)
write("scene4_pay_model.json", {
    "fx_cny_per_usd": FX_CNY_PER_USD,
    "display": "Show USD first with the RMB source value in parentheses, e.g. \"$3.73 (¥25)\".",
    "weeks_per_month": 4.35,
    "defaults": {"hours_per_week": 60, "days_employed": 90, "employed_on_25th": True, "worker": "hourly_dispatch"},
    "ranges": {"hours_per_week": [40, 75], "days_employed": [30, 180]},
    "hours_rule": "First 40 hours per week are regular. Hours above 40 are split 50/50 between weekday overtime (1.5x) and rest-day overtime (2x).",
    "workers": {
        "full_time": {"label": "Full-time (insured)", "color_key": "regular",
            "base_monthly": money(2100), "base_hours_monthly": 174,
            "ot_multipliers": {"weekday": 1.5, "rest_day": 2.0},
            "deduction_monthly": money(348), "deduction_label": "Social insurance (worker's share)",
            "conditional": None,
            "benefits": ["Social insurance", "Work injury insurance", "Partial paid sick leave (with medical record)"],
            "contract": "Direct labor contract with Foxconn"},
        "rebate_dispatch": {"label": "Rebate-type dispatch", "color_key": "rebate_dispatch",
            "base_monthly": money(2100), "base_hours_monthly": 174,
            "ot_multipliers": {"weekday": 1.5, "rest_day": 2.0},
            "ot_note": "Legal overtime rates assumed; the CLW report does not state them.",
            "deduction_monthly": money(0),
            "conditional": {"type": "rebate", "amount": money(9800), "amount_range": [money(4800), money(9800)],
                            "spread_months": 3, "condition": "days_employed >= 90",
                            "condition_label": "Paid only after 90 continuous days",
                            "fail": "Leaving before day 90 forfeits the whole rebate."},
            "benefits": ["No social insurance", "No sick leave"],
            "contract": "Agency contract plus a Rebate Agreement"},
        "hourly_dispatch": {"label": "Hourly-type dispatch", "color_key": "hourly_dispatch",
            "rate_paid_monthly": money(12), "ot_multipliers": None,
            "deduction_monthly": money(0),
            "conditional": {"type": "deferred_wage_difference", "rate": money(13), "condition": "employed_on_25th",
                            "condition_label": "Deferred to the following month; paid only if still employed on the 25th",
                            "fail": "Leaving before the payout month's 25th forfeits the deferred amount. The source estimates $780-900 (¥5,200-6,000) lost across two months."},
            "benefits": ["No social insurance", "No work injury insurance", "No paid or unpaid sick leave", "Mandatory overtime (built into the flat rate)"],
            "contract": "Agency contract plus a Wage-Difference Confirmation"},
        "student": {"label": "Student / summer", "color_key": "student",
            "rate_hourly": money(12), "ot_multipliers": {"weekday": 1.5, "rest_day": 2.0},
            "deduction_monthly": money(0), "conditional": None,
            "benefits": ["No social insurance"],
            "contract": "School-partnership labor contract"},
    },
    "check_values": {
        "full_time_60h_week_gross": money(905),
        "hourly_dispatch_60h_month": {"paid": money(3120), "deferred": money(3380), "total": money(6500),
                                      "hourly": {"paid": money(12), "conditional": money(13), "total": money(25)}},
    },
    "caveat": "Modeled from CLW-reported pay rules and recruitment posts, not payslips. The overtime split and rebate amount are assumptions.",
})

# ---------------------------------------------------------------- 3 -> 4 transition: words in hiring posts
# What the hiring posts say, across all scraped posts (not split by worker
# type): the summary (摘要, field "desc") of every post on fskzpw.com. Bodies
# are skipped because the site later overwrote many with a 2026 FAQ template.
# Summaries are segmented with jieba (custom dictionary keeps compounds such as
# 返费工 whole). Generic words (Foxconn, Zhengzhou, recruit, sign up, website,
# we/you, dates and numbers) are left out by keeping only the words below,
# chosen from the top of the frequency list for what they say about how
# workers are addressed and sold to: pay, urgency, screening, the work.
# Only the English gloss is exported.
import jieba
jieba.setLogLevel(60)
POST_WORDS = {  # 中文 -> (English gloss, theme)
    "返费": ("rebate", "pay"), "补贴": ("subsidy", "pay"),
    "高价": ("high price", "pay"), "最高价": ("top price", "pay"),
    "价格": ("price", "pay"), "薪资": ("pay", "pay"), "待遇": ("perks", "pay"), "底薪": ("base pay", "pay"),
    "奖金": ("bonus", "pay"), "涨价": ("price rise", "pay"), "政策": ("policy", "pay"), "模式": ("pay scheme", "pay"),
    "赶紧": ("hurry", "urgency"), "名额": ("spots", "urgency"), "名额有限": ("limited spots", "urgency"),
    "提前报名": ("sign up early", "urgency"), "抓紧时间": ("lose no time", "urgency"), "机会": ("opportunity", "urgency"),
    "紧急通知": ("urgent notice", "urgency"), "务必": ("be sure to", "urgency"), "锁定": ("lock in", "urgency"),
    "限时": ("limited time", "urgency"), "机会难得": ("rare chance", "urgency"), "好消息": ("good news", "urgency"),
    "重磅": ("big news", "urgency"), "停招": ("hiring paused", "urgency"), "错过": ("miss out", "urgency"),
    "面试": ("interview", "screening"), "年龄": ("age", "screening"), "身份证": ("ID card", "screening"),
    "在职": ("still on the job", "screening"), "打卡": ("clock in", "screening"), "入职": ("start work", "screening"),
    "直招": ("direct hire", "screening"), "中介": ("middleman", "screening"),
    "工友": ("fellow workers", "people"), "大家": ("everyone", "people"), "小伙伴": ("buddies", "people"),
    "求职者": ("job seekers", "people"), "普工": ("general worker", "people"), "暑假工": ("summer worker", "people"),
    "寒假工": ("winter-break worker", "people"), "短期": ("short-term", "people"),
    "进厂": ("enter the factory", "work"), "苹果": ("Apple", "work"), "组装": ("assembly", "work"),
    "测试": ("testing", "work"), "无尘": ("clean room", "work"), "加班": ("overtime", "work"),
    "工资": ("wages", "pay"), "含税": ("before tax", "pay"), "下调": ("price cut", "pay"),
    "暴涨": ("price surge", "pay"), "同工同酬": ("equal pay for equal work", "pay"),
    "要求": ("requirements", "screening"), "试用期": ("probation", "screening"),
    "关键工站": ("key workstation", "work"), "培训": ("training", "work"),
}
# Job-type labels (hourly worker, rebate worker, student worker) are left out of
# the cloud as uninformative, but stay in the dictionary so segmentation is
# unchanged (e.g. 返费工 is not split into 返费 + 工, which would inflate "rebate").
for w in [*POST_WORDS, "小时工", "返费工", "学生工", "事业群", "招聘网", "不容错过", "零配件"]:
    jieba.add_word(w, freq=100000)
# Colour layer: each word is tagged with the post group (Scene 3's four groups,
# "not stated" included) whose posts use it most, as a share of that group's
# own posts so the small student group is not drowned out.
post_type = post_group_of
WORD_TYPES = {k: (k, POST_GROUPS[k]) for k in POST_GROUPS}
type_total = {k: int((post_type == k).sum()) for k in WORD_TYPES}
doc_freq, mentions = {w: 0 for w in POST_WORDS}, {w: 0 for w in POST_WORDS}
by_type = {w: {k: 0 for k in WORD_TYPES} for w in POST_WORDS}
for pid, p in post_raw.items():
    tokens = list(jieba.cut(re.sub(r"[0-9０-９]+", " ", p.get("desc", ""))))
    for w in POST_WORDS:
        n = tokens.count(w)
        mentions[w] += n
        doc_freq[w] += n > 0
        if n and post_type.get(pid) in by_type[w]:
            by_type[w][post_type[pid]] += 1
too_rare = [w for w, n in doc_freq.items() if n < 10]
assert not too_rare, f"words in fewer than 10 posts: {too_rare}"

TYPE_MIN_POSTS = 8  # a type needs this many posts using the word to claim it by share

def top_type(w):
    eligible = [t for t in WORD_TYPES if by_type[w][t] >= TYPE_MIN_POSTS]
    k = (max(eligible, key=lambda t: by_type[w][t] / type_total[t]) if eligible
         else max(WORD_TYPES, key=lambda t: by_type[w][t]))  # too rare everywhere: most posts wins
    key, label = WORD_TYPES[k]
    return {"type": key, "type_label": label, "type_posts": by_type[w][k], "type_total": type_total[k],
            "type_share": round(by_type[w][k] / type_total[k], 4)}

years = sorted({m.group(0) for p in post_raw.values() if (m := re.search(r"20\d\d", p.get("date", "")))})
write("scene4_post_words.json", {
    "total_posts": len(post_raw),
    "year_range": [int(years[0]), int(years[-1])],
    "types": [{"key": key, "label": label, "posts": type_total[k]} for k, (key, label) in WORD_TYPES.items()],
    "words": sorted(
        ({"word": en, "zh": zh, "theme": theme, "posts": doc_freq[zh], "share": round(doc_freq[zh] / len(post_raw), 4), "mentions": mentions[zh], **top_type(zh)}
         for zh, (en, theme) in POST_WORDS.items()),
        key=lambda d: -d["posts"]),
    "color_rule": "Each word is coloured by the post group (direct hire, dispatch, student, not stated) whose posts use it most, as a share of that group's own posts (needing at least 8 of them; otherwise the group with the most posts using it).",
    "source": "Summaries of recruitment posts scraped from fskzpw.com (a labor-agency site), translated to English",
    "method": "Each post's summary was split into words (jieba, a Chinese word segmenter); each word is shown with its Chinese original. A word's size is the share of all posts whose summary uses it. Generic words (Foxconn, Zhengzhou, recruit, sign up, website, we/you, dates, numbers) and job-type labels (hourly worker, rebate worker, student worker) are left out; the words shown were picked from the most frequent for what they say about pay, urgency, screening and the work.",
    "caveat": "Agency posts, not Foxconn's own: they show how workers are recruited, not what the job is. Summaries are short (about 100 characters) and translations are approximate.",
}, allow=("zh",))

# ---------------------------------------------------------------- scene 5: hearings
src = LEGAL_SCRIPT.read_text(encoding="utf-8")
CATEGORY_MAP = dict(re.findall(r'"([^"]+)":\s*"([^"]+)"', re.search(r"CATEGORY_MAP = \{(.*?)\n\}", src, re.S).group(1)))
CAUSE_EN = {
    "劳动争议": "Labor dispute", "劳动合同纠纷": "Labor contract dispute", "人事争议": "Personnel dispute",
    "竞业限制纠纷": "Non-compete dispute", "申请撤销仲裁裁决": "Application to set aside an arbitral award",
    "工伤保险待遇纠纷": "Work-injury insurance benefits dispute", "失业保险待遇纠纷": "Unemployment insurance benefits dispute",
    "社会保险纠纷": "Social insurance dispute", "合同纠纷": "Contract dispute", "买卖合同纠纷": "Sales contract dispute",
    "广告合同纠纷": "Advertising contract dispute", "建设工程施工合同纠纷": "Construction contract dispute",
    "建设工程分包合同纠纷": "Construction subcontract dispute", "装饰装修合同纠纷": "Renovation contract dispute",
    "房屋买卖合同纠纷": "Property sale contract dispute", "金融借款合同纠纷": "Bank loan contract dispute",
    "房屋租赁合同纠纷": "Property lease dispute", "承揽合同纠纷": "Work-for-hire contract dispute",
    "侵害发明专利权纠纷": "Invention patent infringement", "侵害作品信息网络传播权纠纷": "Online copyright infringement",
    "著作权权属纠纷": "Copyright ownership dispute", "名誉权纠纷": "Defamation dispute", "身体权纠纷": "Bodily injury dispute",
    "生命权、健康权、身体权纠纷": "Life, health and bodily rights dispute", "健康权纠纷": "Health rights dispute",
    "提供劳务者受害责任纠纷": "Injury to a person providing labor services", "其他民事": "Other civil matter",
    "行政确认": "Administrative determination",
}
COURT_EN = {
    "河南省郑州市中级人民法院": "Zhengzhou Intermediate People's Court, Henan",
    "河南省郑州市郑州航空港经济综合实验区人民法院": "Zhengzhou Airport Economy Zone People's Court, Henan",
    "河南省郑州市郑州高新技术产业开发区人民法院": "Zhengzhou High-Tech Zone People's Court, Henan",
    "上海市静安区人民法院": "Jing'an District People's Court, Shanghai",
    "江苏省南京市江宁区人民法院": "Jiangning District People's Court, Nanjing, Jiangsu",
    "广东省深圳市龙华区人民法院": "Longhua District People's Court, Shenzhen, Guangdong",
    "河南自由贸易试验区郑州片区人民法院": "Henan Pilot Free Trade Zone (Zhengzhou Area) People's Court",
    "江苏省南京市江宁经济技术开发区人民法院": "Jiangning Development Zone People's Court, Nanjing, Jiangsu",
    "河南省郑州市中原区人民法院": "Zhongyuan District People's Court, Zhengzhou, Henan",
    "河南省郑州市中牟县人民法院": "Zhongmu County People's Court, Zhengzhou, Henan",
    "广东省深圳市中级人民法院": "Shenzhen Intermediate People's Court, Guangdong",
    "杭州互联网法院": "Hangzhou Internet Court, Zhejiang",
    "河南省洛阳市中级人民法院": "Luoyang Intermediate People's Court, Henan",
    "上海市嘉定区人民法院": "Jiading District People's Court, Shanghai",
    "新疆维吾尔自治区乌鲁木齐市新市区人民法院": "Xinshi District People's Court, Urumqi, Xinjiang",
    "上海市徐汇区人民法院": "Xuhui District People's Court, Shanghai",
}
ENTITY_EN = {"鸿富锦精密电子（郑州）有限公司": "Hongfujin", "富联裕展科技（河南）有限公司": "FII Yuzhan",
             "富联精密电子（郑州）有限公司": "FII Precision", "河南富驰科技有限公司": "Henan Fuchi"}
ROLE_EN = {"原告": "Plaintiff", "被告": "Defendant", "上诉人": "Appellant", "被上诉人": "Appellee",
           "第三人": "Third party", "当事人": "Party", "特别程序申请人": "Applicant", "特别程序被申请人": "Respondent",
           "申请人": "Applicant", "被申请人": "Respondent"}
OUTCOME_EN = {"部分支持": "claim partly upheld", "驳回上诉": "appeal dismissed", "不支持": "claim not upheld",
              "支持": "claim upheld", "撤诉": "withdrawn", "解除财产保全": "asset freeze lifted",
              "不承担责任": "found not liable", "驳回": "dismissed", "发回重审": "sent back for retrial"}
ORG = re.compile(r"公司|集团|厂|中心|银行|委员会|局|所|学校|学院|大学|协会|店|部|社|院|站|政府")
GOV = re.compile(r"局|委员会|政府")

def party_name_en(name):
    n = name.replace(" ", "")
    if "鸿富锦" in n: return "Hongfujin (Foxconn)", "foxconn"
    if "富泰华精密" in n or "富联精密" in n: return "FII Precision (Foxconn)", "foxconn"
    if "裕展" in n and ("河南" in n): return "FII Yuzhan (Foxconn)", "foxconn"
    if "富驰" in n: return "Henan Fuchi (Foxconn)", "foxconn"
    if "富士康" in n or "富泰华" in n or "裕展" in n or "富联" in n: return "Foxconn affiliate (outside Zhengzhou)", "foxconn"
    if "苹果" in n: return "Apple (China subsidiary)", "company"
    if GOV.search(n): return "Government agency", "government"
    if ORG.search(n): return "Other company", "company"
    return "Individual", "individual"

ROLE_RE = re.compile("(" + "|".join(sorted(ROLE_EN, key=len, reverse=True)) + ")：")

def parse_parties(raw):
    """Return [{'role','name','type','outcome'}], English only, individuals anonymized."""
    if not isinstance(raw, str) or not raw.strip(): return []
    out = []
    pieces = [p.strip() for p in re.split(r"\s*\d+\.\s+", raw) if p.strip()]  # '1. X  2. Y' lists
    for piece in pieces:
        chunks = ROLE_RE.split(piece)
        segs = [(None, chunks[0])] + [(chunks[i], chunks[i + 1]) for i in range(1, len(chunks) - 1, 2)]
        for role, text in segs:
            for name in re.split(r"[，,]", text):
                tags = re.findall(r"\[([^\]]+)\]", name)
                name = re.sub(r"\[[^\]]*\]", "", name).strip()
                if not name: continue
                en, kind = party_name_en(name)
                out.append({"role": ROLE_EN.get(role, "Party") if role else "Party", "name": en, "type": kind,
                            "outcome": "; ".join(OUTCOME_EN[t] for t in tags if t in OUTCOME_EN) or None})
    return out

df = pd.read_excel(LEGAL_XLSX, sheet_name="开庭公告")
missing = set(df["法院"]) - set(COURT_EN) | set(df["案由"]) - set(CAUSE_EN) | set(df["企业"]) - set(ENTITY_EN)
assert not missing, f"untranslated values: {missing}"
cases = []
for _, r in df.iterrows():
    d = r["正文明确时间"] if pd.notna(r["正文明确时间"]) else r["开庭时间"]
    cases.append({
        "id": r["记录编号"], "entity": ENTITY_EN[r["企业"]],
        "cause": CAUSE_EN[r["案由"]], "category": CATEGORY_MAP.get(r["案由"], "Other / administrative"),
        "date": pd.Timestamp(d).strftime("%Y-%m-%d"), "year": int(pd.Timestamp(d).year),
        "court": COURT_EN[r["法院"]], "parties": parse_parties(r["当事人"]), "source_url": r["来源"],
    })
cat_order = ["Labor & employment", "Commercial contract", "Intellectual property", "Personal injury / rights", "Other / administrative"]
n_labor = sum(c["category"] == "Labor & employment" for c in cases)
write("scene5_hearings.json", {
    "categories": cat_order,
    "headline": {"labor_share": round(n_labor / len(cases), 3), "labor_count": n_labor, "total": len(cases)},
    "cases": sorted(cases, key=lambda c: c["date"]),
    "interaction": "Hover on desktop; tap to open a detail card on touch devices.",
    "privacy": "Private individuals are shown only as 'Individual'. Companies other than Foxconn entities, Apple and government agencies are shown as 'Other company'.",
    "caveat": "Hearing announcements, not unique lawsuits or rulings; a postponed case can appear twice; scraping completeness is unverified; 2026 is a partial year.",
}, allow=("source_url",))
print("done")
