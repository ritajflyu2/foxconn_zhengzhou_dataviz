"""Data and assets for the site's Introduction page.

Writes:
  site/data/intro/production.json   values, sources and caveats for the
                                    "Production pace" screen
  site/assets/intro/*.webp          trimmed, resized copies of the reference
                                    images in design/reference/ (originals
                                    untouched)

Run from the project root: .venv/bin/python scripts/export_intro_data.py
The site computes everything derived (per-second rate, stack height,
crossing time) from these values; nothing is pre-computed here.
"""
import json
from pathlib import Path

import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "design" / "reference"
DATA_OUT = ROOT / "site" / "data" / "intro"
ASSET_OUT = ROOT / "site" / "assets" / "intro"

PRODUCTION = {
    "peak_iphones_per_day": 500_000,
    "peak_sources": [
        "China Daily, 2017-09-19",
        "Silicon UK, 2023-01-04, citing Henan Daily",
    ],
    "peak_caveat": (
        "Press-reported peak, not confirmed by Foxconn or Apple, for the whole "
        "Zhengzhou site."
    ),
    "hours_per_day": 24,
    "hours_note": "The daily peak is spread evenly over 24 hours (the plants run around the clock).",
    "phone_model": "iPhone 17 Pro",
    "phone_thickness_mm": 8.75,
    "phone_thickness_source": "Apple, iPhone 17 Pro technical specifications (support.apple.com/en-us/125090)",
    "phone_caveat": (
        "Assumes every phone is an iPhone 17 Pro; the 2025 peak model was the "
        "iPhone 17 (China Labor Watch, September 2025). The phone images are "
        "an illustrative mockup."
    ),
    "mount_fuji_height_m": 3776,
}

# (source file, output name, longest side in px). Each is trimmed to its
# opaque area first, so the site can size it from its own aspect ratio.
ASSETS = [
    ("iphone 17 pro orange.png", "iphone_back.webp", 240),
    ("iphone 17 pro side view.png", "iphone_side.webp", 480),
    ("mt fuji.png", "fuji.webp", 1600),
    ("olympic size pool.png", "olympic_pool.webp", 160),
]


def export_asset(src, out, longest):
    im = Image.open(REF / src).convert("RGBA")
    im = im.crop(im.getchannel("A").getbbox())
    scale = longest / max(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im.save(ASSET_OUT / out, "WEBP", quality=88, method=6)
    return out, im.size


# ---------------------------------------------------------------- wastewater
# The airport zone's two biggest plants, from their own environmental impact
# assessments (EIAs), as tabulated in data/environment/. Design (approved)
# figures, not measured discharge.
EIA_XLSX = ROOT / "data" / "environment" / "环境_环评核定与验收历史排放_2010-2026.xlsx"
WASTEWATER_ROWS = [  # (entity match, scope match, pollutant, label, EIA document, public link)
    ("鸿富锦", "全厂现有工程合计", "废水量", "Hongfujin",
     "Hongfujin Precision Electronics (Zhengzhou), EIA report for the K-zone heat-source station expansion, May 2023 (tables 2-12 to 2-49: emissions of every project on site, 2010-2022)",
     "https://oss.dahe.cn/bdtypt/sbgt-wztipt/typtfile/20230524/f101558a544b4c4bad1f61510be57f6d.pdf"),
    ("河南裕展", "全厂（本项目完成后）", "工业废水量", "FII Yuzhan",
     "Henan Yuzhan (FII Yuzhan), EIA for the phone-structure-part upgrade and new earphone-part line, December 2020 (table 52: whole plant after the project)",
     "https://m.zzhkgq.gov.cn/2020/12-05/3383271.html"),
]
OLYMPIC_POOL_M3 = 2500  # 50 m x 25 m x 2 m, the minimum World Aquatics competition pool


def wastewater():
    df = pd.read_excel(EIA_XLSX, sheet_name="长表_全部记录")
    plants = []
    for ent, scope, pol, label, doc, url in WASTEWATER_ROWS:
        row = df[df["实体"].astype(str).str.contains(ent) & df["口径"].astype(str).str.contains(scope, regex=False) & (df["污染物"] == pol)]
        assert len(row) == 1, (label, len(row))
        r = row.iloc[0]
        assert r["单位"] == "万m³/a", r["单位"]
        m3 = float(r["数值"]) * 10_000
        plants.append({"name": label, "m3_per_year": m3, "liters_per_year": m3 * 1000, "eia": doc, "url": url,
                       "scope": "whole plant, all wastewater" if pol == "废水量" else "whole plant, industrial wastewater"})
    total_m3 = sum(p["m3_per_year"] for p in plants)
    return {
        "plants": plants,
        "total_m3_per_year": total_m3,
        "total_liters_per_year": total_m3 * 1000,
        "olympic_pool_m3": OLYMPIC_POOL_M3,
        "olympic_pool_note": "An Olympic pool: 50 m x 25 m x 2 m deep (the minimum for World Aquatics competition), 2,500 m3 or 2.5 million liters.",
        "source": "Environmental impact assessments (EIAs) of each plant, published on Chinese government EIA-disclosure portals; values compiled in the project's environment workbook",
        "caveat": ("Approved design figures from each plant's EIA, not measured discharge. Two of the airport zone's three plants "
                   "(Henan Fuchi has no figure on file); the two EIAs count wastewater differently (all wastewater vs. industrial only), "
                   "and FII Yuzhan took over some of Hongfujin's metal-parts projects, so the two figures may overlap slightly."),
    }


def main():
    DATA_OUT.mkdir(parents=True, exist_ok=True)
    ASSET_OUT.mkdir(parents=True, exist_ok=True)
    for src, out, longest in ASSETS:
        name, size = export_asset(src, out, longest)
        print(f"{name}: {size[0]}x{size[1]}")
    path = DATA_OUT / "production.json"
    path.write_text(json.dumps(PRODUCTION, indent=2) + "\n")
    print(f"wrote {path.relative_to(ROOT)}")
    path = DATA_OUT / "wastewater.json"
    path.write_text(json.dumps(wastewater(), indent=2) + "\n")
    print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
