"""
Air quality context: Zhengzhou vs. Boston, annual average PM2.5, multi-year.

This is a freestanding comparison (not part of the Foxconn labor/environment/
automation pipeline) requested to give outside context for how polluted
Zhengzhou's air is relative to a US city.

Zhengzhou: official annual average PM2.5 (细颗粒物年均浓度) from the Zhengzhou
Ecological Environment Bureau's yearly "环境质量状况公报" (Environmental Quality
Bulletin), 2019-2025 (each bulletin states that year's own annual average).
2017-2018 filled in from IQAir's Zhengzhou historical city page (a different
methodology/source, flagged separately).

Boston: annual arithmetic mean PM2.5, averaged across that year's active
Boston-area FRM/FEM monitoring sites (Kenmore Sq, Harrison Ave, Von Hillern St,
One City Square, 174 North St, Kneeland St - not all sites operated in every
year), from the Massachusetts DEP's yearly "Annual Air Quality Report" series.
Only a handful of years were pulled (not every year 2013-2025), so the trend
is illustrative, not a complete annual series.

The two measurement systems are not perfectly identical (different reference
methods, site siting, and rounding conventions), so this chart is meant to show
the ORDER OF MAGNITUDE difference, not a precise apples-to-apples ranking.

Reads no local project files; writes into a new airquality_analysis_output/.
Run (from project root): python3 scripts/airquality_zhengzhou_vs_boston.py
"""
import textwrap
from pathlib import Path

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

BASE = Path(__file__).resolve().parent.parent  # project root (scripts/ lives one level down)
OUT = BASE / "outputs" / "airquality_analysis_output"
TABLES = OUT / "tables"
CHARTS = OUT / "charts"
TABLES.mkdir(parents=True, exist_ok=True)
CHARTS.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------- style (same as labor_data.py / environment_data.py)
PAL = dict(
    surface="#fcfcfb", page="#f9f9f7", ink="#0b0b0b", ink2="#52514e",
    muted="#898781", grid="#e1e0d9", axis="#c3c2b7",
    blue="#2a78d6", orange="#eb6834", aqua="#1baf7a", yellow="#eda100",
    magenta="#e87ba4", green="#008300", violet="#4a3aa7", red="#e34948",
)
C_ZZ, C_BOS = PAL["blue"], PAL["orange"]
_fonts = {f.name for f in fm.fontManager.ttflist}
for _f in ["PingFang SC", "Heiti SC", "Microsoft YaHei", "SimHei", "Noto Sans CJK SC", "Noto Sans CJK JP"]:
    if _f in _fonts:
        plt.rcParams["font.family"] = [_f]
        break
plt.rcParams.update({
    "figure.facecolor": PAL["surface"], "axes.facecolor": PAL["surface"],
    "savefig.facecolor": PAL["surface"], "axes.edgecolor": PAL["axis"],
    "axes.labelcolor": PAL["ink2"], "text.color": PAL["ink"],
    "xtick.color": PAL["muted"], "ytick.color": PAL["muted"],
    "grid.color": PAL["grid"], "axes.grid": True, "grid.linewidth": 0.6,
    "axes.axisbelow": True, "axes.spines.top": False, "axes.spines.right": False,
    "font.size": 10.5, "axes.titlesize": 12.5, "axes.titleweight": "bold",
    "figure.dpi": 130, "axes.unicode_minus": False,
})


def style_ax(ax, title=None, ylabel=None):
    if title:
        ax.set_title(title, loc="left", pad=10, fontsize=12)
    if ylabel:
        ax.set_ylabel(ylabel, fontsize=9.5)
    ax.grid(True, axis="y", linewidth=0.6)
    ax.grid(False, axis="x")
    return ax


def savefig(fig, name, note=None):
    if note:
        width_chars = max(60, int(fig.get_figwidth() * 15.5))
        lines = []
        for para in note.split("\n"):
            lines.extend(textwrap.wrap(para, width=width_chars, break_long_words=True,
                                        break_on_hyphens=False) or [""])
        fig.text(0.01, -0.02, "\n".join(lines), fontsize=7.7, color=PAL["muted"],
                  ha="left", va="top", transform=fig.transFigure)
    fig.tight_layout()
    fig.savefig(CHARTS / name, bbox_inches="tight", facecolor=PAL["surface"])
    plt.close(fig)
    print(f"  chart -> {name}")


