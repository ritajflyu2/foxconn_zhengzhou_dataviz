"""
A1 chart redesign (Foxconn Zhengzhou insured workers vs. total workforce).

Standalone script, separate from labor_data.py, so that re-running it touches
only the three A1_*.csv tables and the A1 chart files under
labor_analysis_output/ - nothing else in the repo is read for writing or
modified. Source-of-truth data is the existing A1_*.csv tables (already
derived, read-only here) plus the fix log documented inline below.

Run: python3 redesign_a1_chart.py
"""
import textwrap
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.patches import FancyArrowPatch

warnings.filterwarnings("ignore")

BASE = Path(__file__).resolve().parent
TABLES = BASE / "labor_analysis_output" / "tables"
CHARTS = BASE / "labor_analysis_output" / "charts"

# ---------------------------------------------------------------------------
# Palette (validated: `node validate_palette.js` on the 8-hue default order
# passes all hard gates in light mode; see A1_说明.md for the run). Series in
# THIS chart use only consecutive slots from that order, per group, so every
# color-pair actually shown together is covered by the documented adjacent-gate
# guarantee rather than an unvalidated ad hoc combination:
#   stack (3, stacked -> adjacent by construction): slots 1-3 blue/orange/aqua
#   season status (2, adjacent):                   slots 7-8 violet/red
#   2025 breakdown (2, adjacent):                   slots 4-5 yellow/magenta
# ---------------------------------------------------------------------------
PAL = dict(
    surface="#fcfcfb", page="#f9f9f7", ink="#0b0b0b", ink2="#52514e",
    muted="#898781", grid="#e1e0d9", axis="#c3c2b7",
    blue="#2a78d6", orange="#eb6834", aqua="#1baf7a", yellow="#eda100",
    magenta="#e87ba4", green="#008300", violet="#4a3aa7", red="#e34948",
)
C_HFJ, C_FLYZ, C_HNFC = PAL["blue"], PAL["orange"], PAL["aqua"]          # stack
C_TROUGH, C_PEAK = PAL["violet"], PAL["red"]                             # season
C_REGULAR, C_DISPATCH = PAL["yellow"], PAL["magenta"]                    # 2025 split
C_KAIFA = PAL["green"]                                                    # 经开区 entity, unused elsewhere
# Entity identity stays consistent wherever an entity reappears across panels:
# 鸿富锦=blue and 富联裕展/河南裕展=orange are reused as-is in the EIA panel (Step 4)
# rather than picked afresh, so the same company is never two colors on one page.

if "PingFang SC" in {f.name for f in fm.fontManager.ttflist}:
    plt.rcParams["font.family"] = ["PingFang SC"]
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


def panel_title(ax, title, subtitle=None, title_dy=0.10, sub_dy=0.038):
    """Title + subtitle as two independently-spaced ax.text calls (axes fraction),
    replacing ax.set_title so the two never collide regardless of figure size."""
    ax.text(0, 1.0 + title_dy, title, transform=ax.transAxes, fontsize=12.5,
             fontweight="bold", color=PAL["ink"], ha="left", va="bottom")
    if subtitle:
        ax.text(0, 1.0 + sub_dy, subtitle, transform=ax.transAxes, fontsize=8.6,
                 color=PAL["ink2"], ha="left", va="bottom")


def wrap_note(fig, note, y=-0.02):
    width_chars = max(60, int(fig.get_figwidth() * 15.5))
    lines = []
    for para in note.split("\n"):
        lines.extend(textwrap.wrap(para, width=width_chars, break_long_words=True,
                                    break_on_hyphens=False) or [""])
    fig.text(0.01, y, "\n".join(lines), fontsize=7.6, color=PAL["muted"],
              ha="left", va="top", transform=fig.transFigure)


print("=" * 70)
print("Step 1 - clean the three A1 tables in place")
print("=" * 70)

# =====================================================================
# 1a-c. Insured workers by entity: add 园区 and data-quality flags
# =====================================================================
insured = pd.read_csv(TABLES / "A1_insured_workers_by_entity_annual.csv")

ENTITY_TO_ZONE = {
    "鸿富锦": "航空港", "富联裕展/河南裕展": "航空港", "河南富驰": "航空港",
    "富联精密/富泰华": "经开区",
}
insured["园区"] = insured["实体简称"].map(ENTITY_TO_ZONE)
assert insured["园区"].notna().all(), "unmapped entity in insured table"

