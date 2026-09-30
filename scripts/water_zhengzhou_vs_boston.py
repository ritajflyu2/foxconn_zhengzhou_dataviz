"""
Water quality context: Zhengzhou vs. Boston, quantitative trends.

Companion to airquality_zhengzhou_vs_boston.py - same freestanding city
comparison, this time for water instead of air. Two DIFFERENT metrics are used
because the two cities' primary published water-quality numbers are not the
same kind of measurement, and forcing them onto one line would be misleading:

- Zhengzhou: % of monitored river sections rated Grade I-III ("good or
  better") under China's surface water standard (GB 3838), from the city's own
  annual Environmental Quality Bulletins (环境质量状况公报). This is a CHEMICAL
  water-quality classification (dissolved oxygen, ammonia-nitrogen, COD, etc.),
  not a bacteria/swimming-safety measure.
- Boston: % of samples meeting Massachusetts' bacterial water-quality standard
  for swimming and boating in the Charles River (EPA/CRWA Charles River Report
  Card, published annually since 1995). This is specifically a BACTERIA
  (E. coli/enterococcus) recreational-safety measure, not a broad chemical
  grade.

So this script draws them as two side-by-side panels (not one shared line),
each showing that city's OWN trend, with the metric definitions spelled out in
the note - this should not be read as "Zhengzhou's rivers vs. Boston's river"
on a single ranking, but as two different, non-comparable stories about
"how much of this city's tested water met its own standard."

A third context point (drinking water) is added as text only, not a
chart line, since both cities report ~100% compliance every year checked -
not a numeric trend worth plotting.

Reads no local project files; writes into airquality_analysis_output's
sibling water_analysis_output/.
Run (from project root): python3 scripts/water_zhengzhou_vs_boston.py
"""
import textwrap
from pathlib import Path

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

BASE = Path(__file__).resolve().parent.parent  # project root (scripts/ lives one level down)
OUT = BASE / "outputs" / "water_analysis_output"
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
C_ZZ, C_BOS_SWIM, C_BOS_BOAT = PAL["blue"], PAL["orange"], PAL["yellow"]
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
        ax.set_title(title, loc="left", pad=10, fontsize=11.5)
    if ylabel:
        ax.set_ylabel(ylabel, fontsize=9.3)
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
        fig.text(0.01, -0.02, "\n".join(lines), fontsize=7.6, color=PAL["muted"],
                  ha="left", va="top", transform=fig.transFigure)
    fig.tight_layout()
    fig.savefig(CHARTS / name, bbox_inches="tight", facecolor=PAL["surface"])
    plt.close(fig)
    print(f"  chart -> {name}")


# ---------------------------------------------------------------- data
rows = [
    # Zhengzhou: % of monitored river sections rated Grade I-III (good or better), GB 3838 chemical standard.
    # Network composition changes year to year (see 'basis' / 'n_sections') - flagged in the note.
    dict(city="Zhengzhou", year=2019, metric="river_good_pct", value=66.7, n_sections=None,
         basis="national control sections only", source="郑州市环境质量状况公报 2019"),
    dict(city="Zhengzhou", year=2021, metric="river_good_pct", value=58.3, n_sections=24,
         basis="24 combined national/provincial/city control sections", source="郑州市环境质量状况公报 2021"),
    dict(city="Zhengzhou", year=2023, metric="river_good_pct", value=round(100 * (6 + 6) / (8 + 16), 1), n_sections=24,
         basis="Yellow River basin (6/8) + Huai River basin (6/16), combined", source="郑州市环境质量状况公报 2023"),
    dict(city="Zhengzhou", year=2025, metric="river_good_pct", value=round(100 * (3 + 8) / (8 + 17), 1), n_sections=25,
         basis="Yellow River basin (3/8) + Huai River basin (8/17), combined", source="郑州市环境质量状况公报 2025"),
    # Boston: Charles River, % of bacteria samples meeting MA standard, EPA/CRWA Report Card
    dict(city="Boston", year=1995, metric="swim_safe_pct", value=19.0, n_sections=None, basis="swimming standard", source="EPA/CRWA Charles River Report Card"),
    dict(city="Boston", year=1995, metric="boat_safe_pct", value=39.0, n_sections=None, basis="boating standard", source="EPA/CRWA Charles River Report Card"),
    dict(city="Boston", year=2006, metric="swim_safe_pct", value=62.0, n_sections=None, basis="swimming standard", source="EPA/CRWA Charles River Report Card"),
    dict(city="Boston", year=2006, metric="boat_safe_pct", value=90.0, n_sections=None, basis="boating standard", source="EPA/CRWA Charles River Report Card"),
    dict(city="Boston", year=2016, metric="swim_safe_pct", value=55.0, n_sections=None, basis="swimming standard", source="EPA Charles River Report Card 2016"),
    dict(city="Boston", year=2016, metric="boat_safe_pct", value=86.0, n_sections=None, basis="boating standard", source="EPA Charles River Report Card 2016"),
    dict(city="Boston", year=2018, metric="swim_safe_pct", value=round((66 + 47) / 2, 1), n_sections=None, basis="swimming standard, avg of dry(66%)/wet(47%) weather", source="EPA Charles River Report Card 2018"),
    dict(city="Boston", year=2018, metric="boat_safe_pct", value=round((94 + 91) / 2, 1), n_sections=None, basis="boating standard, avg of dry(94%)/wet(91%) weather", source="EPA Charles River Report Card 2018"),
]
tbl = pd.DataFrame(rows)
tbl.to_csv(TABLES / "water_zhengzhou_vs_boston.csv", index=False, encoding="utf-8-sig")
print(tbl.to_string())