# ---------------------------------------------------------------- data
rows = [
    # Zhengzhou: official annual bulletins (primary)
    dict(city="Zhengzhou", year=2019, pm25=58.0, source="official", note="郑州市环境质量状况公报 2019"),
    dict(city="Zhengzhou", year=2020, pm25=51.0, source="official", note="郑州市环境质量状况公报 2020"),
    dict(city="Zhengzhou", year=2021, pm25=42.0, source="official", note="郑州市环境质量状况公报 2021"),
    dict(city="Zhengzhou", year=2022, pm25=45.0, source="official", note="郑州市环境质量状况公报 2022"),
    dict(city="Zhengzhou", year=2023, pm25=43.0, source="official", note="郑州市环境质量状况公报 2023"),
    dict(city="Zhengzhou", year=2024, pm25=45.0, source="official", note="郑州市环境质量状况公报 2024"),
    dict(city="Zhengzhou", year=2025, pm25=38.0, source="official", note="郑州市环境质量状况公报 2025"),
    # Zhengzhou: IQAir historical page (secondary, different methodology, older years only)
    dict(city="Zhengzhou", year=2017, pm25=70.0, source="iqair_secondary", note="IQAir historical city page"),
    dict(city="Zhengzhou", year=2018, pm25=64.1, source="iqair_secondary", note="IQAir historical city page"),
    # Boston: MA DEP Annual Air Quality Reports, average across that year's active monitoring sites
    dict(city="Boston", year=2013, pm25=7.96, source="official", note="MA DEP 2013 report (5 sites, FRM)"),
    dict(city="Boston", year=2016, pm25=10.33, source="official", note="MA DEP 2016 report (3 sites, FRM)"),
    dict(city="Boston", year=2020, pm25=6.68, source="official", note="MA DEP 2020 report (3 sites, FRM)"),
    dict(city="Boston", year=2023, pm25=7.08, source="official", note="MA DEP 2023 report (4 sites, FEM)"),
    dict(city="Boston", year=2024, pm25=5.89, source="official", note="MA DEP 2024 report (3 sites, FEM)"),
]
tbl = pd.DataFrame(rows).sort_values(["city", "year"])
tbl.to_csv(TABLES / "airquality_zhengzhou_vs_boston.csv", index=False, encoding="utf-8-sig")
print(tbl.to_string())

# ---------------------------------------------------------------- chart
fig, ax = plt.subplots(figsize=(10.5, 6.2))

for city, color, marker in [("Zhengzhou", C_ZZ, "o"), ("Boston", C_BOS, "s")]:
    sub = tbl[tbl["city"] == city]
    official = sub[sub["source"] == "official"]
    secondary = sub[sub["source"] != "official"]
    ax.plot(official["year"], official["pm25"], color=color, marker=marker, markersize=6.5,
            linewidth=2.2, zorder=4, label=f"{city} (official annual average)")
    if len(secondary):
        combined = pd.concat([secondary, official.head(1)]).sort_values("year")
        ax.plot(combined["year"], combined["pm25"], color=color, marker=marker, markersize=5.5,
                linewidth=1.4, linestyle=(0, (3, 2)), alpha=0.55, zorder=3)
        ax.scatter(secondary["year"], secondary["pm25"], color=color, marker=marker, s=34,
                   alpha=0.55, zorder=3)

# reference lines
ax.axhline(35, color=PAL["muted"], lw=1.2, ls=(0, (4, 3)), zorder=1)
ax.text(2013.2, 36.5, "China annual PM2.5 standard (Class II, 35 µg/m³)", fontsize=7.8, color=PAL["ink2"])
ax.axhline(9, color=PAL["muted"], lw=1.2, ls=(0, (1, 2)), zorder=1)
ax.text(2013.2, 10.3, "US annual PM2.5 standard (since 2024, 9 µg/m³)", fontsize=7.8, color=PAL["ink2"])
ax.axhline(5, color=PAL["aqua"], lw=1.2, ls=(0, (1, 1)), zorder=1)
ax.text(2013.2, 2.2, "WHO annual guideline (5 µg/m³)", fontsize=7.8, color=PAL["ink2"])

ax.set_xlim(2012.5, 2025.8)
ax.set_ylim(0, 78)
ax.set_xticks(range(2013, 2026, 1))
style_ax(ax, ylabel="PM2.5, µg/m³ (annual average)")
ax.legend(loc="upper right", fontsize=9, frameon=False)
ax.text(0, 1.135, "Zhengzhou vs. Boston: annual average PM2.5, 2013-2025",
        transform=ax.transAxes, fontsize=13, fontweight="bold", color=PAL["ink"])
ax.text(0, 1.06, "Zhengzhou's air has improved by roughly half since 2017-2019, but still runs 4-8x Boston's level in every year shown.",
        transform=ax.transAxes, fontsize=9.4, color=PAL["ink2"])

note = ("Zhengzhou: official annual average PM2.5 (细颗粒物年均浓度) from the Zhengzhou Ecological Environment Bureau's yearly Environmental Quality Bulletins (环境质量状况公报), 2019-2025, each bulletin reporting that year's own citywide annual average. "
        "2017-2018 (dashed/lighter markers) are from IQAir's Zhengzhou historical city page instead - a different aggregation method, shown for trend only, not directly comparable point-for-point to the official series.\n"
        "Boston: annual arithmetic mean PM2.5 from the Massachusetts DEP's yearly Annual Air Quality Reports, averaged across that year's active Boston-area monitoring sites (Kenmore Sq, Harrison Ave, Von Hillern St, plus One City Square/174 North St in 2013 and Kneeland St in 2023 - "
        "site coverage changes across years, and only 2013, 2016, 2020, 2023 and 2024 were pulled, not a complete annual series).\n"
        "China and US measurement systems differ in reference method, site siting and rounding, so this comparison should be read as showing the order-of-magnitude gap and each city's own trend, not a precise ranking. Reference lines: China's Class II annual PM2.5 standard "
        "(35 µg/m³, the level most Chinese cities are held to), the current US annual NAAQS (9 µg/m³, tightened from 12 µg/m³ in 2024), and the WHO's 2021 annual guideline (5 µg/m³) - Boston has met the WHO guideline in most years shown; Zhengzhou has not approached even the looser US standard.")
savefig(fig, "airquality_zhengzhou_vs_boston.png", note=note)
