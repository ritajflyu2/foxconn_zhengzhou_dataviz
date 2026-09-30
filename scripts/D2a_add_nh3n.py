"""
D2a (extended). Hongfujin: VOCs/NMHC, COD, and NH3-N (ammonia-nitrogen) -
approved (EIA cumulative design value) vs. actual (self-reported execution
report), three panels.

The original 鸿富锦_核定量vs实际 sheet only carries VOCs/NMHC and COD (that is
what D2a plotted before). NH3-N is not in that pre-built sheet, but the raw
EIA figures ARE in 长表_全部记录 (每个 project 的批复氨氮值, tagged 环评核算/批复排放量
（设计值）) and the actual self-reported NH3-N is in the same monthly emissions
panel D1 already uses. This script re-derives the NH3-N cumulative-approved
series with the same method as the existing VOCs/NMHC and COD series (sum each
2010-2017 assembly-project EIA in approval order: K -> F -> C/L -> D -> B/E ->
G), and reconciles it against the source's own cross-check total the same way
COD/NMHC already are (see note below), then adds it as a third panel to the
existing D2a chart and appends the derived NH3-N columns to the
D2_hongfujin_approved_vs_actual.csv table.

Reads source files read-only; writes into the existing labor/environment
output folders (same files environment_data.py itself writes, so this is a
targeted re-run of just the D2a step, not a duplicate of the whole pipeline).
Run (from project root): python3 scripts/D2a_add_nh3n.py
"""
import textwrap
from pathlib import Path

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

BASE = Path(__file__).resolve().parent.parent  # project root (scripts/ lives one level down)
OUT = BASE / "outputs" / "environment_analysis_output"
TABLES = OUT / "tables"
CHARTS = OUT / "charts"
F_EIA_HIST = BASE / "data" / "environment" / "环境_环评核定与验收历史排放_2010-2026.xlsx"

# ---------------------------------------------------------------- style (same as environment_data.py)
PAL = dict(
    surface="#fcfcfb", page="#f9f9f7", ink="#0b0b0b", ink2="#52514e",
    muted="#898781", grid="#e1e0d9", axis="#c3c2b7",
    blue="#2a78d6", orange="#eb6834", aqua="#1baf7a", yellow="#eda100",
    magenta="#e87ba4", green="#008300", violet="#4a3aa7", red="#e34948",
)
C_HFJ = PAL["blue"]
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
hv = pd.read_csv(TABLES / "D2_hongfujin_approved_vs_actual.csv")  # existing VOCs/COD table

eia_long = pd.read_excel(F_EIA_HIST, sheet_name="长表_全部记录")
hfj = eia_long[eia_long["实体"] == "鸿富锦（郑州，航空港）"].copy()

# Per-project EIA-approved NH3-N (氨氮), same 7 assembly projects used for NMHC/COD
proj = hfj[(hfj["污染物"] == "氨氮") & (hfj["口径"].astype(str).str.startswith("单个项目"))].copy()
proj = proj.sort_values("数据年份（约）")
proj["cum_nh3n"] = proj["数值"].cumsum()
print("Per-project NH3-N build-up:")
print(proj[["数据年份（约）", "口径", "数值", "cum_nh3n"]].to_string())

# Cross-check total the source document itself states for "all current projects,
# 2010-2022" - same role as COD's 161.72 vs. the 158.34 project-sum (a small,
# named reconciliation gap, not a new number invented here)
crosscheck = hfj[(hfj["污染物"] == "氨氮") & (hfj["口径"].astype(str).str.contains("全厂现有工程合计"))]
CROSSCHECK_NH3N = float(crosscheck["数值"].iloc[0]) if len(crosscheck) else float(proj["cum_nh3n"].iloc[-1])
print(f"Cross-check total (全厂现有工程合计): {CROSSCHECK_NH3N}")

