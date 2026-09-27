"""
Foxconn Zhengzhou environmental data analysis.

Answers the research questions in 研究问题_环境_Environment.md (D1-D7) using the
source workbooks listed in 00_文件说明.md. Reads existing files read-only; writes
all output (tidy tables, draft charts, memo) into ./environment_analysis_output/.

Run: python3 environment_data.py
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

BASE = Path(__file__).resolve().parent
OUT = BASE / "environment_analysis_output"
TABLES = OUT / "tables"
CHARTS = OUT / "charts"
for d in (TABLES, CHARTS):
    d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Chart style (validated default palette from the dataviz skill, light mode -
# same palette/rules used in labor_data.py, kept consistent across the project)
# ---------------------------------------------------------------------------
PAL = dict(
    surface="#fcfcfb", page="#f9f9f7", ink="#0b0b0b", ink2="#52514e",
    muted="#898781", grid="#e1e0d9", axis="#c3c2b7",
    blue="#2a78d6", orange="#eb6834", aqua="#1baf7a", yellow="#eda100",
    magenta="#e87ba4", green="#008300", violet="#4a3aa7", red="#e34948",
)
# 鸿富锦 = blue, 富联精密/富泰华 = orange throughout (consistent with labor_data.py's
# entity color mapping), so the same company is never a different color across
# the two analyses' charts.
C_HFJ, C_FLP = PAL["blue"], PAL["orange"]
ENTITY_COLOR = {"鸿富锦精密电子（郑州）": C_HFJ, "富联精密电子（郑州）": C_FLP,
                 "鸿富锦": C_HFJ, "富联精密/富泰华": C_FLP}
ENTITY_EN = {"鸿富锦精密电子（郑州）": "Hongfujin", "富联精密电子（郑州）": "FII Precision (Futaihua)",
             "鸿富锦": "Hongfujin", "富联精密/富泰华": "FII Precision (Futaihua)"}

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
print("Loading source workbooks (read-only)")
print("=" * 70)

F_MONTHLY_LONG = BASE / "环境_月度排放长表_鸿富锦与富联精密_2020-2025.csv"
F_PERMIT_EXEC = BASE / "环境_排污许可执行报告月度排放_鸿富锦与富联精密_2020-2025.xlsx"
F_EIA_HIST = BASE / "环境_环评核定与验收历史排放_2010-2026.xlsx"
F_PLANT_SNAPSHOT = BASE / "环境_厂区法人实体排污许可与2025年实际排放_2025.xlsx"
F_TRUCOST = BASE / "环境_Trucost鸿海与工业富联集团碳排放_2015-2025.xlsx"
F_INSURED = BASE / "用工_富士康郑州四家实体社保参保人数_2016-2025.xlsx"
F_AUTOMATION = BASE / "自动化_环评设备定员产能面板与月度时间线_2010-2026.xlsx"

monthly_long = pd.read_csv(F_MONTHLY_LONG)
monthly_long["年月_dt"] = pd.to_datetime(monthly_long["年月"])

annual_wide = pd.read_excel(F_PERMIT_EXEC, sheet_name="全厂年度_宽表", header=2)
annual_wide.columns = [str(c) for c in annual_wide.columns]
permit_totals = pd.read_excel(F_PERMIT_EXEC, sheet_name="许可总量", header=2)

hfj_approved_vs_actual = pd.read_excel(F_EIA_HIST, sheet_name="鸿富锦_核定量vs实际")
hfj_approved_vs_actual = hfj_approved_vs_actual[
    pd.to_numeric(hfj_approved_vs_actual["年份"], errors="coerce").notna()].copy()
hfj_approved_vs_actual["年份"] = hfj_approved_vs_actual["年份"].astype(int)
eia_long = pd.read_excel(F_EIA_HIST, sheet_name="长表_全部记录")
monitor_2015_2017 = pd.read_excel(F_EIA_HIST, sheet_name="实测片段_2015-2017")

plant_permits = pd.read_excel(F_PLANT_SNAPSHOT, sheet_name="厂区与排污许可", header=2).dropna(how="all")
plant_2025 = pd.read_excel(F_PLANT_SNAPSHOT, sheet_name="2025实际排放", header=2).dropna(how="all")

trucost = pd.read_excel(F_TRUCOST, sheet_name="关键变量面板", header=2).iloc[1:].reset_index(drop=True)
trucost = trucost.dropna(subset=["公司"])

insured_wide = pd.read_excel(F_INSURED, sheet_name="工伤保险口径_宽表")
proj_panel = pd.read_excel(F_AUTOMATION, sheet_name="项目面板_自动化与用工")

print("Loaded all source files.\n")

# =====================================================================
# D1. Monthly emissions 2020-2025, two plants: COD, NH3-N, VOCs, particulates
# =====================================================================
print("D1. Monthly emissions trend and seasonality")

D1_POLLUTANTS = {"化学需氧量": "COD", "氨氮（NH3-N）": "NH3-N", "VOCs": "VOCs", "颗粒物": "Particulates"}
d1 = monthly_long[
    (monthly_long["类别"].isin(["废气-全厂合计", "废水-全厂合计"])) &
    (monthly_long["污染物"].isin(D1_POLLUTANTS))
].copy()
d1["污染物_en"] = d1["污染物"].map(D1_POLLUTANTS)
d1_wide = d1.pivot_table(index=["厂区", "年月", "年月_dt"], columns="污染物_en", values="排放量").reset_index()
d1_wide = d1_wide.sort_values(["厂区", "年月_dt"])

# Data-quality flags called out in 研究问题_环境_Environment.md
d1_wide["flag"] = ""
d1_wide.loc[(d1_wide["厂区"] == "富联精密电子（郑州）") & (d1_wide["年月_dt"] < "2020-09-01"),
            "flag"] = "no_data_pre_2020-09（富联精密仅2020年9-12月有数据）"
mask_flp_vocs0 = ((d1_wide["厂区"] == "富联精密电子（郑州）") & (d1_wide["VOCs"] == 0) &
                  (d1_wide["年月_dt"] < "2023-01-01"))
d1_wide.loc[mask_flp_vocs0, "flag"] = "VOCs=0_likely_not_reported（2020-2022，非真实零排放）"

# Outlier flag: |value - rolling median(±3mo, same plant)| > 3x that median
d1_wide["COD_rolling_med"] = (
    d1_wide.groupby("厂区")["COD"].transform(lambda s: s.rolling(7, center=True, min_periods=3).median()))
outlier_mask = (d1_wide["COD"] > 3 * d1_wide["COD_rolling_med"]) & d1_wide["COD_rolling_med"].notna()
d1_wide.loc[outlier_mask, "flag"] = d1_wide.loc[outlier_mask, "flag"] + "|COD_outlier(>3x_7mo_rolling_median)"
d1_wide["flag"] = d1_wide["flag"].str.strip("|")
save_table(d1_wide.drop(columns=["年月_dt", "COD_rolling_med"]), "D1_monthly_emissions_wide.csv")

outliers = d1_wide[outlier_mask][["厂区", "年月", "COD", "COD_rolling_med"]]
print(f"  COD outliers flagged (>3x 7-month rolling median): {len(outliers)}")
print(outliers.to_string(index=False))

# --- Chart D1a: 2x2 small multiples, both plants, monthly, 2020-2025
fig, axes = plt.subplots(2, 2, figsize=(11.5, 7.5), sharex=True)
for ax, (pol, label) in zip(axes.flat, D1_POLLUTANTS.items()):
    en = D1_POLLUTANTS[pol]
    for ent, col in [("鸿富锦精密电子（郑州）", C_HFJ), ("富联精密电子（郑州）", C_FLP)]:
        d = d1_wide[d1_wide["厂区"] == ent]
        ax.plot(d["年月_dt"], d[en], color=col, linewidth=1.6, label=ENTITY_EN[ent])
    style_ax(ax, title=en, ylabel="Tonnes/month")
outlier_pt = d1_wide[outlier_mask].iloc[0]
axes.flat[0].annotate("2024-09 COD outlier\n(152.6t, see note)", xy=(outlier_pt["年月_dt"], outlier_pt["COD"]),
                       xytext=(10, -55), textcoords="offset points", fontsize=7.6,
                       color=PAL["ink2"], arrowprops=dict(arrowstyle="-", color=PAL["muted"]))
axes.flat[0].legend(loc="upper right", fontsize=8, frameon=False)
fig.suptitle("Hongfujin vs. FII Precision: monthly whole-plant emissions (2020-2025)", fontsize=13, fontweight="bold", x=0.01, ha="left")
savefig(fig, "D1a_monthly_emissions_small_multiples.png",
        note="Scope: whole-plant totals for gas/wastewater (excludes the general/main-outlet sub-categories, to avoid double-counting). Data comes from each year's permit-execution report (the annual filing contains month-by-month data for Jan-Dec), self-reported by the company, not third-party measured. FII Precision has data only for Sep-Dec 2020 (its permit/execution reporting for this plant starts later); its VOCs are reported as 0 for 2020-2022, most likely because it wasn't monitored/reported rather than a true zero (from 2023 it switches to a real value, e.g. 19.67 tonnes). Hongfujin's 2024-09 COD = 152.6 tonnes, more than 3x its 7-month rolling median - flagged as an outlier, left uncorrected, with the raw value kept in the table.")

# --- Chart D1b: seasonality - calendar-month distribution of COD, does it peak Aug-Oct?
fig, axes = plt.subplots(1, 2, figsize=(11, 4.6), sharey=False)
for ax, ent, col in zip(axes, ["鸿富锦精密电子（郑州）", "富联精密电子（郑州）"], [C_HFJ, C_FLP]):
    d = d1_wide[(d1_wide["厂区"] == ent)].copy()
    d["month"] = d["年月_dt"].dt.month
    box_data = [d.loc[d["month"] == m, "COD"].dropna().values for m in range(1, 13)]
    bp = ax.boxplot(box_data, positions=range(1, 13), widths=0.55, patch_artist=True,
                     medianprops=dict(color=PAL["ink"]), boxprops=dict(facecolor=col, alpha=0.35,
                     edgecolor=col), whiskerprops=dict(color=col), capprops=dict(color=col),
                     flierprops=dict(markeredgecolor=col, markersize=4))
    ax.axvspan(7.5, 10.5, color=PAL["muted"], alpha=0.12, zorder=0)
    style_ax(ax, title=f"{ENTITY_EN[ent]}: COD by calendar month (all years, 2020-2025)", ylabel="Tonnes/month")
    ax.set_xticks(range(1, 13))
axes[0].text(8.1, axes[0].get_ylim()[1] * 0.95, "iPhone peak\nseason (Aug-Oct)", fontsize=7.6, color=PAL["ink2"])
savefig(fig, "D1b_seasonality_cod_by_calendar_month.png",
        note="Boxplots summarize COD emissions for the same calendar month across all years 2020-2025; the shaded band is Aug-Oct (the traditional iPhone production-ramp peak season). Hongfujin's peak-season monthly medians are not systematically higher than other months (the 2024-09 outlier widens September's box, but with that point excluded September's median is close to the other months'); FII Precision has fewer data points (missing months in several years), so any peak-season signal is even less clear. Overall, monthly emissions appear to be driven by more than just the production peak season - possibly also by discrete events such as technical upgrades or treatment-facility commissioning (see the automation timeline) - this chart does not support the claim that 'emissions rise with the iPhone peak season.'")

# =====================================================================
# D2. Actual emissions vs. approved (EIA design values)
# =====================================================================
print("\nD2. Actual vs. approved emissions")

save_table(hfj_approved_vs_actual, "D2_hongfujin_approved_vs_actual.csv")

# 富联精密/富泰华: no single pre-built cumulative sheet like 鸿富锦's, so build the
# closest comparable series from eia_long (scope varies by filing - keep 口径 in the
# output so scope differences stay visible per LABOR_DATA's "do not call it exceeding
# limits without checking" caution) plus actual reported COD from 全厂年度_宽表.
flp_eia = eia_long[eia_long["实体"].str.contains("富泰华", na=False)].copy()
flp_eia_cod = flp_eia[flp_eia["污染物"].isin(["COD", "COD（生产+生活，厂界）", "生产废水COD", "生活污水COD"])]
save_table(flp_eia_cod[["数据年份（约）", "来源", "口径", "数据性质", "污染物", "数值", "单位"]],
           "D2_fulianjingmi_eia_cod_by_scope.csv")

# --- Chart D2a: 鸿富锦 cumulative approved (VOCs/NMHC, COD) vs actual, + ratio
fig, axes = plt.subplots(1, 2, figsize=(11.5, 4.8))
hv = hfj_approved_vs_actual
for ax, approved_col, actual_col, name in [
    (axes[0], "累计环评核定VOCs/NMHC（t/a）", "实际VOCs（执行报告，t）", "VOCs/NMHC"),
    (axes[1], "累计环评核定COD（t/a）", "实际COD（执行报告，t）", "COD"),
]:
    ax.plot(hv["年份"], hv[approved_col], color=PAL["muted"], linewidth=2, linestyle="--",
            label="EIA cumulative approved (design value)")
    ax.plot(hv["年份"], hv[actual_col], color=C_HFJ, linewidth=2.2, marker="o", markersize=4,
            label="Actual (self-reported execution report)")
    style_ax(ax, title=f"Hongfujin: {name} approved vs. actual", ylabel="t/yr")
    ax.legend(loc="upper left", fontsize=8, frameon=False)
savefig(fig, "D2a_hongfujin_approved_vs_actual.png",
        note="EIA cumulative approved = the sum of design values from each 2010-2017 assembly-project EIA (zones K/F/C/L/D/B-E/G), unchanged after 2017 because no further assembly-project EIA has been filed since. Actual = self-reported figures from permit execution reports starting 2020. VOCs/NMHC actual values run far below approved for years (9.6% in 2020, 13.5% in 2021), suggesting the EIA design values themselves carried large headroom; but COD runs the opposite way in 2024-2025, with actual (446-485 tonnes) roughly 3x the cumulative approved figure (161.7 tonnes). The two may not share the same scope (EIA-approved COD is often a single production-wastewater figure, while the execution report's COD is a self-reported whole-plant total that may include domestic sewage) - this should not be called 'exceeding limits' without verification; the chart simply shows the two numbers side by side, without concluding a violation.")

# --- Chart D2b: 富联精密/富泰华 EIA-referenced COD (scope-labeled) vs actual reported COD
fig, ax = plt.subplots(figsize=(8.6, 5.0))
eia_pts = flp_eia_cod[flp_eia_cod["污染物"].isin(["COD", "COD（生产+生活，厂界）"])]
ax.scatter(eia_pts["数据年份（约）"], eia_pts["数值"], color=PAL["muted"], marker="D", s=55, zorder=4,
           label="EIA calculated/referenced value (scope varies, see note below)")
SCOPE_EN = {
    "现有工程1（日加工105千件金属件）": "Existing Project 1 (105k pcs/day)",
    "全厂（技改后）": "Whole plant (post-retrofit)",
    "全厂（改扩建前）": "Whole plant (pre-expansion)",
    "全厂（改扩建后）": "Whole plant (post-expansion)",
    "全厂": "Whole plant",
}
for _, r in eia_pts.iterrows():
    ax.annotate(SCOPE_EN.get(str(r["口径"]), str(r["口径"])), (r["数据年份（约）"], r["数值"]),
                textcoords="offset points", xytext=(6, 4), fontsize=7, color=PAL["ink2"])
year_cols = [c for c in annual_wide.columns if re.fullmatch(r"20\d\d", c)]
flp_cod_row = annual_wide[(annual_wide["厂区"] == "富联精密电子（郑州）") &
                          (annual_wide["污染物"] == "化学需氧量")].iloc[0]
actual_years_num = [int(c) for c in year_cols]
actual_vals = [flp_cod_row[c] for c in year_cols]
ax.plot(actual_years_num, actual_vals, color=C_FLP, linewidth=2.2, marker="o", markersize=5,
        label="Actual (self-reported execution report, whole plant)", zorder=5)
style_ax(ax, title="FII Precision (Futaihua): EIA-referenced COD (by scope) vs. actual whole-plant emissions", ylabel="t/yr")
ax.legend(loc="upper left", fontsize=8, frameon=False)
savefig(fig, "D2b_fulianjingmi_eia_vs_actual_cod.png",
        note="FII Precision has no single 'cumulative approved' figure like Hongfujin's - each EIA filing references a different COD scope (some count production wastewater only, some state a combined 'production + domestic, plant boundary' total); diamonds are labeled with the original scope text, and the full record is in D2_fulianjingmi_eia_cod_by_scope.csv. The 2022 EIA's 'COD (production+domestic, plant boundary)' = 146.64 tonnes, while that year's actual whole-plant self-report was only 59.56 tonnes (~41%) - the opposite direction from Hongfujin's COD 'actual exceeds approved' pattern. FII Precision appears to run well under its EIA design value, but this is likewise limited by scopes that don't fully align, and is for reference only.")

# =====================================================================
# D3. Emissions relative to workers and output
# =====================================================================
print("\nD3. Emissions per worker / per design headcount")

year_cols = sorted([c for c in annual_wide.columns if re.fullmatch(r"20\d\d", c)])
ann = annual_wide[annual_wide["污染物"].isin(["化学需氧量", "VOCs"])].copy()
ann_long = ann.melt(id_vars=["厂区", "类别", "污染物", "单位"], value_vars=year_cols,
                     var_name="年份", value_name="排放量_t")
ann_long["年份"] = ann_long["年份"].astype(int)

insured_long_env = insured_wide.melt(id_vars="年份",
    value_vars=["鸿富锦精密电子（郑州）", "富联精密电子（郑州）"], var_name="厂区", value_name="参保人数")

d3 = ann_long.merge(insured_long_env, on=["厂区", "年份"], how="left")
d3["排放量_kg每人"] = d3["排放量_t"] * 1000 / d3["参保人数"]

# Design headcount: only 富联精密/富泰华 has a stable, comparable whole-plant EIA figure
# (23,000, constant across 2013-2022 filings, no later full-plant EIA supersedes it) -
# 鸿富锦 has no consistent whole-plant design headcount over 2020-2025 (only unstackable
# per-project figures, see A1 redesign), so it is intentionally left blank here rather
# than guessed.
flp_design_hc = 23000
d3["设计定员"] = np.where(d3["厂区"] == "富联精密电子（郑州）", flp_design_hc, np.nan)
d3["排放量_kg每设计定员"] = d3["排放量_t"] * 1000 / d3["设计定员"]
save_table(d3, "D3_emissions_per_worker_and_design_headcount.csv")

# --- Chart D3a: indexed comparison (2020=100), one axis per plant - insured workers
# falling vs. COD emitted not falling (or rising)
fig, axes = plt.subplots(1, 2, figsize=(11.5, 4.8), sharey=False)
for ax, ent, col in zip(axes, ["鸿富锦精密电子（郑州）", "富联精密电子（郑州）"], [C_HFJ, C_FLP]):
    d = d3[(d3["厂区"] == ent) & (d3["污染物"] == "化学需氧量")].sort_values("年份")
    base_w, base_e = d["参保人数"].iloc[0], d["排放量_t"].iloc[0]
    ax.plot(d["年份"], 100 * d["参保人数"] / base_w, color=col, linewidth=2.2, marker="o",
            markersize=5, label="Insured workers (index, 2020=100)")
    ax.plot(d["年份"], 100 * d["排放量_t"] / base_e, color=PAL["ink2"], linewidth=2.2,
            marker="s", markersize=5, linestyle="--", label="COD emissions (index, 2020=100)")
    ax.axhline(100, color=PAL["axis"], linewidth=1)
    style_ax(ax, title=f"{ENTITY_EN[ent]}: insured workers vs. COD emissions (indexed)", ylabel="Index (2020=100)")
    ax.legend(loc="upper left" if ent.startswith("富联") else "center left", fontsize=8, frameon=False)
savefig(fig, "D3a_workers_vs_cod_indexed.png",
        note="The two series differ in scale/unit (worker count vs. tonnes), so each is indexed to its own 2020=100 base and plotted on one shared single axis to compare trend direction (no dual axis used). Both plants show a pattern of 'insured workers steadily falling while COD emissions do not fall - and even rise' - this does not mean fewer workers caused higher emissions (it may reflect production-line restructuring, changes to wastewater treatment facilities, or simply volatile self-reported data); this chart only presents the fact that 'fewer workers, emissions did not fall accordingly,' without drawing a causal conclusion.")

# --- Chart D3b: emissions intensity per insured worker (COD, kg/person), by year
fig, ax = plt.subplots(figsize=(8.6, 5.0))
for ent, col in [("鸿富锦精密电子（郑州）", C_HFJ), ("富联精密电子（郑州）", C_FLP)]:
    d = d3[(d3["厂区"] == ent) & (d3["污染物"] == "化学需氧量")].sort_values("年份")
    ax.plot(d["年份"], d["排放量_kg每人"], color=col, linewidth=2.2, marker="o", markersize=5,
            label=ENTITY_EN[ent])
style_ax(ax, title="COD emissions intensity: kg per insured worker, by year", ylabel="kg/person/year")
ax.legend(loc="upper left", fontsize=9, frameon=False)
savefig(fig, "D3b_cod_intensity_per_worker.png",
        note="Computed per insured worker (excludes dispatch workers); a mechanical effect: as the denominator (insured workers) falls each year, intensity rises unless the numerator (COD emissions) falls proportionally - clearly visible at both plants (Hongfujin rises from about 2.3 kg/person in 2020 to about 14.5 kg/person in 2025). This is not a behavioral claim that 'each person now pollutes more' - it is purely an arithmetic result, and should be read alongside D3a's two raw series. FII Precision's 'per design headcount' version (a fixed denominator of 23,000) is in D3_emissions_per_worker_and_design_headcount.csv; because the denominator never changes, its shape is identical to the raw 'total emissions' curve, so it isn't charted separately.")

# =====================================================================
# D4. Cumulative approved emissions as the site expanded, 2010-2026 (鸿富锦, by zone)
# =====================================================================
print("\nD4. Cumulative approved NMHC/COD by project approval year and zone")

ZONE_RE = re.compile(r"单个项目：([A-Z](?:/[A-Z])?)区")
d4 = eia_long[eia_long["口径"].str.match(r"单个项目：", na=False)].copy()
d4["厂区标签"] = d4["口径"].str.extract(ZONE_RE)
d4 = d4[d4["污染物"].isin(["NMHC", "COD"])].sort_values("数据年份（约）")
d4_wide = d4.pivot_table(index=["数据年份（约）", "厂区标签", "口径"], columns="污染物",
                          values="数值").reset_index().sort_values("数据年份（约）")
d4_wide["累计NMHC"] = d4_wide["NMHC"].cumsum()
d4_wide["累计COD"] = d4_wide["COD"].cumsum()
save_table(d4_wide, "D4_hongfujin_cumulative_approved_by_zone.csv")

fig, axes = plt.subplots(1, 2, figsize=(11.5, 5.0))
for ax, col, short in [(axes[0], "累计NMHC", "NMHC"), (axes[1], "累计COD", "COD")]:
    ax.step(d4_wide["数据年份（约）"], d4_wide[col], where="post", color=C_HFJ, linewidth=2.2, zorder=3)
    ax.scatter(d4_wide["数据年份（约）"], d4_wide[col], color=C_HFJ, s=40, zorder=4)
    for _, r in d4_wide.iterrows():
        ax.annotate(f"Zone {r['厂区标签']}", (r["数据年份（约）"], r[col]), textcoords="offset points",
                    xytext=(4, 6), fontsize=8, color=PAL["ink2"])
    style_ax(ax, title=f"Hongfujin: cumulative approved {short}, by zone", xlabel="EIA approval year", ylabel="t/yr")
savefig(fig, "D4_hongfujin_cumulative_approved_by_zone.png",
        note="Each point is a new assembly project's EIA-approved emissions, summed in approval order (K -> F -> C/L -> D -> B/E -> G; zones C and L were both approved in 2012). After zone G (the iPhone project) was approved in 2017, no further assembly-project EIA has been filed, so the cumulative approved total has not changed since (NMHC 600.18 t/yr, COD 161.72 t/yr, consistent with the D2 chart). This is a sum of EIA design values, not measured emissions, and does not imply all zones still operate at their originally designed capacity.")

# =====================================================================
# D5. Where labor and environment connect: 富联裕展 domestic-sewage COD vs design headcount
# =====================================================================
print("\nD5. Labor-environment link: domestic COD vs. design headcount (富联裕展)")

yuzhan_domestic = eia_long[
    (eia_long["实体"].str.contains("裕展", na=False)) & (eia_long["污染物"] == "生活污水COD")
][["数据年份（约）", "来源", "口径", "数值", "备注"]].sort_values("数据年份（约）")
yuzhan_headcount = proj_panel[proj_panel["实体"].str.contains("裕展", na=False) &
                              proj_panel["定员口径"].str.contains("全厂", na=False)].copy()
yuzhan_headcount["date"] = pd.to_datetime(yuzhan_headcount["代表月份（用于画图）"])
save_table(yuzhan_domestic, "D5_yuzhan_domestic_cod.csv")
save_table(yuzhan_headcount[["代表月份（用于画图）", "劳动定员（人）", "定员口径"]],
           "D5_yuzhan_design_headcount.csv")

# Pair each domestic-COD data point with the design headcount value in effect on that
# approximate date (nearest EIA headcount filing at or before it).
pairs = []
for _, r in yuzhan_domestic.iterrows():
    yr = r["数据年份（约）"]
    approx_date = pd.Timestamp(f"{int(yr)}-{int(round((yr % 1) * 12)) + 1:02d}-01")
    prior = yuzhan_headcount[yuzhan_headcount["date"] <= approx_date + pd.Timedelta(days=200)]
    hc = prior.sort_values("date")["劳动定员（人）"].iloc[-1] if len(prior) else np.nan
    pairs.append(dict(年份=yr, 生活污水COD=r["数值"], 对应设计定员=hc, 口径=r["口径"]))
pairs_df = pd.DataFrame(pairs).drop_duplicates(subset=["生活污水COD", "对应设计定员"])
save_table(pairs_df, "D5_domestic_cod_vs_design_headcount_paired.csv")

fig, ax1 = plt.subplots(figsize=(8.4, 5.2))
xs = range(len(pairs_df))
ax1.bar([x - 0.18 for x in xs], pairs_df["生活污水COD"], width=0.34, color=PAL["aqua"],
        label="Domestic-sewage COD (t/yr, left axis)")
for x, v in zip(xs, pairs_df["生活污水COD"]):
    ax1.text(x - 0.18, v + 1, f"{v:.1f}", ha="center", fontsize=8.5)
style_ax(ax1, title="FII Yuzhan: domestic-sewage COD vs. design headcount", ylabel="Domestic-sewage COD (t/yr)")
ax1.set_xticks(list(xs))
ax1.set_xticklabels([str(int(y)) for y in pairs_df["年份"]])
ax2 = ax1.twinx()
ax2.bar([x + 0.18 for x in xs], pairs_df["对应设计定员"], width=0.34, color=PAL["muted"],
        label="Design headcount (people, right axis)")
for x, v in zip(xs, pairs_df["对应设计定员"]):
    ax2.text(x + 0.18, v + 500, f"{v:,.0f}", ha="center", fontsize=8.5, color=PAL["ink2"])
ax2.set_ylabel("Design headcount (people)", fontsize=9.3)
ax2.grid(False)
lines1, labels1 = ax1.get_legend_handles_labels()
lines2, labels2 = ax2.get_legend_handles_labels()
ax1.legend(lines1 + lines2, labels1 + labels2, loc="upper right", fontsize=8.3, frameon=False)
savefig(fig, "D5_domestic_cod_vs_design_headcount.png",
        note="The one chart in this analysis that uses a dual axis (the two quantities differ in scale and unit - tonnes vs. people - and the relationship is one the EIA document itself states explicitly, not an external pairing): domestic-sewage COD is calculated as design headcount times a per-person sewage coefficient, so the two necessarily move together. The 2023 EIA states directly that 'domestic-sewage COD falling is in step with headcount 26,000 -> 11,614' (see the underlying note). This is the most direct point of contact between the labor and environment ledgers in this dataset - but it holds only for domestic sewage; it should not be generalized to production-related emissions like COD/VOCs, which are mainly driven by capacity/process (see D3).")

# =====================================================================
# D6. Context: group-level carbon footprint, 2015-2025 (background only, not Zhengzhou)
# =====================================================================
print("\nD6. Group-level Trucost carbon footprint (background)")

NUM_COLS = ["营收（百万美元）", "范围1排放（tCO2e）", "范围2地点法（tCO2e）", "范围2市场法（tCO2e）",
            "范围3上游（tCO2e）", "范围3下游（tCO2e）", "用水：直接+外购（m³）", "废弃物：直接+间接（吨）",
            "环境成本：直接+间接（百万美元）"]
tc = trucost.copy()
for c in NUM_COLS:
    tc[c] = pd.to_numeric(tc[c], errors="coerce")
tc["范围1+2+3上游合计"] = tc[["范围1排放（tCO2e）", "范围2地点法（tCO2e）", "范围3上游（tCO2e）"]].sum(axis=1)
tc["排放强度_tCO2e每百万美元营收"] = tc["范围1+2+3上游合计"] / tc["营收（百万美元）"]
save_table(tc[["公司", "财年"] + NUM_COLS + ["范围1+2+3上游合计", "排放强度_tCO2e每百万美元营收"]],
           "D6_trucost_group_carbon_footprint.csv")

COMPANIES = {"Hon Hai 鸿海": PAL["ink2"], "Foxconn Industrial Internet 工业富联": PAL["violet"]}
COMPANY_SHORT = {"Hon Hai 鸿海": "Hon Hai", "Foxconn Industrial Internet 工业富联": "FII"}
fig, axes = plt.subplots(1, 3, figsize=(13, 4.4), sharex=True)
for ax, col, label in zip(axes, ["范围1排放（tCO2e）", "范围2地点法（tCO2e）", "范围3上游（tCO2e）"],
                          ["Scope 1 (own operations)", "Scope 2 location-based (purchased power)", "Scope 3 upstream (supply chain)"]):
    for co, col_color in COMPANIES.items():
        d = tc[tc["公司"] == co]
        ax.plot(d["财年"], d[col], color=col_color, linewidth=2, marker="o", markersize=4, label=COMPANY_SHORT[co])
    ax.set_yscale("log")
    style_ax(ax, title=label, ylabel="tCO2e (log scale)")
axes[0].legend(loc="lower left", fontsize=8, frameon=False)
savefig(fig, "D6a_trucost_scope_emissions_by_company.png",
        note="Background data at the consolidated group level (Hon Hai parent / Foxconn Industrial Internet subsidiary), not Zhengzhou-plant data - used only to give the labor/environment ledgers a group-level point of reference. Scope 3 upstream (supply-chain procurement) is 1-2 orders of magnitude larger than Scope 1 (own operations), showing that Hon Hai/FII's disclosed carbon footprint comes mainly from the supply chain rather than their own factories. Scope 1 shows large step changes in 2017-2019 and 2022-2025 that likely reflect a change in disclosure basis or data source (CDP-reported vs. modeled estimate) rather than an actual operational shift - see the GHG weighted-disclosure-rate field.")

fig, ax = plt.subplots(figsize=(8.4, 5.0))
for co, col_color in COMPANIES.items():
    d = tc[tc["公司"] == co]
    ax.plot(d["财年"], d["排放强度_tCO2e每百万美元营收"], color=col_color, linewidth=2.2, marker="o",
            markersize=5, label=COMPANY_SHORT[co])
style_ax(ax, title="Carbon intensity: (Scope 1+2+3 upstream) / revenue (US$ million)", ylabel="tCO2e / US$M revenue")
ax.legend(loc="upper right", fontsize=9, frameon=False)
savefig(fig, "D6b_trucost_intensity_per_revenue.png",
        note="Intensity = (Scope 1 + Scope 2 location-based + Scope 3 upstream) / revenue, used to compare across years and companies by removing differences in revenue scale. Foxconn Industrial Internet (the subsidiary, mainly cloud-computing/networking-equipment contract manufacturing) runs a consistently lower carbon intensity per revenue than parent Hon Hai (broader electronics contract manufacturing, a heavier business mix). Also background only: this is Hon Hai/FII's group-wide figure and cannot be used to infer the Zhengzhou plants' emissions intensity.")

# =====================================================================
# D7. Plant snapshot, 2025
# =====================================================================
print("\nD7. Plant snapshot 2025")

save_table(plant_permits, "D7_plant_permits_snapshot.csv")
plant_2025_clean = plant_2025.copy()
# Known issue (研究问题_环境_Environment.md): the 鸿富锦 VOCs row's "许可排放量" cell is
# empty/shifted in the source report - the 22.14 t figure is the ANNUAL ACTUAL total,
# not a permit limit. Flag explicitly rather than let a reader mistake it for one.
plant_2025_clean["flag"] = ""
mask_vocs = (plant_2025_clean["厂区"].str.contains("鸿富锦", na=False)) & (plant_2025_clean["污染物"] == "VOCs")
plant_2025_clean.loc[mask_vocs, "flag"] = (
    "许可排放量单元格在原始报告中疑似错位/缺失（研究问题文档已指出）；22.14t是2025年实际合计，不是许可限值，"
    "此表许可排放量列按原样留空，不做臆测填充。")
save_table(plant_2025_clean, "D7_plant_2025_actual_emissions.csv")

# --- Chart D7: 鸿富锦 2025 quarterly emissions, small multiples
fig, axes = plt.subplots(1, 4, figsize=(13, 4.0), sharex=True)
hfj_2025 = plant_2025[plant_2025["厂区"].str.contains("鸿富锦", na=False)]
quarters = ["Q1", "Q2", "Q3", "Q4"]
POLLUTANT_EN = {"COD": "COD", "氨氮": "NH3-N", "VOCs": "VOCs", "颗粒物": "Particulates"}
for ax, pol in zip(axes, ["COD", "氨氮", "VOCs", "颗粒物"]):
    row = hfj_2025[hfj_2025["污染物"] == pol]
    if row.empty:
        ax.axis("off")
        continue
    vals = row.iloc[0][quarters].astype(float).values
    ax.bar(quarters, vals, color=C_HFJ, width=0.6)
    style_ax(ax, title=POLLUTANT_EN[pol], ylabel="Tonnes")
fig.suptitle("Hongfujin: actual emissions by quarter, 2025 (permit execution report)", fontsize=13, fontweight="bold", x=0.01, ha="left")
savefig(fig, "D7_hongfujin_2025_quarterly.png",
        note="Source: the National Pollutant Discharge Permit Management platform, Hongfujin's 2025 annual filing (reported 2026-01-14). The same filing shows the plant's 'exceedance information' and 'abnormal treatment-facility operation' fields both as 'no data available' - this does not mean the absence of exceedances has been verified. FII Yuzhan's 2025 annual filing shows every pollutant at exactly 0 (with a note suggesting it 'may not yet be in production or just completed a rebuild'), which contradicts EIA filings from the same period describing active construction/production projects (see D5 and the automation timeline) - verify before using this figure (e.g. by pulling its 2026 monthly reports).")
