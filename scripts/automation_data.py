"""
Foxconn Zhengzhou automation data analysis.

Answers the research questions in 研究问题_自动化_Automation.md (E1-E6), using
自动化_环评设备定员产能面板与月度时间线_2010-2026.xlsx as the main data source and
自动化_环评文件检索记录_2010-2026.md (the EIA document retrieval log) for the
鸿富锦 2010-2017 capacity figures (E6) and as the source-document trail behind
the headcount-reduction quotes (E4). Reads existing files read-only; writes all
output (tidy tables, draft charts, memo) into ./automation_analysis_output/.
All chart captions and variable names are in English, per the research
questions doc's own output instruction.

Run (from project root): python3 scripts/automation_data.py
"""
import re
import textwrap
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

warnings.filterwarnings("ignore")

BASE = Path(__file__).resolve().parent.parent  # project root (scripts/ lives one level down)
OUT = BASE / "outputs" / "automation_analysis_output"
TABLES = OUT / "tables"
CHARTS = OUT / "charts"
for d in (TABLES, CHARTS):
    d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Chart style (same validated palette used throughout this project)
# ---------------------------------------------------------------------------
PAL = dict(
    surface="#fcfcfb", page="#f9f9f7", ink="#0b0b0b", ink2="#52514e",
    muted="#898781", grid="#e1e0d9", axis="#c3c2b7",
    blue="#2a78d6", orange="#eb6834", aqua="#1baf7a", yellow="#eda100",
    magenta="#e87ba4", green="#008300", violet="#4a3aa7", red="#e34948",
)
C_HFJ, C_FLP, C_YZ = PAL["blue"], PAL["orange"], PAL["aqua"]  # entity colors, consistent project-wide
C_AUTOMATION, C_CAPACITY = PAL["violet"], PAL["magenta"]       # E4 reason categories
C_BUILT, C_PLANNED = PAL["blue"], PAL["muted"]                 # E3 built vs. planned-only

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


def style_ax(ax, title=None, ylabel=None, xlabel=None):
    if title:
        ax.set_title(title, loc="left", pad=10, fontsize=11.5)
    if ylabel:
        ax.set_ylabel(ylabel, fontsize=9.3)
    if xlabel:
        ax.set_xlabel(xlabel, fontsize=9.3)
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


def save_table(df, name):
    df.to_csv(TABLES / name, index=False, encoding="utf-8-sig")
    print(f"  table -> {name}  ({len(df)} rows)")


print("=" * 70)
print("Loading source workbook (read-only)")
print("=" * 70)

F_AUTOMATION = BASE / "data" / "automation" / "自动化_环评设备定员产能面板与月度时间线_2010-2026.xlsx"
F_EIA_LOG = BASE / "data" / "automation" / "自动化_环评文件检索记录_2010-2026.md"

proj_panel = pd.read_excel(F_AUTOMATION, sheet_name="项目面板_自动化与用工")
monthly_panel = pd.read_excel(F_AUTOMATION, sheet_name="月度面板_自动化×用工×排放")
event_timeline = pd.read_excel(F_AUTOMATION, sheet_name="月度事件时间线")
yuzhan_series = pd.read_excel(F_AUTOMATION, sheet_name="富联裕展时间序列").iloc[:4]  # drop trailing note rows
futaihua_series = pd.read_excel(F_AUTOMATION, sheet_name="富泰华时间序列").iloc[:4]
equip_raw = pd.read_excel(F_AUTOMATION, sheet_name="设备清单_原始")
equip_summary = pd.read_excel(F_AUTOMATION, sheet_name="设备类别汇总")

eia_log_text = F_EIA_LOG.read_text(encoding="utf-8")

print("Loaded all source files.\n")

# =====================================================================
# E1. Headcount vs. machines over time (FII Yuzhan, A/C/D/E zones)
# =====================================================================
print("E1. Headcount vs. machines over time (FII Yuzhan)")

e1 = yuzhan_series.rename(columns={
    "年份": "year", "项目（A/C/D/E区精密机构件主线）": "project",
    "全厂劳动定员": "design_headcount", "年产量合计（万件，含外框和耳机小件）": "annual_output_10k_units",
    "CNC台数": "cnc_count", "机器人/机械手": "robot_count",
    "每名工人CNC台数": "cnc_per_worker", "每千名工人机器人数": "robots_per_1000_workers",
    "人均年产量（件）": "output_per_worker_units", "定员变化的原文说明": "stated_reason_zh",
}).copy()
e1["cnc_count"] = e1["cnc_count"].ffill()  # 2021 has no equipment table; carry the last known count forward for context only
save_table(e1, "E1_yuzhan_headcount_vs_machines.csv")

