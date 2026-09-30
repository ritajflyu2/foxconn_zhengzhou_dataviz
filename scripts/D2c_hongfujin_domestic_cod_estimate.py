"""
D2c. Hongfujin: how much of its reported COD could be domestic sewage?
An estimate, not a measurement.

Hongfujin's own EIA filings never split COD into domestic-sewage vs.
production-wastewater (unlike Yuzhan's, which do - see D5). So this script
borrows Yuzhan's own implied per-person domestic-sewage COD rate (from its
two EIA data points where both domestic COD and design headcount are
stated: 66.72 t / 26,000 people, and 43.25 t / 11,614 people) and applies
that rate to Hongfujin's ANNUAL INSURED-WORKER COUNT (the only actual
headcount series this project has for Hongfujin post-2017 - not a design
headcount, and almost certainly an undercount of everyone actually living
on site, since roughly half of Hongfujin's workforce is dispatch/student
labor that is often not carried on Hongfujin's own insured-worker rolls -
see the labor analysis's A2/A3 findings).

This produces a low-high BAND, not a point estimate, and the script flags
years where the estimated domestic-sewage COD would exceed or nearly equal
the ENTIRE reported whole-plant COD - a sign the estimate has broken down
for that year (the coefficient/headcount combination is not plausible),
not a sign that "domestic sewage is basically everything."

Reads source files/derived tables read-only; writes into the existing
environment_analysis_output folder. Run (from project root): python3 scripts/D2c_hongfujin_domestic_cod_estimate.py
"""
import textwrap
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

BASE = Path(__file__).resolve().parent.parent  # project root (scripts/ lives one level down)
TABLES = BASE / "outputs" / "environment_analysis_output" / "tables"
CHARTS = BASE / "outputs" / "environment_analysis_output" / "charts"

# ---------------------------------------------------------------- style (same as environment_data.py / labor_data.py)
PAL = dict(
    surface="#fcfcfb", page="#f9f9f7", ink="#0b0b0b", ink2="#52514e",
    muted="#898781", grid="#e1e0d9", axis="#c3c2b7",
    blue="#2a78d6", orange="#eb6834", aqua="#1baf7a", yellow="#eda100",
    magenta="#e87ba4", green="#008300", violet="#4a3aa7", red="#e34948",
)
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


# ---------------------------------------------------------------- Yuzhan's own implied per-person rate
# From D5 (labor_analysis_output/tables/D5_domestic_cod_vs_design_headcount_paired.csv):
# both domestic COD (t/a) and design headcount stated in the SAME EIA filing.
YUZHAN_RATE_LOW = 66.72 / 26000    # 2022 filing: t COD per person per year
YUZHAN_RATE_HIGH = 43.25 / 11614   # 2025 filing: t COD per person per year
print(f"Implied per-person domestic-sewage COD rate: {YUZHAN_RATE_LOW*1000:.2f}-{YUZHAN_RATE_HIGH*1000:.2f} kg/person/yr "
      f"(the two Yuzhan EIA filings imply different rates, {YUZHAN_RATE_LOW*1000:.2f} vs {YUZHAN_RATE_HIGH*1000:.2f} kg/person/yr, "
      f"so this range is itself the source's own inconsistency, not a confidence interval)")

# ---------------------------------------------------------------- Hongfujin headcount + actual COD
hfj_insured = {2020: 65255, 2021: 40525, 2022: 39463, 2023: 39222, 2024: 33530, 2025: 33498}
hfj_cod_actual = {2020: 150.400, 2021: 63.613, 2022: 285.648, 2023: 180.046, 2024: 446.470, 2025: 485.222}
APPROVED_COD = 161.72  # cumulative EIA-approved design COD, all 7 assembly projects (D2/D4)

rows = []
for y in sorted(hfj_insured):
    hc = hfj_insured[y]
    actual = hfj_cod_actual[y]
    dom_low = hc * YUZHAN_RATE_LOW
    dom_high = hc * YUZHAN_RATE_HIGH
    implausible = dom_low >= actual  # even the LOW estimate already exceeds the whole plant's reported total
    prod_low = max(actual - dom_high, 0)
    prod_high = max(actual - dom_low, 0)
    rows.append(dict(year=y, insured_headcount=hc, actual_cod_whole_plant=actual,
                      est_domestic_cod_low=round(dom_low, 1), est_domestic_cod_high=round(dom_high, 1),
                      est_domestic_share_low_pct=round(100 * dom_low / actual, 1),
                      est_domestic_share_high_pct=round(100 * dom_high / actual, 1),
                      implied_production_cod_low=round(prod_low, 1), implied_production_cod_high=round(prod_high, 1),
                      flag="ESTIMATE IMPLAUSIBLE (domestic-only estimate >= whole-plant actual)" if implausible else ""))
tbl = pd.DataFrame(rows)
tbl.to_csv(TABLES / "D2c_hongfujin_domestic_cod_estimate.csv", index=False, encoding="utf-8-sig")
print(tbl.to_string())

# ---------------------------------------------------------------- chart
# Stacked so the part that should be compared to the EIA-approved (production)
# design line sits at the BOTTOM of the bar - that way the dashed line cuts
# directly across the blue segment, and it's visually obvious whether implied
# production COD alone already clears the approved threshold, independent of
# how much of the rest is (estimated) domestic sewage stacked on top.
fig, ax = plt.subplots(figsize=(10.5, 6.2))
years = tbl["year"].tolist()
x = np.arange(len(years))

dom_mid = (tbl["est_domestic_cod_low"] + tbl["est_domestic_cod_high"]) / 2
prod_mid = (tbl["actual_cod_whole_plant"] - dom_mid).clip(lower=0)