insured["flag"] = ""
insured.loc[(insured["实体简称"] == "河南富驰") & (insured["年份"] == 2020),
            "flag"] = "outlier_or_reporting_gap"
insured.loc[(insured["实体简称"] == "河南富驰") & (insured["年份"].between(2017, 2019)),
            "flag"] = "shell_entity_pre2021"
insured.loc[(insured["实体简称"] == "富联裕展/河南裕展") & (insured["年份"] == 2016),
            "flag"] = "possible_partial_year"
insured.loc[(insured["实体简称"] == "河南富驰") & (insured["年份"] == 2021),
            "flag"] = "likely_intra_group_transfer (note only, not asserted)"
insured.loc[(insured["实体简称"] == "鸿富锦") & (insured["年份"] == 2021),
            "flag"] = "likely_intra_group_transfer (note only, not asserted)"
save_note_1c = (
    "河南富驰 2020=1 is treated as 0 in the Airport-Zone stack (see chart footnote), "
    "not dropped from the table. 河南富驰 jumping from ~1 (2020) to 10,626 (2021) while "
    "鸿富锦 drops by ~24,730 in the same year is flagged as a *possible* intra-group "
    "headcount transfer between the two entities' filings - this is a note, not a "
    "confirmed finding; no source states this directly."
)
insured.to_csv(TABLES / "A1_insured_workers_by_entity_annual.csv", index=False,
               encoding="utf-8-sig")
print(f"  overwrote A1_insured_workers_by_entity_annual.csv ({len(insured)} rows)")
print(f"    note: {save_note_1c}")

# =====================================================================
# 1d. Workforce point estimates: 园区, bound_type, season relabel
# =====================================================================
wf = pd.read_csv(TABLES / "A1_total_workforce_point_estimates.csv")
wf["园区"] = "航空港"  # CLW/news describe the Airport Zone campus for every row here


def bound_type(row):
    lo_present = pd.notna(row["low"])
    hi_present = pd.notna(row["high"])
    if lo_present and hi_present:
        return "range"
    if lo_present and not hi_present:
        return "lower_bound"
    if hi_present and not lo_present:
        return "approx_point"
    return "unknown"


wf["bound_type"] = wf.apply(bound_type, axis=1)
before = wf.loc[wf["year"] == 2019, "season"].tolist()
wf.loc[(wf["year"] == 2019) & (wf["kind"] == "CLW total workforce"), "season"] = "peak"
print(f"  relabeled 2019 season: {before} -> "
      f"{wf.loc[(wf['year'] == 2019) & (wf['kind'] == 'CLW total workforce'), 'season'].tolist()} "
      "(the estimate is for August, peak season)")
wf.to_csv(TABLES / "A1_total_workforce_point_estimates.csv", index=False, encoding="utf-8-sig")
print(f"  overwrote A1_total_workforce_point_estimates.csv ({len(wf)} rows)")

# =====================================================================
# 1e. EIA design headcounts: FIX the 实体简称 mislabeling, add 园区 + note
# =====================================================================
eia = pd.read_csv(TABLES / "A1_eia_design_headcounts_by_project.csv")
eia_before = eia[["实体", "实体简称"]].drop_duplicates()

# The original mapping used a buggy fuzzy prefix match ("富联" matched both
# 富联精密电子 and 富联裕展科技; "河南" matched both 河南富驰科技 and the
# "（河南）" suffix on 富士康新能源汽车产业发展（河南）). Fix by mapping the exact
# 实体 string, which is unambiguous.
ENTITY_FIX = {
    "富士康新能源汽车产业发展（河南）": "富士康新能源汽车",
    "富泰华精密电子（郑州）/今富联精密电子（郑州）": "富联精密/富泰华",
    "河南裕展精密/富联裕展（河南）": "富联裕展/河南裕展",
    "富联裕展科技（河南）（原河南裕展精密）": "富联裕展/河南裕展",
    "鸿富锦精密电子（郑州）": "鸿富锦",
}
unmapped = set(eia["实体"]) - set(ENTITY_FIX)
assert not unmapped, f"unmapped EIA entity strings: {unmapped}"
eia["实体简称"] = eia["实体"].map(ENTITY_FIX)