# --- Chart E1: headcount and CNC count shown as SEPARATE series (feedback:
# decompose before presenting the ratio - the ratio's rise is driven almost
# entirely by falling design headcount, not by rising CNC count).
fig, axes = plt.subplots(1, 3, figsize=(13.5, 4.6))
ax = axes[0]
ax.bar(e1["year"].astype(str), e1["design_headcount"], color=C_YZ, width=0.6)
for x, v in zip(e1["year"].astype(str), e1["design_headcount"]):
    ax.text(x, v + 800, f"{v:,.0f}", ha="center", fontsize=8)
style_ax(ax, title="Design headcount (falls)", ylabel="People")


# Extra pre-2020 reading: the 2020 project's own EIA states the plant's
# equipment count immediately BEFORE that project (its "改建前" baseline), not
# just after. This is not a separate calendar year (it's the same filing's
# own "before" snapshot), but it is a second REAL reading close to 2020, and
# it also stays flat - included so "CNC count doesn't grow" rests on 4 real
# readings, not 3.
PRE2020_CNC, PRE2020_ROBOT = 5479, 350

ax = axes[1]
cnc_vals = yuzhan_series["CNC台数"]  # keep the real gap at 2021 (no equipment table filed that year) visible here
ax.plot([2019.6], [PRE2020_CNC], color=C_YZ, marker="o", markersize=6, markerfacecolor="none",
        markeredgewidth=1.6, linestyle="none", zorder=2)
ax.plot([2019.6, 2020], [PRE2020_CNC, cnc_vals.iloc[0]], color=C_YZ, linewidth=1, linestyle=":", zorder=1)
ax.plot(e1["year"], cnc_vals, color=C_YZ, marker="o", markersize=6, linewidth=2, zorder=3)
ax.text(2019.6, PRE2020_CNC + 220, "pre-2020\nbaseline", ha="center", fontsize=7, color=PAL["ink2"])
ax.set_xlim(2019.3, 2023.4)
ax.set_ylim(0, 6000)
style_ax(ax, title="CNC count (stays flat)", ylabel="CNC units")

ax = axes[2]
pre2020_headcount = e1["design_headcount"].iloc[0]  # same headcount as 2020 (before/after is the same project's own filing)
pre2020_ratio = PRE2020_CNC / pre2020_headcount
pre2020_robot_ratio = 1000 * PRE2020_ROBOT / pre2020_headcount
ax.plot([2019.6], [pre2020_ratio], color=C_YZ, marker="s", markersize=6, markerfacecolor="none",
        markeredgewidth=1.6, linestyle="none", zorder=2)
ax.plot([2019.6, 2020], [pre2020_ratio, e1["cnc_per_worker"].iloc[0]], color=C_YZ, linewidth=1, linestyle=":", zorder=1)
ax.plot(e1["year"], e1["cnc_per_worker"], color=C_YZ, marker="s", markersize=6, linewidth=2,
        label="CNC per worker", zorder=3)
ax2_vals = e1["robots_per_1000_workers"]
ax.plot([2019.6, 2020], [pre2020_robot_ratio / 50, ax2_vals.iloc[0] / 50], color=PAL["ink2"], linewidth=1, linestyle=":", zorder=1)
ax.plot(e1["year"], ax2_vals / 50, color=PAL["ink2"], marker="^", markersize=6, linewidth=2,
        linestyle="--", label="Robots per 1,000 workers (÷50 to share this axis)", zorder=3)
ax.set_xlim(2019.3, 2023.4)
style_ax(ax, title="Resulting ratio (rises)", ylabel="CNC per design-headcount worker")
ax.legend(loc="upper left", fontsize=7.6, frameon=False)
fig.suptitle("FII Yuzhan (A/C/D/E zones): the CNC-per-worker ratio rises because headcount falls, not because CNC count rises",
             fontsize=12.5, fontweight="bold", x=0.01, ha="left")