for xi, actual, p_mid, d_mid, d_lo, d_hi, implausible in zip(
        x, tbl["actual_cod_whole_plant"], prod_mid, dom_mid,
        tbl["est_domestic_cod_low"], tbl["est_domestic_cod_high"], tbl["flag"] != ""):
    if implausible:
        # can't credibly split this year - show the whole actual bar as "unresolved"
        ax.bar(xi, actual, width=0.55, bottom=0, color=PAL["red"], alpha=0.55, zorder=3,
               hatch="///", edgecolor=PAL["surface"], linewidth=0.6)
        ax.text(xi, actual + 14, "can't split -" + chr(10) + "estimate" + chr(10) + "exceeds actual",
                ha="center", va="bottom", fontsize=7.3, color=PAL["red"])
        continue
    # bottom segment: implied production-related COD (blue) - compare this to the dashed line
    ax.bar(xi, p_mid, width=0.55, bottom=0, color=PAL["blue"], alpha=0.85, zorder=3,
           edgecolor=PAL["surface"], linewidth=0.6,
           label="Implied production-related COD (est., midpoint)" if xi == x[2] else None)
    # top segment: estimated domestic-sewage COD (orange)
    ax.bar(xi, d_mid, width=0.55, bottom=p_mid, color=PAL["orange"], alpha=0.85, zorder=3,
           edgecolor=PAL["surface"], linewidth=0.6,
           label="Estimated domestic-sewage COD (midpoint)" if xi == x[2] else None)
    # uncertainty bracket around the split point (low-high domestic estimate)
    split_lo, split_hi = actual - d_lo, actual - d_hi  # in terms of the boundary height
    ax.plot([xi, xi], [min(split_lo, split_hi), max(split_lo, split_hi)], color=PAL["ink"], lw=1.4, zorder=5)
    ax.plot([xi - 0.12, xi + 0.12], [min(split_lo, split_hi)] * 2, color=PAL["ink"], lw=1.4, zorder=5)
    ax.plot([xi - 0.12, xi + 0.12], [max(split_lo, split_hi)] * 2, color=PAL["ink"], lw=1.4, zorder=5)

ax.axhline(APPROVED_COD, color=PAL["muted"], lw=1.8, ls=(0, (4, 3)), zorder=2)
ax.text(len(years) - 0.4, APPROVED_COD + 8, "EIA-approved design COD (161.7 t/yr)", ha="right", fontsize=8.4,
        color=PAL["ink2"])

ax.set_xticks(x); ax.set_xticklabels(years, fontsize=10)
ax.set_ylim(0, tbl["actual_cod_whole_plant"].max() * 1.18)
style_ax(ax, title="Hongfujin: implied production COD vs. domestic sewage (estimate)", ylabel="COD, t/yr")

from matplotlib.patches import Patch
ax.legend(handles=[
    Patch(color=PAL["blue"], alpha=0.85, label="Implied production-related COD (bottom of bar - compare to dashed line)"),
    Patch(color=PAL["orange"], alpha=0.85, label="Estimated domestic-sewage COD (top of bar)"),
    Patch(facecolor="none", edgecolor=PAL["ink"], label="Black bracket = low-high uncertainty in the domestic-sewage estimate"),
    Patch(color=PAL["red"], alpha=0.55, hatch="///", label="Can't split this year (domestic-only estimate ≥ actual total)"),
], loc="upper left", fontsize=8.2, frameon=False)

note = (f"Method: Hongfujin's own EIA filings never split COD into domestic-sewage vs. production-wastewater (unlike Yuzhan's - see D5). This chart borrows Yuzhan's OWN implied "
        f"per-person domestic-sewage COD rate from its two EIA filings that state both domestic COD and design headcount together (66.72 t / 26,000 people = {YUZHAN_RATE_LOW*1000:.2f} kg/person/yr; "
        f"43.25 t / 11,614 people = {YUZHAN_RATE_HIGH*1000:.2f} kg/person/yr - these two Yuzhan filings themselves imply different rates, so the resulting band reflects that source inconsistency, not a statistical confidence interval), "
        f"and applies it to Hongfujin's own annual INSURED-WORKER headcount (not a design headcount - none exists for Hongfujin post-2017 in this dataset).\n"
        f"This is a rough estimate stacked on two uncertain inputs, not a measurement: Hongfujin's insured-worker count almost certainly UNDERcounts everyone actually living/eating on site, since roughly half its workforce "
        f"is dispatch or student labor typically not carried on Hongfujin's own insured rolls (see the labor analysis, A2/A3) - so if anything this likely underestimates true domestic sewage, while the coefficient itself is borrowed from a different legal entity's dorm/canteen setup, "
        f"which may not match Hongfujin's.\n"
        f"2020 and 2021 are flagged as implausible: even the LOW estimate of domestic sewage alone would exceed the entire whole-plant reported COD for those years - a sign this method breaks down there (most likely 2020-2021's whole-plant actual COD figures "
        f"are themselves unusually low relative to headcount, not that domestic sewage really was 100%+ of the plant's pollution). For 2022-2025, where the estimate is plausible, subtracting even the HIGH end of the domestic-sewage band still leaves an implied "
        f"production-related COD of roughly 320-360 t/yr in 2024-2025 - still about 2x the plant's original EIA-approved design COD (161.7 t/yr). In other words: even under a generous domestic-sewage assumption, the 'actual COD now runs well above the original "
        f"design assumption' finding from D2 survives.")
savefig(fig, "D2c_hongfujin_domestic_cod_estimate.png", note=note)