eia_after = eia[["实体", "实体简称"]].drop_duplicates()
changed = eia_before.merge(eia_after, on="实体", suffixes=("_旧", "_新"))
changed = changed[changed["实体简称_旧"] != changed["实体简称_新"]]
print("  fixed 实体简称 mislabeling:")
for _, r in changed.iterrows():
    print(f"    {r['实体'][:24]:<26} {r['实体简称_旧']} -> {r['实体简称_新']}")

EIA_ZONE = {
    "鸿富锦": "航空港", "富联裕展/河南裕展": "航空港", "河南富驰": "航空港",
    "富士康新能源汽车": "航空港", "富联精密/富泰华": "经开区",
}
eia["园区"] = eia["实体简称"].map(EIA_ZONE)
assert eia["园区"].notna().all(), "unmapped entity in EIA table"

eia["note"] = ""
mask_5g = (eia["实体简称"] == "富联裕展/河南裕展") & (eia["代表月份"] == "2025-01")
eia.loc[mask_5g, "note"] = (
    "Same EIA filing also states 20,400 elsewhere in the document for what appears to "
    "be a related/overlapping scope; 18,000 and 20,400 are both reported without a clear "
    "reconciliation in the source, per 定员口径's own \"文中另一处写20400人\" note."
)
eia.to_csv(TABLES / "A1_eia_design_headcounts_by_project.csv", index=False, encoding="utf-8-sig")
print(f"  overwrote A1_eia_design_headcounts_by_project.csv ({len(eia)} rows)")
print("  note: EIA headcounts are not summed/stacked - 定员口径 mixes project-level, "
      "incremental, and whole-plant scopes; each row is plotted as its own point.")

print()
print("=" * 70)
print("Step 2-4 - build the composite A1 chart")
print("=" * 70)

YEARS = list(range(2016, 2026))
WAN = 10_000.0  # 万人 unit divisor

# --- Main-panel data: Airport Zone insured-worker stack (万人), with the 2020
# 河南富驰 outlier treated as 0 for the stack (per Step 1c), not dropped from
# the underlying table.
airport = insured[insured["园区"] == "航空港"].copy()
airport.loc[(airport["实体简称"] == "河南富驰") & (airport["年份"] == 2020),
            "工伤保险参保人数_stack"] = 0
airport["工伤保险参保人数_stack"] = airport.get(
    "工伤保险参保人数_stack", airport["工伤保险参保人数"])
airport["工伤保险参保人数_stack"] = airport["工伤保险参保人数_stack"].fillna(
    airport["工伤保险参保人数"])

pivot = (airport.pivot_table(index="年份", columns="实体简称",
                              values="工伤保险参保人数_stack", aggfunc="sum")
         .reindex(YEARS).fillna(0.0))
STACK_ORDER = ["鸿富锦", "富联裕展/河南裕展", "河南富驰"]
STACK_COLOR = {"鸿富锦": C_HFJ, "富联裕展/河南裕展": C_FLYZ, "河南富驰": C_HNFC}
stack_vals = [pivot[e].values / WAN for e in STACK_ORDER]
stack_total = pivot[STACK_ORDER].sum(axis=1) / WAN

# sanity check against the totals given in the brief
EXPECTED_TOTAL = {2016: 22.2182, 2017: 20.5938, 2018: 16.7156, 2019: 9.2319,
                  2020: 8.8802, 2021: 7.0528, 2022: 6.9526, 2023: 6.4663,
                  2024: 5.5384, 2025: 5.3208}
for yr, exp in EXPECTED_TOTAL.items():
    got = stack_total.loc[yr]
    assert abs(got - exp) < 0.02, f"{yr}: stack total {got:.4f} != expected {exp}"
print("  stack totals reconciled against the brief's figures (万人, all years within 0.02)")

wf_total = wf[wf["kind"] == "CLW total workforce"].copy()
wf_2025_split = wf[wf["kind"].isin(["CLW regular (insured-eligible)", "CLW dispatch"])].copy()

fig = plt.figure(figsize=(13.5, 11.5))
gs = fig.add_gridspec(2, 2, height_ratios=[1.65, 1], hspace=0.42, wspace=0.28)
ax_main = fig.add_subplot(gs[0, :])
ax_kaifa = fig.add_subplot(gs[1, 0])
ax_eia = fig.add_subplot(gs[1, 1])