savefig(fig, "E1_yuzhan_headcount_vs_cnc.png",
        note="All three panels share the same 2020/2022/2023 x-axis, plus one extra hollow-marker point labeled 'pre-2020 baseline' (2020's own EIA filing states the plant's equipment count immediately before that project too - 5,479 CNC / 350 robots, the same filing's own 'before' snapshot, not a separate calendar year - included because it is a second real reading near 2020 and it also stays flat). "
        "2021 has NO CNC/robot reading anywhere in this dataset (checked again against the raw 915-row equipment list: no 富联裕展/Yuzhan rows are dated 2021 - that project's filing genuinely did not include an equipment table) and is shown here as a true gap, not interpolated or carried forward - don't read the 2020-to-2022 segment as if 2021 sat on it. Design headcount = EIA-approved staffing figure for these zones (51,000 -> 30,000 -> 26,000 -> 11,614), not actual employment. "
        "CNC count stays in a ~4,500-5,500 band across every real reading (pre-2020 through 2023) - it does not grow. The rightmost panel's rising 'CNC per worker' and 'robots per 1,000 workers' ratios are therefore driven almost entirely by the shrinking denominator (design headcount), not by more machines being added - this chart should not be read as 'more automation happened,' but as 'fewer designed workers, same machines.'")

# =====================================================================
# E2. Output with a fixed workforce (FII Precision/Futaihua)
# =====================================================================
print("\nE2. Output with a fixed workforce (FII Precision)")

e2 = futaihua_series.rename(columns={
    "年份": "year", "产能_千件每日": "design_capacity_1k_units_per_day",
    "劳动定员": "design_headcount", "CNC台数": "cnc_count", "机器人/机械手": "robot_count",
    "每千件日产能所需人数": "design_headcount_per_1k_daily_capacity",
    "每名工人CNC台数": "cnc_per_design_headcount",
}).copy()
save_table(e2, "E2_futaihua_capacity_vs_fixed_headcount.csv")

fig, axes = plt.subplots(1, 3, figsize=(13.5, 4.6))
ax = axes[0]
ax.plot(e2["year"], e2["design_headcount"], color=C_FLP, marker="o", markersize=7, linewidth=2)
ax.set_ylim(0, 26000)
for x, v in zip(e2["year"], e2["design_headcount"]):
    ax.text(x, v + 800, f"{v:,.0f}", ha="center", fontsize=8)
style_ax(ax, title="Design headcount (flat)", ylabel="People")

ax = axes[1]
ax.plot(e2["year"], e2["design_capacity_1k_units_per_day"], color=C_FLP, marker="s",
        markersize=7, linewidth=2)
for x, v in zip(e2["year"], e2["design_capacity_1k_units_per_day"]):
    ax.text(x, v + 3, f"{v:.0f}k/day", ha="center", fontsize=8)
style_ax(ax, title="Design capacity (rises)", ylabel="1,000 units/day")

ax = axes[2]
ax.plot(e2["year"], e2["design_headcount_per_1k_daily_capacity"], color=C_FLP, marker="^",
        markersize=7, linewidth=2)
style_ax(ax, title="Design headcount per 1,000\nunits/day of design capacity (falls)", ylabel="People per 1,000 units/day")
fig.suptitle("FII Precision (Futaihua): design capacity rose while design headcount stayed at 23,000 (2017-2022)",
             fontsize=12.5, fontweight="bold", x=0.01, ha="left")
savefig(fig, "E2_futaihua_capacity_vs_headcount.png",
        note="Every figure here is an EIA planning value - design headcount and design capacity as stated in successive environmental-impact filings, not measured actual employment or actual output. Every filing for this plant states the same '23,000, no new hires' headcount commitment while design capacity rises from 70 to ~110 thousand units/day (2017-2022); the third panel is therefore a design-basis ratio, not a productivity or output-per-worker measurement, and should not be captioned as either. CNC count over the same years: 6,272 (2017) -> 4,540 (2021) -> 4,531 (2022) - like E1, it does not grow with capacity, so a similar 'per-CNC' ratio would be driven mostly by the capacity change, not by more machines (see E1_yuzhan CSV for the equivalent decomposition at the other plant).")

# =====================================================================
# E3. What machines were added? (915-row equipment list, by category)
# =====================================================================
print("\nE3. Equipment composition changes, by category")

# Spot-check the keyword-based category assignment before trusting robot counts
# as fact (feedback's explicit ask): a handful of rows describe a single line
# item that mixes two functions (e.g. "CNC | 机械手"), so CNC and robot counts
# can overlap slightly rather than being perfectly separable from the device
# name alone.
mixed_desc = equip_raw[equip_raw["设备"].str.contains(r"CNC.*机械手|机械手.*CNC", na=False, regex=True)]
print(f"  spot-check: {len(mixed_desc)} of {len(equip_raw)} device rows mention BOTH "
      "'CNC' and '机械手' in one description (category assignment for these is "
      "approximate, not a clean single-function count)")