# Actual self-reported NH3-N, 2020-2025 (same source/scope as the existing VOCs/COD actuals)
actual = hfj[(hfj["污染物"] == "氨氮") & (hfj["数据性质"] == "实际排放（企业执行报告自报）")].copy()
actual = actual.sort_values("数据年份（约）")
actual_by_year = dict(zip(actual["数据年份（约）"].astype(int), actual["数值"]))
print("Actual self-reported NH3-N by year:", actual_by_year)

# Build the full 2010-2025 cumulative-approved series the same way COD/NMHC are
# built in the existing table: step up at each project's approval year, hold
# flat after 2017, and use the source's own reconciled cross-check total from
# 2018 onward (mirrors how COD's 158.34 project-sum becomes 161.72 from 2018).
proj_cum_by_year = dict(zip(proj["数据年份（约）"].astype(int), proj["cum_nh3n"]))
years = hv["年份"].astype(int).tolist()
approved_nh3n, running = [], 0.0
for y in years:
    if y in proj_cum_by_year:
        running = proj_cum_by_year[y]
    if y >= 2018:
        approved_nh3n.append(CROSSCHECK_NH3N)
    else:
        approved_nh3n.append(running if running > 0 else None)

hv["累计环评核定氨氮（t/a）"] = approved_nh3n
hv["实际氨氮（执行报告，t）"] = [actual_by_year.get(y) for y in years]
hv["实际占核定的比例_氨氮"] = hv["实际氨氮（执行报告，t）"] / hv["累计环评核定氨氮（t/a）"]
hv.to_csv(TABLES / "D2_hongfujin_approved_vs_actual.csv", index=False, encoding="utf-8-sig")
print(hv.to_string())

# ---------------------------------------------------------------- chart (3 panels now)
fig, axes = plt.subplots(1, 3, figsize=(16.5, 4.8))
for ax, approved_col, actual_col, name, ylim in [
    (axes[0], "累计环评核定VOCs/NMHC（t/a）", "实际VOCs（执行报告，t）", "VOCs/NMHC", None),
    (axes[1], "累计环评核定COD（t/a）", "实际COD（执行报告，t）", "COD", None),
    (axes[2], "累计环评核定氨氮（t/a）", "实际氨氮（执行报告，t）", "NH3-N (ammonia-nitrogen)", None),
]:
    ax.plot(hv["年份"], hv[approved_col], color=PAL["muted"], linewidth=2, linestyle="--",
            label="EIA cumulative approved (design value)")
    ax.plot(hv["年份"], hv[actual_col], color=C_HFJ, linewidth=2.2, marker="o", markersize=4,
            label="Actual (self-reported execution report)")
    style_ax(ax, title=f"Hongfujin: {name} approved vs. actual", ylabel="t/yr")
    ax.legend(loc="upper left", fontsize=8, frameon=False)

savefig(fig, "D2a_hongfujin_approved_vs_actual.png",
        note="EIA cumulative approved = the sum of design values from each 2010-2017 assembly-project EIA (zones K/F/C/L/D/B-E/G), unchanged after 2017 because no further assembly-project EIA has been filed since. Actual = self-reported figures from permit execution reports starting 2020. "
        "VOCs/NMHC actual values run far below approved (9.6% in 2020, 13.5% in 2021), suggesting the EIA design values themselves carried large headroom. COD runs the opposite way in 2024-2025, with actual (446-485 tonnes) roughly 3x the cumulative approved figure (161.7 tonnes). "
        "NH3-N (ammonia-nitrogen) is noisier year to year (2021 actual dropped to just 0.26 t, versus 24.8-31 t in the surrounding years), but against the approved cumulative figure (15.84 tonnes) actual already ran above it in 2020, 2022 and 2023 (1.6-2.0x), then jumped further to 59 t (2024) and 99 t (2025), roughly 4-6x approved - the same 'actual now runs well above the original design assumption' pattern seen in COD, on the same 2024-2025 timeline. "
        "The approved and actual figures may not share the same scope (EIA-approved values are per-project design totals; the execution report's actual figure is a self-reported whole-plant total that may include domestic sewage/other sources) - this should not be called 'exceeding limits' without verification against the permit's actual numeric limits (not in this dataset); the chart simply shows the two numbers side by side, without concluding a violation.")