# =====================================================================
# MAIN PANEL - Airport Zone (航空港)
# =====================================================================
ax = ax_main
ax.stackplot(YEARS, *stack_vals, colors=[STACK_COLOR[e] for e in STACK_ORDER],
             labels=STACK_ORDER, alpha=0.88, zorder=2)
ax.plot(YEARS, stack_total.values, color=PAL["ink2"], linewidth=1.2, zorder=3)

# endpoint labels on the stack total
ax.annotate(f"{stack_total.loc[2016]:.1f}万", xy=(2016, stack_total.loc[2016]),
            xytext=(-4, 8), textcoords="offset points", fontsize=8.6, color=PAL["ink"],
            ha="right", fontweight="bold")
ax.annotate(f"{stack_total.loc[2025]:.1f}万", xy=(2025, stack_total.loc[2025]),
            xytext=(-4, 8), textcoords="offset points", fontsize=8.6, color=PAL["ink"],
            ha="right", fontweight="bold")

# 2020 河南富驰 outlier: a small ringed marker only - the full explanation is in the
# figure-level footnote below, so no text box needed here (avoids overlapping the fill).
ax.scatter([2020], [stack_total.loc[2020]], s=90, facecolor="none",
           edgecolor=PAL["ink2"], linewidth=1.3, zorder=6)
ax.annotate("*", xy=(2020, stack_total.loc[2020]), xytext=(9, 6),
            textcoords="offset points", fontsize=13, color=PAL["ink2"], fontweight="bold")

BAR_DX = 0.16
SEASON_COLOR = {"peak": C_PEAK, "trough": C_TROUGH}
SEASON_LABEL = {"peak": "旺季估计", "trough": "淡季估计"}
seen_season_legend = set()
for _, r in wf_total.iterrows():
    x = r["year"] + BAR_DX
    col = SEASON_COLOR[r["season"]]
    lbl = SEASON_LABEL[r["season"]] if r["season"] not in seen_season_legend else None
    seen_season_legend.add(r["season"])
    if r["bound_type"] == "lower_bound":
        # Fixed, small arrow extension (not proportional to `lo`) so the label for
        # the largest lower bound (2017, 30万) still lands well under ylim=32 and
        # never strays into the subtitle's space above the axes.
        lo = r["low"] / WAN
        ax.annotate("", xy=(x, lo + 1.5), xytext=(x, lo),
                    arrowprops=dict(arrowstyle="-|>", color=col, linewidth=2.4,
                                     mutation_scale=14), zorder=5)
        ax.plot([x], [lo], marker="_", markersize=1, color=col)
        ax.text(x, lo + 1.8, f">{lo:.0f}万", fontsize=8, color=PAL["ink"], ha="center")
        if lbl:
            ax.plot([], [], color=col, linewidth=2.4, marker="^", markersize=7, label=lbl)
    elif r["bound_type"] == "approx_point":
        hi = r["high"] / WAN
        ax.scatter([x], [hi], marker="D", s=46, color=col, zorder=5,
                   edgecolor=PAL["surface"], linewidth=1)
        ax.text(x + 0.12, hi, f"约{hi:.0f}万", fontsize=8, color=PAL["ink"], va="center")
        if lbl:
            ax.scatter([], [], marker="D", s=46, color=col, label=lbl)
    else:  # range
        lo, hi = r["low"] / WAN, r["high"] / WAN
        ax.plot([x, x], [lo, hi], color=col, linewidth=5, solid_capstyle="round", zorder=5)
        ax.text(x, hi + 0.6, f"{lo:.0f}–{hi:.0f}万", fontsize=8, color=PAL["ink"],
                ha="center")
        if lbl:
            ax.plot([], [], color=col, linewidth=5, label=lbl)

# 2025 regular/dispatch breakdown, small stacked bar beside the main 2025 marks
x25 = 2025 + 0.42
reg = wf_2025_split[wf_2025_split["kind"].str.contains("regular")].iloc[0]
disp = wf_2025_split[wf_2025_split["kind"].str.contains("dispatch")].iloc[0]
reg_mid, disp_mid = (reg["low"] + reg["high"]) / 2 / WAN, (disp["low"] + disp["high"]) / 2 / WAN
ax.bar([x25], [reg_mid], width=0.18, color=C_REGULAR, zorder=4, label="2025正式工（中值，6-8万）")
ax.bar([x25], [disp_mid], width=0.18, bottom=[reg_mid], color=C_DISPATCH, zorder=4,
       label="2025派遣工（中值，8-11万）")