# Built vs. planned-only: per 研究问题_自动化_Automation.md's caution, treat only
# rows explicitly marked built (已建成) or the 2017 pre-retrofit baseline as
# CONFIRMED; every other 状态说明 wording is planned/uncertain, kept as a
# separate series rather than summed in.
CONFIRMED_STATUS = {"已建成", "表中只有一列数量，是2017年技改前的现状"}
equip_raw["status_kind"] = np.where(equip_raw["状态说明"].isin(CONFIRMED_STATUS),
                                     "confirmed_built_or_baseline", "planned_or_unconfirmed")
status_by_project = (equip_raw.groupby(["实体", "年份", "项目"])["status_kind"]
                     .agg(lambda s: s.value_counts(normalize=True).idxmax()).reset_index()
                     .rename(columns={"status_kind": "majority_status"}))
save_table(status_by_project, "E3_project_status_majority.csv")

CATS = ["CNC/数控机床", "机器人/机械手", "自动化专用机", "检测设备", "人工工位/手工工具", "其他工艺设备"]
CAT_EN = {"CNC/数控机床": "CNC/machine tools", "机器人/机械手": "Robots/robotic arms",
          "自动化专用机": "Automation-specific machines", "检测设备": "Inspection equipment",
          "人工工位/手工工具": "Manual stations/hand tools", "其他工艺设备": "Other process equipment"}
CAT_SHORT = {"CNC/数控机床": "CNC", "机器人/机械手": "Robots", "自动化专用机": "Auto.\nmachines",
             "检测设备": "Inspection", "人工工位/手工工具": "Manual\nstations", "其他工艺设备": "Other"}
ENTITY_EN_E3 = {"富泰华/富联精密（郑州，经开区）": "FII Precision (Futaihua), Econ. Dev. Zone",
                "富联裕展（河南，航空港综保区）": "FII Yuzhan (Henan), Airport Zone bonded area"}
PROJECT_EN_E3 = {
    "高端手机机构件升级改造智能制造项目": "High-end structural-parts upgrade (smart mfg.)",
    "5G智能手机精密机构件生产项目": "5G precision structural-parts production",
    "手机机构件升级改造项目（技改前现状）": "Structural-parts upgrade (pre-retrofit baseline)",
    "5G高端智能AI手机精密机构件改造（一期）新增楼层": "5G AI structural-parts retrofit ph.1: new floors",
    "5G高端智能AI手机精密机构件改造（一期）改建楼层": "5G AI structural-parts retrofit ph.1: converted floors",
    "河南裕展 年产6000万件技改（B区）": "60M-units/yr retrofit (Zone B)",
    "河南裕展 机构件升级＋耳机小件技改（A/C/D/E区）": "Structural + earphone-part upgrade (Zones A/C/D/E)",
    "富联裕展 智能制造升级改造（A–E区）": "Smart manufacturing upgrade (Zones A-E)",
    "富联裕展 5G机构组件高端制造改造（B/C/E区）": "5G structural-component upgrade (Zones B/C/E)",
}
e3 = equip_summary.rename(columns={"实体": "entity", "年份": "year", "项目": "project"}).copy()
for c in CATS:
    e3 = e3.rename(columns={f"{c}_前": f"{CAT_EN[c]}__before", f"{c}_后": f"{CAT_EN[c]}__after"})
e3 = e3.merge(status_by_project.rename(columns={"实体": "entity", "年份": "year", "项目": "project"}),
              on=["entity", "year", "project"], how="left")
e3["entity_en"] = e3["entity"].map(ENTITY_EN_E3)
e3["project_en"] = e3["project"].map(PROJECT_EN_E3)
save_table(e3, "E3_equipment_category_summary.csv")

# --- Chart E3: before/after by category, faceted by project, built vs planned
# projects visually distinguished (alpha), never summed together.
fig, axes = plt.subplots(3, 3, figsize=(15, 12.5), sharey=False)
x = np.arange(len(CATS))
for ax, (_, r) in zip(axes.flat, e3.iterrows()):
    is_confirmed = r["majority_status"] == "confirmed_built_or_baseline"
    alpha = 0.9 if is_confirmed else 0.4
    before = [r[f"{CAT_EN[c]}__before"] for c in CATS]
    after = [r[f"{CAT_EN[c]}__after"] for c in CATS]
    ax.bar(x - 0.18, before, width=0.34, color=PAL["muted"], alpha=alpha, label="Before")
    ax.bar(x + 0.18, after, width=0.34, color=(C_BUILT if is_confirmed else C_PLANNED),
           alpha=alpha, label="After" + ("" if is_confirmed else " (planned)"))
    ax.set_xticks(x)
    ax.set_xticklabels([CAT_SHORT[c] for c in CATS], fontsize=7.2)
    title = f"{r['entity_en']}\n{r['year']} - {r['project_en']}"
    style_ax(ax, title=title)
    ax.title.set_fontsize(8.8)
    ax.legend(fontsize=6.6, frameon=False, loc="upper right")
