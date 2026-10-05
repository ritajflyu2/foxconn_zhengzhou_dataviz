"""Zhengzhou's citywide air and water figures, for context on the Waste and
Water Processing page ("Approved and reported" scene).

Writes:
  site/data/environment/zhengzhou_city.json

Run from the project root: .venv/bin/python scripts/export_zhengzhou_city.py

Reads (Zhengzhou rows; Boston's PM2.5 rows too, as a comparison line):
  outputs/airquality_analysis_output/tables/airquality_zhengzhou_vs_boston.csv
      PM2.5 annual mean by year, with its source (IQAir or the official bulletin)
  outputs/water_analysis_output/tables/water_zhengzhou_vs_boston.csv
      share of river sections rated good (metric river_good_pct)

PM2.5 is shown against China's national standard (GB 3095-2012, Grade II
annual mean, the limit for cities); water as the share of river sections NOT
rated good (100 - good), so up means worse on both, like the Hongfujin forms.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
AIR = ROOT / "outputs" / "airquality_analysis_output" / "tables" / "airquality_zhengzhou_vs_boston.csv"
WATER = ROOT / "outputs" / "water_analysis_output" / "tables" / "water_zhengzhou_vs_boston.csv"
OUT = ROOT / "site" / "data" / "environment" / "zhengzhou_city.json"

CITY = "Zhengzhou"
COMPARE = "Boston"
# China's Ambient Air Quality Standards (GB 3095-2012): Grade II (residential,
# commercial, industrial areas) annual mean limit for PM2.5.
PM25_STANDARD = 35

SOURCE_LABEL = {"iqair_secondary": "IQAir", "official": "Zhengzhou's official environmental bulletins"}


def span(years):
    years = sorted(years)
    return f"{years[0]}" if years[0] == years[-1] else f"{years[0]}–{years[-1]}"


def main():
    air = pd.read_csv(AIR, encoding="utf-8-sig")
    boston = air[air["city"] == COMPARE].sort_values("year")
    air = air[air["city"] == CITY].sort_values("year")
    water = pd.read_csv(WATER, encoding="utf-8-sig")
    water = water[(water["city"] == CITY) & (water["metric"] == "river_good_pct")].sort_values("year")

    air_rows = [{"year": int(r.year), "value": float(r.pm25), "source": SOURCE_LABEL[r.source]} for r in air.itertuples()]
    water_rows = [
        {
            "year": int(r.year),
            "good_pct": float(r.value),
            "value": round(100 - float(r.value), 1),  # % NOT rated good: up = worse
            "n_sections": None if pd.isna(r.n_sections) else int(r.n_sections),
            "basis": r.basis,
        }
        for r in water.itertuples()
    ]

    # Footnotes, worded from the data: which years come from which source.
    by_source = {}
    for r in air_rows:
        by_source.setdefault(r["source"], []).append(r["year"])
    air_note = "PM2.5 " + "; ".join(f"{span(ys)} from {src}" for src, ys in by_source.items()) + "."
    national_only = [r["year"] for r in water_rows if r["n_sections"] is None]
    combined = [r for r in water_rows if r["n_sections"] is not None]
    water_note = (
        f"Water: {span(national_only)} counts national control sections only; "
        f"{span([r['year'] for r in combined])} combine {span([r['n_sections'] for r in combined])} national, provincial and city sections."
    )

    out = {
        "city": CITY,
        "air": {
            "label": "PM2.5 annual mean",
            "unit": "µg/m³",
            "baseline": {
                "value": PM25_STANDARD,
                "label": "China's standard",
                "source": "China's Ambient Air Quality Standards (GB 3095-2012), Grade II annual mean limit for PM2.5",
            },
            "years": air_rows,
            # Boston for comparison (MA DEP annual reports); only the years it
            # has, so the site draws the ones inside Zhengzhou's span.
            "compare": {
                "city": COMPARE,
                "years": [{"year": int(r.year), "value": float(r.pm25)} for r in boston.itertuples()],
                "source": "Massachusetts DEP annual air quality reports",
            },
        },
        "water": {
            "label": "River sections not rated good",
            "unit": "%",
            "years": water_rows,
        },
        "notes": [
            air_note,
            water_note,
            "Citywide figures, shown for context. They are not caused by or measured at Foxconn. PM2.5 and VOCs are different measures.",
        ],
        "source": "Zhengzhou environmental quality bulletins; IQAir historical city page for PM2.5 before 2019.",
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