# Labels sit outside the bar (too narrow for inline text) rather than clipped inside it.
ax.text(x25 + 0.13, reg_mid / 2, "正式工 6-8万", fontsize=7.4, ha="left", va="center",
        color=PAL["ink"])
ax.text(x25 + 0.13, reg_mid + disp_mid / 2, "派遣工 8-11万", fontsize=7.4, ha="left", va="center",
        color=PAL["ink"])

# Gap annotation (uninsured dispatch/student workers) at the best-documented year, 2025.
# Placed at x=2025+BAR_DX (the season-bar's own x slot, just past the stackplot's right
# edge) so the hatch never draws on top of the colored stack fill.
gap_lo = stack_total.loc[2025]
gap_hi = wf_total.loc[(wf_total["year"] == 2025) & (wf_total["kind"] == "CLW total workforce"),
                       "low"].iloc[0] / WAN
gx = 2025 + BAR_DX
ax.fill_betweenx([gap_lo, gap_hi], gx - 0.075, gx + 0.075, color=PAL["muted"], alpha=0.18,
                 zorder=1, hatch="////", edgecolor=PAL["muted"], linewidth=0)
ax.annotate("未参保的派遣工/学生工\n（推断，口径不同；2017/2019/2023同理）",
            xy=(gx, (gap_lo + gap_hi) / 2), xytext=(2019.9, 19.5),
            fontsize=7.6, color=PAL["ink2"], ha="left",
            arrowprops=dict(arrowstyle="-", color=PAL["muted"], linewidth=0.8))

# 2018 footnote: trough estimate sits BELOW the insured stack
ax.annotate("2018年淡季估计(约6万)低于当年参保合计(16.7万)：年报参保人数\n"
            "可能是全年累计参保过的人数，不是某一时点在职人数（未证实）——\n"
            "若是，可解释为何会超过淡季实际在岗人数。",
            xy=(2018 + BAR_DX, wf_total.loc[wf_total["year"] == 2018, "high"].iloc[0] / WAN),
            xytext=(2019.3, 26.5), fontsize=7.3, color=PAL["ink2"], ha="left",
            arrowprops=dict(arrowstyle="-", color=PAL["muted"], linewidth=0.8))

ax.set_xlim(2015.5, 2026.9)
ax.set_ylim(0, 32)
ax.set_xticks(YEARS)
ax.set_ylabel("万人")
panel_title(ax, "航空港园区：参保工人 vs. 实际用工（2016-2025）",
            "参保人数来自企业年报（直接雇佣）；总用工为CLW/媒体的季节性估计（含派遣与学生工）",
            title_dy=0.135, sub_dy=0.045)
handles, labels = ax.get_legend_handles_labels()
ax.legend(handles, labels, loc="upper left", bbox_to_anchor=(1.005, 1.0), fontsize=8.3,
          frameon=False, title="图例", title_fontsize=8.6)

# =====================================================================
# SECONDARY PANEL - 经开区 (富联精密/富泰华); own scale, own subplot (not a
# second y-axis on the same panel)
# =====================================================================
ax = ax_kaifa
kaifa = insured[insured["园区"] == "经开区"].set_index("年份").reindex(YEARS)
kaifa_wan = kaifa["工伤保险参保人数"] / WAN
ax.plot(YEARS, kaifa_wan.values, color=C_KAIFA, marker="o", markersize=5,
        linewidth=2.2, label="参保人数（富联精密/富泰华）", zorder=3)
eia_kaifa_val = eia.loc[eia["园区"] == "经开区", "劳动定员（人）"].dropna().unique()
assert len(eia_kaifa_val) == 1 and eia_kaifa_val[0] == 23000, eia_kaifa_val
ax.hlines(23000 / WAN, YEARS[0] - 0.3, YEARS[-1] + 0.3, color=PAL["ink2"], linewidth=1.8,
          linestyle=(0, (5, 3)), label="环评全厂劳动定员=2.3万（2013-2022历次批复不变）", zorder=2)
ax.annotate(f"{kaifa_wan.loc[2016]:.1f}万", xy=(2016, kaifa_wan.loc[2016]),
            xytext=(-4, 8), textcoords="offset points", fontsize=8.3, ha="right",
            fontweight="bold")