fig.suptitle("Equipment counts before vs. after each project, by category (faded = planned/not confirmed built)",
             fontsize=13, fontweight="bold", x=0.01, ha="left", y=1.02)
savefig(fig, "E3_equipment_before_after_by_project.png",
        note=f"Categories are assigned from equipment names by keyword rule (see 'category rule' in the source workbook's notes sheet); {len(mixed_desc)} of {len(equip_raw)} raw device rows name both a CNC and a 机械手/robotic-arm function in one line, so CNC and robot counts are not perfectly clean - treat category totals, especially robot counts, as keyword-derived estimates, not an audited machine inventory. Faded panels are majority 'planned/unconfirmed' by their own 状态说明 field (e.g. '计划数，尚未建成') - these describe a filed plan, not confirmed installed equipment, and are never summed together with the solid (confirmed-built or 2017-baseline) panels. 'Before' and 'after' refer to each project's own stated before/after equipment tables, not a continuous timeline across projects.")

# =====================================================================
# E4. What reasons do companies give for reducing headcount?
# =====================================================================
print("\nE4. Stated reasons for headcount changes")

# Quotes pulled verbatim from 项目面板_自动化与用工's 定员口径/备注 columns (the EIA
# filings' own words), cross-referenced against the document trail in
# 自动化_环评文件检索记录_2010-2026.md (doc #2 = the 2026 FII Yuzhan filing; the
# 2010-2017 鸿富锦 history in that log's section B has no comparable headcount-
# change language - 鸿富锦's zone-by-zone figures there are new capacity, not
# reductions - so it contributes no quotes to this question).
E4_QUOTES = [
    dict(date="2019-06", entity="FII Precision (Futaihua)", project="真空浸胶自动化升级",
         headcount_before=np.nan, headcount_after=np.nan, reason_category="automation, headcount unchanged",
         quote_zh="对生产线中部分手工作业升级为自动化设备作业", quote_en="Part of the manual work on the line was upgraded to automated-equipment operation",
         source="项目面板_自动化与用工 row 4 (定员口径/备注)"),
    dict(date="2020-08", entity="FII Precision (Futaihua)", project="5G智能手机精密机构件生产项目",
         headcount_before=23000, headcount_after=23000, reason_category="automation, headcount unchanged",
         quote_zh="由于部分制程自动化升级，劳动定员不变", quote_en="Because part of the process was upgraded to automation, the design headcount is unchanged",
         source="项目面板_自动化与用工 row 5 (定员口径/备注)"),
    dict(date="2021-09", entity="FII Yuzhan (Henan)", project="高端手机机构件升级改造智能制造项目",
         headcount_before=51000, headcount_after=30000, reason_category="automation, headcount reduced",
         quote_zh="由于工艺进行自动化升级，劳动定员减少", quote_en="Because the process underwent automation upgrades, the design headcount was reduced",
         source="项目面板_自动化与用工 row 13 (定员口径/备注)"),
    dict(date="2022-05", entity="FII Yuzhan (Henan)", project="22X手机机构件及耳机小件制程智能升级改造项目",
         headcount_before=30000, headcount_after=26000, reason_category="capacity reduction (unrelated cause)",
         quote_zh="由于产能减少，劳动定员减少", quote_en="Because capacity was reduced, the design headcount was reduced",
         source="项目面板_自动化与用工 row 14 (定员口径/备注)"),
    dict(date="2023-05", entity="FII Yuzhan (Henan)", project="高端手机精密机构件智能制造升级改造项目",
         headcount_before=26000, headcount_after=11614, reason_category="automation, headcount reduced",
         quote_zh="由于工艺进行自动化升级，劳动定员由26000人减少至11614人", quote_en="Because the process underwent automation upgrades, the design headcount was reduced from 26,000 to 11,614",
         source="项目面板_自动化与用工 row 16 (定员口径/备注)"),
]
e4 = pd.DataFrame(E4_QUOTES)
save_table(e4, "E4_headcount_change_reasons_quotes.csv")
n_auto = (e4["reason_category"].str.contains("automation")).sum()
n_cap = (e4["reason_category"].str.contains("capacity")).sum()
print(f"  {n_auto} filings cite automation as the stated reason; {n_cap} cites capacity reduction instead")