# ---------------------------------------------------------------- chart (2 panels: different metrics, not shared axis story)
fig, axes = plt.subplots(1, 2, figsize=(12.5, 5.6))

# Panel 1: Zhengzhou river Grade I-III %
ax = axes[0]
zz = tbl[tbl["city"] == "Zhengzhou"].sort_values("year")
ax.plot(zz["year"], zz["value"], color=C_ZZ, marker="o", markersize=7, linewidth=2.2, zorder=3)
for _, r in zz.iterrows():
    ax.text(r["year"], r["value"] + 2.5, f"{r['value']:.1f}%", ha="center", fontsize=9, color=PAL["ink2"])
ax.set_xticks(zz["year"])
ax.set_ylim(0, 85)
style_ax(ax, title="Zhengzhou: monitored river sections rated\nGrade I-III (good), %", ylabel="%")

# Panel 2: Boston Charles River swim/boat safe %
ax = axes[1]
for metric, color, label in [("boat_safe_pct", C_BOS_BOAT, "Safe for boating"), ("swim_safe_pct", C_BOS_SWIM, "Safe for swimming")]:
    sub = tbl[(tbl["city"] == "Boston") & (tbl["metric"] == metric)].sort_values("year")
    ax.plot(sub["year"], sub["value"], color=color, marker="s", markersize=7, linewidth=2.2, zorder=3, label=label)
    for _, r in sub.iterrows():
        ax.text(r["year"], r["value"] + 2.5, f"{r['value']:.0f}%", ha="center", fontsize=8.6, color=PAL["ink2"])
ax.set_xticks(sorted(tbl[tbl["city"] == "Boston"]["year"].unique()))
ax.set_ylim(0, 100)
style_ax(ax, title="Boston: Charles River samples meeting\nbacteria standard, %", ylabel="%")
ax.legend(loc="lower right", fontsize=8.6, frameon=False)

fig.text(0, 1.06, "Zhengzhou vs. Boston: water quality, two different measures",
          fontsize=13.5, fontweight="bold", color=PAL["ink"], transform=fig.transFigure)
fig.text(0, 1.0, "Zhengzhou's rivers meeting China's own 'good' grade have gotten LESS common since 2019, even as its air improved. Boston's Charles River\n"
                  "went from almost never safe to swim in (1995) to mostly safe within a decade, then has drifted down somewhat since.",
          fontsize=9.3, color=PAL["ink2"], transform=fig.transFigure)

note = ("These are NOT the same measurement and should not be read as a single ranking. Zhengzhou's number is the share of its own monitored river sections rated Grade I-III ('good or better') under China's "
        "chemical surface-water standard (GB 3838 - dissolved oxygen, ammonia-nitrogen, COD, etc.), from the city's annual Environmental Quality Bulletins. The monitored network's composition changes across years "
        "(2019: national-control sections only; 2021: 24 combined national/provincial/city sections; 2023 and 2025: two separate river basins, Yellow River and Huai River, combined here into one weighted percentage) "
        "so this is a trend in 'how much of what's being tested passes,' not a fixed set of the same river points every year.\n"
        "Boston's numbers are the share of bacteria (E. coli/enterococcus) samples from the Charles River Lower Basin meeting the Massachusetts standard for safe boating or swimming, from the EPA/Charles River Watershed "
        "Association's annual Report Card (published since 1995) - a narrower, health-hazard-focused measure, not an overall chemical grade. 2018's values are averaged from separately reported dry- and wet-weather "
        "percentages (wet-weather compliance is consistently lower, since stormwater runoff and combined-sewer overflows are the main driver of failures).\n"
        "Both cities' treated DRINKING water is reported as fully compliant with health-based standards in every year checked in this project (Zhengzhou's bulletins: both surface and groundwater drinking sources meet Grade "
        "II/III standards every year 2019-2025; Boston/MWRA: '2024 Annual Water Quality Test Results' reports zero violations of any EPA or state standard) - not shown as a chart line here since there is no numeric trend, "
        "only a repeated pass/fail. The two headline metrics above are about SURFACE water (rivers), not what comes out of the tap.")
savefig(fig, "water_zhengzhou_vs_boston.png", note=note)