ax.annotate(f"{kaifa_wan.loc[2025]:.1f}万", xy=(2025, kaifa_wan.loc[2025]),
            xytext=(4, -12), textcoords="offset points", fontsize=8.3, fontweight="bold")
ax.set_xlim(2015.5, 2025.7)
ax.set_ylim(0, 26)
ax.set_xticks(YEARS[::2])
ax.set_ylabel("万人")
panel_title(ax, "经开区：富联精密/富泰华", "CLW/媒体估计不覆盖经开区，故此处不放总用工对照",
            title_dy=0.18, sub_dy=0.06)
ax.legend(loc="upper right", fontsize=7.6, frameon=False)

# =====================================================================
# OPTIONAL THIRD PANEL - EIA design headcounts (航空港), kept apart from the
# insured stack; not summed
# =====================================================================
ax = ax_eia
yz_whole = eia[(eia["实体简称"] == "富联裕展/河南裕展") &
               (eia["定员口径"].str.contains("全厂", na=False))].copy()
yz_whole["date"] = pd.to_datetime(yz_whole["代表月份"])
yz_whole = yz_whole.sort_values("date")
# Colors here match the same entities' colors in the main-panel stack (C_FLYZ=orange
# for 富联裕展, C_HFJ=blue for 鸿富锦) so identity stays consistent across panels.
ax.step(yz_whole["date"], yz_whole["劳动定员（人）"] / WAN, where="post", color=C_FLYZ,
        linewidth=2.2, label="富联裕展全厂定员（阶梯）", zorder=3)
ax.scatter(yz_whole["date"], yz_whole["劳动定员（人）"] / WAN, color=C_FLYZ, s=32, zorder=4)
ax.annotate("自动化升级导致\n定员减少", xy=(yz_whole["date"].iloc[-1], yz_whole["劳动定员（人）"].iloc[-1] / WAN),
            xytext=(0.05, 0.62), textcoords="axes fraction", fontsize=7.6, color=PAL["ink2"],
            arrowprops=dict(arrowstyle="-", color=PAL["muted"], linewidth=0.8))

hfj_proj = eia[(eia["实体简称"] == "鸿富锦")].copy()
hfj_proj["date"] = pd.to_datetime(hfj_proj["代表月份"].astype(str), format="%Y", errors="coerce")
ax.scatter(hfj_proj["date"], hfj_proj["劳动定员（人）"] / WAN, color=C_HFJ, marker="^",
           s=40, zorder=4, label="鸿富锦：单项目定员（约数，不可加总）")

ax.set_ylim(0, 7)
ax.set_ylabel("核定劳动定员（万人）")
panel_title(ax, "EIA环评核定定员（航空港，示意）",
            "两条序列均为环保审批用工上限承诺，非实测在职人数；富联裕展为全厂口径阶梯，\n"
            "鸿富锦为各年独立项目定员，不构成同一序列",
            title_dy=0.20, sub_dy=0.065)
ax.legend(loc="upper right", fontsize=7.6, frameon=False)

wrap_note(fig, (
    "数据来源：企业年报社保信息（工伤保险口径，参保人数）；China Labor Watch 2019/2023/2025年报告与"
    "财新/新浪等新闻报道（总用工估计，含派遣与学生工，访谈/实地调查观察值，非全厂普查）；历次环评批复文件"
    "（劳动定员，审批口径用工上限承诺）。参保人数、CLW估计、环评定员三者定义、口径、采集时点均不同，"
    "不可直接相减或相加；图中\"未参保的派遣工/学生工\"缺口为推断性图示，不是逐项核算结果。"
    "河南富驰2020年报参保人数=1人（视为0并入航空港堆叠面积，见图内footnote），"
    "2017-2019年参保人数(约70-80人)与2021年跳升至10,626人（同期鸿富锦下降约2.47万人）均提示可能的壳公司"
    "或集团内部人员划转，未经证实。样本量小、季节波动大，年度间比较需谨慎。"
), y=-0.035)

fig.savefig(CHARTS / "A1_insured_workers_vs_total_workforce.png", dpi=300,
            bbox_inches="tight", facecolor=PAL["surface"])
plt.close(fig)
print("  chart -> A1_insured_workers_vs_total_workforce.png (300dpi, overwritten)")