# --- Chart E4: FII Yuzhan's headcount waterfall, each drop labeled by its
# OWN stated reason category (automation vs. capacity) - kept separate per
# the research question's explicit ask, not blended into one "automation"
# story.
yz_hc = e4[e4["entity"] == "FII Yuzhan (Henan)"].copy()
steps = [("2020-12\n(baseline)", 51000, None)] + list(
    zip(yz_hc["date"], yz_hc["headcount_after"], yz_hc["reason_category"]))
fig, ax = plt.subplots(figsize=(9.5, 5.2))
xs = range(len(steps))
vals = [s[1] for s in steps]
ax.plot(xs, vals, color=PAL["ink2"], linewidth=1.4, zorder=2)
for i, (label, val, reason) in enumerate(steps):
    col = PAL["ink2"] if reason is None else (C_AUTOMATION if "automation" in reason else C_CAPACITY)
    ax.scatter([i], [val], color=col, s=140, zorder=4, edgecolor=PAL["surface"], linewidth=1.5)
    ax.text(i, val + 1800, f"{val:,.0f}", ha="center", fontsize=9, fontweight="bold")
ax.set_xticks(list(xs))
ax.set_xticklabels([s[0] for s in steps], fontsize=8.6)
ax.scatter([], [], color=C_AUTOMATION, s=140, label="Stated reason: automation upgrade")
ax.scatter([], [], color=C_CAPACITY, s=140, label="Stated reason: capacity reduction (not automation)")
ax.scatter([], [], color=PAL["ink2"], s=140, label="Baseline (no reason stated)")
ax.legend(loc="upper right", fontsize=8.6, frameon=False)
style_ax(ax, title="FII Yuzhan design headcount: each drop labeled by its own filing's stated reason", ylabel="Design headcount (people)")
savefig(fig, "E4_headcount_reduction_reasons.png",
        note="Every point and its color come directly from that filing's own wording (see quotes and sources in E4_headcount_change_reasons_quotes.csv) - this is a documented-statement exercise, not our inference about causation. Three of the four drops are attributed by the filing itself to 'automation upgrade'; the 2022 drop (30,000 -> 26,000) is instead attributed to 'capacity reduction,' explicitly not automation - keeping these separate matters, since pooling them would overstate how much of the headcount decline these documents attribute to automation specifically.")

# =====================================================================
# E5. Timing: automation events vs. labor and emissions
# =====================================================================
print("\nE5. Automation-event timing vs. labor and emissions")

# Feedback: scale back ambition - too many separate legal entities to argue a
# cross-entity relationship. One overlay/timeline PER ENTITY, never pooled;
# illustrative only, no "automation correlates with X" summary claim.
mp = monthly_panel.rename(columns={"年月": "date"}).copy()
mp["date"] = pd.to_datetime(mp["date"])
save_table(mp.rename(columns={
    "当月自动化/用工事件": "event_note_zh", "富联裕展A–E区设计定员（按最近一次环评）": "yuzhan_design_headcount",
    "富泰华设计定员": "futaihua_design_headcount", "招工返费_最高（元）": "recruitment_rebate_max_rmb_sitewide",
    "小时工_最高时薪（元）": "hourly_wage_max_rmb_sitewide", "帖子数": "recruitment_posts_sitewide",
    "鸿富锦 COD（吨）": "hongfujin_cod_tonnes", "鸿富锦 VOCs（吨）": "hongfujin_vocs_tonnes",
    "富联精密 COD（吨）": "fii_precision_cod_tonnes", "富联精密 颗粒物（吨）": "fii_precision_particulates_tonnes",
}), "E5_monthly_panel_for_overlay.csv")

# events, split one series per entity (never pooled onto one shared list)
ev = event_timeline.rename(columns={"年月": "date_raw", "实体": "entity_zh", "事件类型": "event_type",
                                     "内容（自动化、用工、产能）": "content_zh"}).copy()
ev["date"] = pd.to_datetime(ev["date_raw"].astype(str), format="mixed", errors="coerce")
save_table(ev.drop(columns=["date_raw"]), "E5_event_timeline.csv")

# --- E5a: FII Precision/Futaihua - the one pairing where the design-headcount
# series and the emissions series genuinely belong to the SAME legal entity
# (Futaihua was renamed FII Precision; see the labor A1 redesign's entity notes).
fig, axes = plt.subplots(3, 1, figsize=(9.6, 8.4), sharex=True,
                          gridspec_kw=dict(height_ratios=[0.7, 1, 1], hspace=0.3))
