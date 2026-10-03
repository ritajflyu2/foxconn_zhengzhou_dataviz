"""Data and assets for the site's Waste and Water Processing page.

Writes:
  site/data/environment/expansion.json   the "Expansion" scene: cumulative
                                         approved NMHC / COD by year, and the
                                         campus zones traced on the cropped map
  site/assets/environment/zone_map.webp  the cropped campus map
                                         (from design/assets/foxconn-zone-cropped.png)

Run from the project root: .venv/bin/python scripts/export_environment_data.py

Every value is read from outputs/environment_analysis_output/tables/
D4_hongfujin_cumulative_approved_by_zone.csv (written by environment_data.py):
Hongfujin's seven assembly-project EIAs, summed in approval order. Approved
design capacity, not measured emissions. Years with no new approval carry the
previous total unchanged (no interpolation: nothing was added).
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
D4 = ROOT / "outputs" / "environment_analysis_output" / "tables" / "D4_hongfujin_cumulative_approved_by_zone.csv"
MAP_SRC = ROOT / "design" / "assets" / "foxconn-zone-cropped.png"
# Play speed is Labor Scene 3's (written by export_site_data.py), so the two
# year-by-year players run at the same pace.
LABOR_SCENE3 = ROOT / "site" / "data" / "labor" / "scene3_workforce_by_year.json"
DATA_OUT = ROOT / "site" / "data" / "environment"
ASSET_OUT = ROOT / "site" / "assets" / "environment"

# Zone blocks on the cropped map: the light-blue factory / office blocks
# (legend: 厂房/办公楼). Each is found as one blue region; the point is any
# pixel inside it, used only to tell the regions apart. G北 / G南 are the map's
# G North / G South blocks.
ZONES = [  # id, English label, map label, a point inside (cropped-map px)
    ("a", "A", "A区", (280, 120)), ("d", "D", "D区", (450, 120)),
    ("b", "B", "B区", (280, 280)), ("e", "E", "E区", (450, 280)),
    ("c", "C", "C区", (300, 470)), ("f", "F", "F区", (450, 470)),
    ("x", "X", "X区", (460, 630)),
    ("gs", "G South", "G南", (135, 760)), ("gn", "G North", "G北", (270, 760)), ("k", "K", "K区", (450, 760)),
    ("h", "H", "H区", (270, 910)), ("l", "L", "L区", (450, 910)),
    ("j", "J", "J区", (270, 1050)), ("m", "M", "M区", (450, 1050)),
]
# D4's zone labels -> map zone ids. "G" is not split into North / South in the
# filing, so both G blocks carry it (flagged on screen).
D4_ZONES = {"K": ["k"], "F": ["f"], "C": ["c"], "L": ["l"], "D": ["d"], "B/E": ["b", "e"], "G": ["gn", "gs"]}


def zone_masks(img):
    px = np.asarray(img.convert("RGBA")).astype(int)
    r, g, b, a = px[..., 0], px[..., 1], px[..., 2], px[..., 3]
    blue = (a > 0) & (abs(r - 116) < 40) & (abs(g - 180) < 35) & (abs(b - 234) < 30)
    blue = ndi.binary_fill_holes(ndi.binary_closing(blue, iterations=2))  # letters inside count as zone
    labels, _ = ndi.label(blue)
    return labels


def runs(values, tol=3):
    """Group consecutive rows whose edge stays within tol px into steps."""
    steps, start = [], 0
    for i in range(1, len(values) + 1):
        if i == len(values) or abs(values[i] - values[start]) > tol:
            steps.append((start, i, int(round(np.median(values[start:i])))))
            start = i
    return steps


def outline(mask):
    """An orthogonal SVG path around a block (blocks are axis-aligned, some
    with a corner notch): per-row left / right edges, stepped."""
    ys = np.where(mask.any(axis=1))[0]
    y0 = int(ys[0])
    left = [int(np.where(mask[y])[0][0]) for y in ys]
    right = [int(np.where(mask[y])[0][-1]) + 1 for y in ys]
    pts = []
    for s, e, x in runs(right):
        pts += [(x, y0 + s), (x, y0 + e)]
    for s, e, x in reversed(runs(left)):
        pts += [(x, y0 + e), (x, y0 + s)]
    clean = [p for i, p in enumerate(pts) if p != pts[i - 1]]
    return "M" + "L".join(f"{x},{y}" for x, y in clean) + "Z"


def main():
    DATA_OUT.mkdir(parents=True, exist_ok=True)
    ASSET_OUT.mkdir(parents=True, exist_ok=True)

    img = Image.open(MAP_SRC)
    img.save(ASSET_OUT / "zone_map.webp", "WEBP", quality=88, method=6)
    labels = zone_masks(img)

    d4 = pd.read_csv(D4, encoding="utf-8-sig")
    d4 = d4.rename(columns={"数据年份（约）": "year", "厂区标签": "zone", "累计NMHC": "cum_nmhc", "累计COD": "cum_cod"})
    d4["year"] = d4["year"].astype(int)
    approved = {}
    for _, r in d4.iterrows():
        for zid in D4_ZONES[r["zone"]]:
            approved[zid] = int(r["year"])

    zones = []
    for zid, label, map_label, (x, y) in ZONES:
        k = labels[y, x]
        assert k, f"no blue block at {map_label} {x},{y}"
        zones.append({"id": zid, "label": label, "year_approved": approved.get(zid),
                      "approximate": zid in ("gn", "gs"), "path": outline(labels == k)})

    years = []
    last = None
    for yr in range(int(d4["year"].min()), int(d4["year"].max()) + 1):
        rows = d4[d4["year"] == yr]
        if len(rows):
            last = rows.iloc[-1]  # the year's final cumulative total (2012 has two filings)
        years.append({
            "year": yr,
            "cum_nmhc": round(float(last["cum_nmhc"]), 2),
            "cum_cod": round(float(last["cum_cod"]), 2),
            "add_nmhc": round(float(rows["NMHC"].sum()), 2),
            "add_cod": round(float(rows["COD"].sum()), 2),
            "zones": [z for zone in rows["zone"] for z in D4_ZONES[zone]],
            "new_approval": bool(len(rows)),
        })

    out = {
        "image": "zone_map.webp",
        "image_px": list(img.size),
        "unit": "t/year",
        "animation": {"seconds_per_year": json.loads(LABOR_SCENE3.read_text())["animation"]["seconds_per_year"]},
        "zones": zones,
        "years": years,
        "source": "Hongfujin's assembly-project environmental impact assessments (EIAs), 2010-2017, summed in approval order (environment analysis table D4)",
        "g_note": "The 2017 filing names zone G without saying North or South, so both G blocks are lit and marked approximate.",
        "no_approval_note": "No new assembly-project approval this year; the totals carry over unchanged.",
        "caveat": "Approved design capacity from each project's EIA, not measured emissions. Zones without an assembly-project EIA in the record stay unlit; that does not mean they emit nothing. The map is an illustrative campus plan.",
    }
    path = DATA_OUT / "expansion.json"
    path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {path.relative_to(ROOT)}  ({len(zones)} zones, {years[0]['year']}-{years[-1]['year']})")


if __name__ == "__main__":
    main()