sub = mp[mp["date"] >= "2019-01-01"]
ax = axes[0]
ax.step(sub["date"], sub["富泰华设计定员"], where="post", color=C_FLP, linewidth=2)
style_ax(ax, title="FII Precision / Futaihua (Economic Development Zone): one entity, illustrative timeline only",
         ylabel="Design headcount")
ax = axes[1]
ax.plot(sub["date"], sub["招工返费_最高（元）"], color=PAL["red"], linewidth=1.6, marker="o", markersize=3,
        label="Recruitment rebate, monthly max (RMB) - site-wide, not entity-specific")
style_ax(ax, ylabel="RMB")
ax.legend(loc="upper left", fontsize=7.6, frameon=False)
ax = axes[2]
ax.plot(sub["date"], sub["富联精密 COD（吨）"], color=C_FLP, linewidth=1.6, marker="o", markersize=3,
        label="FII Precision monthly COD (tonnes)")
style_ax(ax, ylabel="Tonnes", xlabel="Year-month")
ax.legend(loc="upper left", fontsize=7.6, frameon=False)
for e in event_timeline[event_timeline["实体"].isin(["富泰华"])].itertuples():
    d = pd.to_datetime(str(e.年月), format="mixed", errors="coerce")
    if pd.notna(d) and d >= pd.Timestamp("2019-01-01"):
        for a in axes:
            a.axvline(d, color=PAL["muted"], linewidth=0.8, linestyle="--", zorder=1)
savefig(fig, "E5a_futaihua_timing_overlay.png",
        note="One entity only (FII Precision/Futaihua) - design headcount and COD both belong to this same legal entity across its renaming, so this pairing is legitimate; the recruitment-rebate series is site-wide (not attributable to one legal entity) and is labeled as such. Dashed vertical lines mark this entity's own automation/construction events from the monthly event timeline. This is an illustrative overlay only: there are few events and many confounders (iPhone product cycles, COVID, tariffs, self-reported monthly data) - it shows what happened side by side in time, and does not claim any of these series caused the others to move.")

# --- E5b: FII Yuzhan - no entity-specific emissions series exists for this
# entity in the source data (the monthly panel's emissions columns are
# 鸿富锦/富联精密, a different legal entity chain) - so it is not force-paired
# with mismatched emissions; only its own headcount and site-wide recruitment
# pricing are shown.
fig, axes = plt.subplots(2, 1, figsize=(9.6, 6.0), sharex=True,
                          gridspec_kw=dict(height_ratios=[0.8, 1], hspace=0.3))
sub2 = mp[mp["date"] >= "2020-01-01"]
ax = axes[0]
ax.step(sub2["date"], sub2["富联裕展A–E区设计定员（按最近一次环评）"], where="post", color=C_YZ, linewidth=2)
style_ax(ax, title="FII Yuzhan (Airport Zone): one entity, illustrative timeline only - no matching entity-specific emissions series exists in the source data",
         ylabel="Design headcount")
ax = axes[1]
ax.plot(sub2["date"], sub2["小时工_最高时薪（元）"], color=PAL["aqua"], linewidth=1.6, marker="o", markersize=3,
        label="Hourly-worker rate, monthly max (RMB/hr) - site-wide, not entity-specific")
style_ax(ax, ylabel="RMB/hr", xlabel="Year-month")
ax.legend(loc="upper left", fontsize=7.6, frameon=False)
for e in event_timeline[event_timeline["实体"].str.contains("裕展", na=False)].itertuples():
    d = pd.to_datetime(str(e.年月), format="mixed", errors="coerce")
    if pd.notna(d) and d >= pd.Timestamp("2020-01-01"):
        for a in axes:
            a.axvline(d, color=PAL["muted"], linewidth=0.8, linestyle="--", zorder=1)
savefig(fig, "E5b_yuzhan_timing_overlay.png",
        note="One entity only (FII Yuzhan) - its design headcount steps down at its own filed events (dashed lines). No monthly emissions series specific to FII Yuzhan exists in this dataset (the monthly emissions panel covers Hongfujin and FII Precision, a different legal-entity chain), so no emissions panel is force-paired here; the recruitment-pricing series shown is site-wide, not entity-specific, and is labeled as such. Illustrative overlay only, not a causal claim - see the E5a note for the same caveats (few events, many confounders, self-reported data).")

# =====================================================================
# E6. Baseline: labor intensity of the early assembly era (Hongfujin, 2010-2017)
# =====================================================================
print("\nE6. Baseline labor intensity, Hongfujin 2010-2017")

# Design headcount per project: from the main workbook's project panel.
# Zone labels translated to English (e.g. "K区" -> "Zone K") - both to satisfy
# this analysis's "all captions in English" output rule and because the
# CJK character 区 does not render in xtick labels with the fonts available here.
ZONE_EN = {"K区": "Zone K", "F区": "Zone F", "C区": "Zone C", "L区": "Zone L",
           "D区": "Zone D", "B/E区": "Zone B/E", "G区": "Zone G"}
hfj_hc = proj_panel[proj_panel["实体"] == "鸿富锦精密电子（郑州）"][["厂区", "环评年份", "劳动定员（人）"]].copy()
hfj_hc = hfj_hc.rename(columns={"厂区": "zone_zh", "环评年份": "year", "劳动定员（人）": "design_headcount"})
hfj_hc["zone"] = hfj_hc["zone_zh"].map(ZONE_EN)

# Approved nameplate capacity per project: verbatim from the EIA document
# retrieval log's section B table (自动化_环评文件检索记录_2010-2026.md), which is
# the only place these per-zone capacity figures were recorded (the main
# workbook's project panel does not carry a capacity figure for these seven
# 2010-2017 assembly projects). The D-zone figure is flagged by the log itself
# as containing a source typo ("10900万万件") - kept, but flagged, not corrected.
E6_CAPACITY = {  # zone (English label) -> (capacity_10k_units_per_year, capacity_flag)
    "Zone K": (2450, ""), "Zone F": (1950, ""), "Zone C": (3050, ""), "Zone L": (1950, ""),
    "Zone D": (10900, "source has a typo (\"10900万万件\"); treat this capacity figure as unreliable"),
    "Zone B/E": (3050, ""), "Zone G": (800, ""),
}
hfj_hc["design_capacity_10k_units_per_year"] = hfj_hc["zone"].map(lambda z: E6_CAPACITY[z][0])
hfj_hc["capacity_flag"] = hfj_hc["zone"].map(lambda z: E6_CAPACITY[z][1])
hfj_hc["headcount_per_10k_units_capacity"] = (
    hfj_hc["design_headcount"] / hfj_hc["design_capacity_10k_units_per_year"])
hfj_hc["source"] = "capacity: 自动化_环评文件检索记录_2010-2026.md section B; headcount: 项目面板_自动化与用工"
save_table(hfj_hc, "E6_hongfujin_baseline_labor_intensity.csv")

fig, axes = plt.subplots(1, 2, figsize=(11.5, 4.8))
zones_order = hfj_hc.sort_values("year")["zone"]
ax = axes[0]
colors = [C_HFJ if not f else PAL["muted"] for f in hfj_hc.sort_values("year")["capacity_flag"]]
bars = ax.bar(zones_order, hfj_hc.sort_values("year")["headcount_per_10k_units_capacity"], color=colors)
for b, r in zip(bars, hfj_hc.sort_values("year").itertuples()):
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.6, f"{r.headcount_per_10k_units_capacity:.1f}",
            ha="center", fontsize=8.5)
style_ax(ax, title="Design headcount per 10,000 units/yr of design capacity, by zone",
         ylabel="People per 10k units/yr", xlabel="Zone (in EIA approval order, 2010-2017)")
ax.text(0.02, 0.95, "grey = D-zone capacity has a flagged source typo, ratio unreliable",
        transform=ax.transAxes, fontsize=7.6, color=PAL["ink2"], va="top")

ax = axes[1]
hc_sorted = hfj_hc.sort_values("year")
ax.bar(zones_order, hc_sorted["design_headcount"], color=C_HFJ, alpha=0.85)
style_ax(ax, title="Design headcount, by zone (for reference)", ylabel="People")
fig.suptitle("Hongfujin's early assembly era: labor intensity varied a great deal by zone even before any automation upgrade was filed",
             fontsize=12.5, fontweight="bold", x=0.01, ha="left")
savefig(fig, "E6_hongfujin_baseline_labor_intensity.png",
        note="Design headcount is each zone's approved EIA staffing figure (an approximate round number in the source, e.g. 'about 60,000 people'), not measured actual employment; design capacity is each zone's approved nameplate output (10,000 handsets/year), recorded only in the EIA document retrieval log, not the main workbook. This is a purely descriptive baseline for the pre-automation era (no automation-upgrade language appears in any of these seven 2010-2017 filings) - it establishes what labor intensity looked like before the automation-era projects in E1-E4, for comparison. The D-zone (2013) capacity figure contains a source typo and its ratio (2.8) is flagged unreliable rather than corrected or dropped silently.")
