"""
Foxconn Zhengzhou labor data analysis.

Answers the research questions in LABOR_DATA.md (A1-A3, B1-B2, C1-C2) using the
source workbooks listed in 00_文件说明.md. Reads existing files only; writes all
output (tidy tables, draft charts, memo) into ./labor_analysis_output/.

Run: python3 labor_data.py
"""
import json
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
RAW = BASE / "原始文件_抓取数据"
OUT = BASE / "labor_analysis_output"
TABLES = OUT / "tables"
CHARTS = OUT / "charts"
for d in (TABLES, CHARTS):
    d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Chart style (validated default palette from the dataviz skill, light mode)
# ---------------------------------------------------------------------------
PAL = dict(
    surface="#fcfcfb", page="#f9f9f7", ink="#0b0b0b", ink2="#52514e",
    muted="#898781", grid="#e1e0d9", axis="#c3c2b7",
    blue="#2a78d6", orange="#eb6834", aqua="#1baf7a", yellow="#eda100",
    magenta="#e87ba4", green="#008300", violet="#4a3aa7", red="#e34948",
)
CAT = [PAL["blue"], PAL["orange"], PAL["aqua"], PAL["yellow"],
       PAL["magenta"], PAL["green"], PAL["violet"], PAL["red"]]

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

ENTITY_ORDER = ["鸿富锦精密电子（郑州）", "富联精密电子（郑州）", "富联裕展科技（河南）", "河南富驰科技"]
ENTITY_SHORT = {"鸿富锦精密电子（郑州）": "鸿富锦", "富联精密电子（郑州）": "富联精密/富泰华",
                "富联裕展科技（河南）": "富联裕展/河南裕展", "河南富驰科技": "河南富驰"}
ENTITY_COLOR = dict(zip(ENTITY_ORDER, CAT[:4]))


def style_ax(ax, title=None, ylabel=None, xlabel=None):
    if title:
        ax.set_title(title, loc="left", pad=10)
    if ylabel:
        ax.set_ylabel(ylabel, fontsize=9.5)
    if xlabel:
        ax.set_xlabel(xlabel, fontsize=9.5)
    ax.grid(True, axis="y", linewidth=0.6)
    ax.grid(False, axis="x")
    return ax


def savefig(fig, name, note=None):
    # matplotlib's wrap=True breaks on whitespace, which CJK sentences mostly lack,
    # so long Chinese notes never wrap and instead blow out the tight bbox width.
    # Wrap manually by character count instead.
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


def save_table(df, name):
    df.to_csv(TABLES / name, index=False, encoding="utf-8-sig")
    print(f"  table -> {name}  ({len(df)} rows)")


print("=" * 70)
print("Loading source workbooks (read-only)")
print("=" * 70)

# =====================================================================
# Shared loads
# =====================================================================
F_INSURED = BASE / "用工_富士康郑州四家实体社保参保人数_2016-2025.xlsx"
F_MEDIA = BASE / "用工_媒体与NGO调查劳工数据_2015-2025.xlsx"
F_AUTOMATION = BASE / "自动化_环评设备定员产能面板与月度时间线_2010-2026.xlsx"
F_DISPATCH_CO = BASE / "用工_派遣公司参保人数与法院记录_2016-2025.xlsx"
F_RECRUIT_WAGE = BASE / "用工_招聘帖返费小时工价与底薪_2010-2026.xlsx"
F_REVELIO = BASE / "用工_Revelio职业档案与招聘帖_2008-2026.xlsx"
J_POSTS = RAW / "招聘帖全文抓取_fskzpw_2010-2026.json"

insured_wide = pd.read_excel(F_INSURED, sheet_name="工伤保险口径_宽表")
insured_long = insured_wide.melt(id_vars="年份", value_vars=ENTITY_ORDER,
                                  var_name="实体", value_name="工伤保险参保人数")
insured_long = insured_long.dropna(subset=["工伤保险参保人数"]).sort_values(["实体", "年份"])
insured_long["实体简称"] = insured_long["实体"].map(ENTITY_SHORT)

media_df = pd.read_excel(F_MEDIA, sheet_name="劳工数据", header=2)
media_df = media_df.dropna(how="all")

proj_panel = pd.read_excel(F_AUTOMATION, sheet_name="项目面板_自动化与用工")
monthly_panel = pd.read_excel(F_AUTOMATION, sheet_name="月度面板_自动化×用工×排放")

dispatch_co_insured = pd.read_excel(F_DISPATCH_CO, sheet_name="参保人数_年报")
dispatch_co_list = pd.read_excel(F_DISPATCH_CO, sheet_name="派遣公司名单")
dispatch_co_courts = pd.read_excel(F_DISPATCH_CO, sheet_name="法院记录")

recruit_monthly = pd.read_excel(F_RECRUIT_WAGE, sheet_name="月度序列")
recruit_annual = pd.read_excel(F_RECRUIT_WAGE, sheet_name="年度汇总")
recruit_posts = pd.read_excel(F_RECRUIT_WAGE, sheet_name="逐帖数据")

revelio_annual = pd.read_excel(F_REVELIO, sheet_name="年度汇总")
revelio_roles_2025 = pd.read_excel(F_REVELIO, sheet_name="2025年6月_岗位构成")
revelio_jobs = pd.read_excel(F_REVELIO, sheet_name="郑州招聘帖")

with open(J_POSTS, encoding="utf-8") as f:
    raw_posts = json.load(f)["posts"]  # keyed by article id (str)

print("Loaded all source files.\n")

# =====================================================================
# A1. Workforce composition (Airport Zone): insured vs. not insured, one total per year
# =====================================================================
print("A1. Workforce size and composition")

save_table(
    insured_long[["实体", "实体简称", "年份", "工伤保险参保人数"]].reset_index(drop=True),
    "A1_insured_workers_by_entity_annual.csv",
)

# Total on-site workforce point estimates (CLW / news / EIA), hand-compiled from
# 用工_媒体与NGO调查劳工数据 "劳工数据" sheet + 自动化 project panel (design headcounts).
# season: peak / trough / unspecified. EIA design headcounts are environmental-approval
# staffing caps, not measured employment - kept in a separate "kind" for that reason.
workforce_points = [
    dict(year=2017, season="peak", low=300000, high=None, kind="CLW total workforce",
         note="2017-18高峰>30万", source="CLW 2019"),
    dict(year=2018, season="trough", low=None, high=60000, kind="CLW total workforce",
         note="2018淡季约6万", source="CLW 2019"),
    dict(year=2019, season="unspecified", low=150000, high=None, kind="CLW total workforce",
         note="2019年8月>15万", source="CLW 2019"),
    dict(year=2022, season="trough", low=60000, high=70000, kind="CLW total workforce",
         note="春季淡季约6-7万人", source="CLW 2023 p.48"),
    dict(year=2023, season="peak", low=300000, high=None, kind="CLW total workforce",
         note="夏秋旺季超过30万人", source="CLW 2023 p.48"),
    dict(year=2025, season="peak", low=150000, high=200000, kind="CLW total workforce",
         note="高峰期用工15-20万人", source="CLW 2025"),
    dict(year=2025, season="peak", low=60000, high=80000, kind="CLW regular (insured-eligible)",
         note="正式工约6-8万（CLW用工构成拆分）", source="CLW 2025 p.8"),
    dict(year=2025, season="peak", low=80000, high=110000, kind="CLW dispatch",
         note="派遣工约8-11万（CLW用工构成拆分）", source="CLW 2025 p.8"),
]
workforce_points_df = pd.DataFrame(workforce_points)
save_table(workforce_points_df, "A1_total_workforce_point_estimates.csv")

# EIA design headcounts (environmental-approval staffing figures, not real employment)
eia_headcount = proj_panel[["实体", "厂区", "项目", "代表月份（用于画图）", "劳动定员（人）", "定员口径"]].copy()
eia_headcount = eia_headcount.dropna(subset=["劳动定员（人）"]).rename(
    columns={"代表月份（用于画图）": "代表月份"})
eia_headcount["实体简称"] = eia_headcount["实体"].map(
    lambda s: next((v for k, v in ENTITY_SHORT.items() if k[:2] in str(s)), s[:6]))
save_table(eia_headcount, "A1_eia_design_headcounts_by_project.csv")

# --- Chart A1a: who makes up the Airport Zone workforce? (insured by factory vs. not insured)
# Every year 2016-2025 shows insured workers, stacked by 航空港 factory
# (鸿富锦 + 富联裕展 + 河南富驰; 富联精密 is in 经开区 and not included).
# Where CLW gives a total-workforce figure, a grey hatched segment on top shows
# the rest of the workforce (total - insured = dispatch / student workers, inferred).
# One total per year (no peak/trough split): ranges -> midpoint; ">" -> used as the
# value (lower bound, marked "≥"). 2018 and 2022 only have off-season CLW numbers
# (lower than the insured count), so those years show insured workers only.
AIRPORT_ENTITIES = ["鸿富锦精密电子（郑州）", "富联裕展科技（河南）", "河南富驰科技"]
AIRPORT_COLOR = {"鸿富锦精密电子（郑州）": PAL["blue"],
                 "富联裕展科技（河南）": PAL["aqua"],
                 "河南富驰科技": PAL["yellow"]}
C_REST = "#d9d8d2"          # neutral grey + hatch = inferred, not a factory
EN_NAME = {"鸿富锦精密电子（郑州）": "Hongfujin",
           "富联裕展科技（河南）": "FII Yuzhan (Henan Yuzhan)",
           "河南富驰科技": "Henan Fuchi"}

ins_wide = (insured_long[insured_long["实体"].isin(AIRPORT_ENTITIES)]
            .pivot(index="年份", columns="实体", values="工伤保险参保人数")
            .reindex(index=range(2016, 2026), columns=AIRPORT_ENTITIES))
# 河南富驰 2020 = 1 is a reporting gap, not a real headcount -> treat as missing
ins_wide.loc[2020, "河南富驰科技"] = np.nan
ins_wide = ins_wide.fillna(0)
insured_airport = ins_wide.sum(axis=1)

workforce_total = pd.DataFrame([
    dict(year=2017, total=300000, lower_bound=True,  label="≥300k",   source="CLW 2019（2017-18旺季>30万）"),
    dict(year=2019, total=150000, lower_bound=True,  label="≥150k",   source="CLW 2019（2019年8月>15万）"),
    dict(year=2023, total=300000, lower_bound=True,  label="≥300k",   source="CLW 2023 p.48（旺季超过30万）"),
    dict(year=2025, total=175000, lower_bound=False, label="~175k", source="CLW 2025（15-20万，取中值）"),
]).set_index("year")

comp = ins_wide.rename(columns=ENTITY_SHORT).copy()
comp["参保合计"] = insured_airport
comp["总用工估计"] = workforce_total["total"]
comp["总用工为下限"] = workforce_total["lower_bound"]
comp["未参保（推算）"] = comp["总用工估计"] - comp["参保合计"]
comp["参保占比%"] = (comp["参保合计"] / comp["总用工估计"] * 100).round(1)
comp["未参保占比%"] = (100 - comp["参保占比%"]).round(1)
comp["总用工来源"] = workforce_total["source"]
save_table(comp.reset_index().rename(columns={"年份": "year"}),
           "A1_workforce_composition_airport.csv")

fig, ax = plt.subplots(figsize=(10.5, 6.2))
years = comp.index.to_numpy()
W = 0.68
bottom = np.zeros(len(years))
for ent in AIRPORT_ENTITIES:
    v = ins_wide[ent].to_numpy() / 1e4
    ax.bar(years, v, bottom=bottom, width=W, color=AIRPORT_COLOR[ent],
           edgecolor=PAL["surface"], linewidth=1.5, zorder=3, label=EN_NAME[ent])
    bottom += v
ins_top = bottom.copy()

has_total = comp["总用工估计"].notna().to_numpy()
rest = comp["未参保（推算）"].fillna(0).to_numpy() / 1e4
ax.bar(years[has_total], rest[has_total], bottom=ins_top[has_total], width=W,
       color=C_REST, hatch="///", edgecolor=PAL["surface"], linewidth=1.5, zorder=3,
       label="Not insured by Foxconn (dispatch / student workers, inferred)")
# re-draw hatch lines in a visible grey (edgecolor above keeps the 2px surface gap)
for b in ax.patches[-has_total.sum():]:
    b.set_hatch("///")
    b._hatch_color = (0.62, 0.61, 0.58, 1.0)

for i, yr in enumerate(years):
    r = comp.loc[yr]
    if pd.notna(r["总用工估计"]):
        tot = r["总用工估计"] / 1e4
        ax.text(yr, tot + 0.5, f"Total {workforce_total.loc[yr, 'label']}", ha="center",
                va="bottom", fontsize=8.6, color=PAL["ink2"])
        ax.text(yr, ins_top[i] + 1.6 + (rest[i] - 1.6) / 2, f"Not insured\n{rest[i]*10:.0f}k\n{r['未参保占比%']:.0f}%",
                ha="center", va="center", fontsize=8.6, color=PAL["ink"], fontweight="bold",
                zorder=5, bbox=dict(boxstyle="round,pad=0.2", fc=PAL["surface"], ec="none", alpha=0.85))
        ax.text(yr, ins_top[i] + 0.35, f"Insured {ins_top[i]*10:.0f}k\n{r['参保占比%']:.0f}%",
                ha="center", va="bottom", fontsize=7.8, color=PAL["ink"], zorder=5,
                bbox=dict(boxstyle="round,pad=0.15", fc=PAL["surface"], ec="none", alpha=0.85))
    else:
        ax.text(yr, ins_top[i] + 0.35, f"Insured {ins_top[i]*10:.0f}k", ha="center", va="bottom",
                fontsize=7.8, color=PAL["ink"])

# direct labels for the factories, next to the 2025 bar
x_lab = years[-1] + W / 2 + 0.15
b, prev_y = 0, -9
for ent in AIRPORT_ENTITIES:
    v = ins_wide.loc[2025, ent] / 1e4
    y_lab = max(b + v / 2, prev_y + 1.1)      # keep small segments' labels apart
    ax.text(x_lab, y_lab, f"{EN_NAME[ent]} {v*10:.0f}k", ha="left", va="center",
            fontsize=8.4, color=PAL["ink"])
    b, prev_y = b + v, y_lab

ax.legend(loc="upper right", bbox_to_anchor=(1.0, 1.01), ncol=2, frameon=False, fontsize=8.6)
ax.set_xticks(years)
ax.set_xticklabels([str(v) for v in years])
ax.set_xlim(2015.4, 2026.9)
ax.set_ylim(0, 36)
style_ax(ax, ylabel="Workers")
ax.yaxis.set_major_formatter(lambda v, _: f"{v*10:.0f}k" if v else "0")
ax.set_title("Foxconn Zhengzhou Airport Zone: insured workers are shrinking, and most workers on the line are not insured by Foxconn",
             loc="left", pad=30)
ax.text(0, 1.035, "Colored = work-injury-insured workers by factory (annual reports); grey hatched = CLW total workforce − insured (years with CLW data only)",
        transform=ax.transAxes, fontsize=8.8, color=PAL["ink2"], ha="left", va="bottom")
savefig(fig, "A1_insured_workers_vs_total_workforce.png",
        note="Sources: insured workers = annual reports of the three Airport Zone entities (Hongfujin, FII Yuzhan / Henan Yuzhan, Henan Fuchi), work-injury insurance count, direct employees only; "
             "FII Precision (Futaihua) is in the Economic Development Zone and is excluded. Henan Fuchi reported 1 insured worker in 2020 (likely a reporting gap) and is treated as missing; 2017-2019 values were only ~70-80. "
             "Total workforce = China Labor Watch 2019 / 2023 / 2025 estimates for that year's production season; ranges use the midpoint, \">\" values are used as lower bounds (marked ≥, so the not-insured share is a minimum). "
             "2018 and 2022 have only off-season CLW figures (~60-70k, below the insured count) and are shown as insured only. "
             "Grey segments are inferred (total − insured); definitions differ, so treat them as indicative. CLW's own 2025 split is 60-80k regular / 80-110k dispatch (~58% dispatch), consistent in direction with the ~70% here.")

# =====================================================================
# A2. Dispatch worker share - point estimates + "insured vs. total" proxy
# =====================================================================
print("\nA2. Dispatch workers")

LEGAL_CAP_PCT = 10.0
dispatch_share_points = [
    dict(year=2018, share_low=55, share_high=55, unit="%", source="CLW 2019",
         note="2018年派遣工占比55%"),
    dict(year=2019, share_low=50, share_high=50, unit="%", source="CLW 2019",
         note="2019年8月约50%"),
    dict(year=2025, share_low=50, share_high=None, unit="%", source="CLW 2025",
         note="派遣工占比>50%（法定上限10%）"),
]
dispatch_share_df = pd.DataFrame(dispatch_share_points)
save_table(dispatch_share_df, "A2_dispatch_share_point_estimates_CLW.csv")

dispatch_count_points = [
    dict(year=2025, low=80000, high=110000, unit="人", source="CLW 2025",
         note="派遣工人数（高峰期），占比>50%"),
    dict(year=2025, low=60000, high=80000, unit="人", source="CLW 2025 p.8",
         note="正式工人数（高峰期），供对照"),
]
dispatch_count_df = pd.DataFrame(dispatch_count_points)
save_table(dispatch_count_df, "A2_dispatch_headcount_point_estimates_CLW.csv")

# Proxy estimate: total workforce (CLW range) minus insured workers (regular-worker
# proxy), for years where both a CLW total-workforce figure and an insured-worker
# total exist. Clearly an estimate: insured workers may itself undercount regular
# staff, and CLW's workforce figure is a fieldwork observation, not a census.
insured_annual_total = insured_long.groupby("年份")["工伤保险参保人数"].sum()

def clw_total_range(year):
    rows = workforce_points_df[(workforce_points_df["year"] == year) &
                                (workforce_points_df["kind"] == "CLW total workforce")]
    if rows.empty:
        return None, None
    lo = rows["low"].dropna().min() if rows["low"].notna().any() else rows["high"].min()
    hi = rows["high"].dropna().max() if rows["high"].notna().any() else rows["low"].max()
    return lo, hi

proxy_rows = []
for yr in [2018, 2019, 2025]:
    insured_yr = insured_annual_total.get(yr)
    lo, hi = clw_total_range(yr)
    if insured_yr is None or lo is None:
        continue
    dispatch_gap_low = max(lo - insured_yr, 0) if lo else None
    dispatch_gap_high = max(hi - insured_yr, 0) if hi else None
    share_row = dispatch_share_df[dispatch_share_df["year"] == yr]
    share_pct = share_row["share_low"].iloc[0] if not share_row.empty else np.nan
    # Method 2: assume insured ~= regular workers, dispatch_share known -> back out total
    modeled_total = insured_yr / (1 - share_pct / 100) if pd.notna(share_pct) else np.nan
    modeled_dispatch = modeled_total - insured_yr if pd.notna(modeled_total) else np.nan
    usable = True
    caveat = "insured snapshot and CLW workforce figure are roughly contemporaneous."
    if yr == 2018:
        usable = False
        caveat = ("CLW's 2018 figure (~60,000) is an explicitly-labeled OFF-SEASON "
                   "trough observation, not comparable to the year-end insured "
                   "snapshot (190,666, itself close to 2017's 231,589). Combining "
                   "them yields an implausible modeled total (>400,000, above any "
                   "reported peak) - kept for transparency but NOT usable as an estimate.")
    if yr == 2025:
        caveat += (" Note: at share=50% exactly, method2's dispatch estimate is "
                    "mathematically forced to equal insured_workers_sum (tautology, "
                    "not new information); CLW's own direct regular/dispatch split "
                    "(60-80k / 80-110k) implies a true share nearer 57-58%, higher "
                    "than the >=50% floor used here.")
    proxy_rows.append(dict(
        year=yr, insured_workers_sum=insured_yr,
        clw_total_workforce_low=lo, clw_total_workforce_high=hi,
        method1_dispatch_est_low=dispatch_gap_low, method1_dispatch_est_high=dispatch_gap_high,
        clw_reported_dispatch_share_pct=share_pct,
        method2_modeled_total_workforce=modeled_total,
        method2_modeled_dispatch_est=modeled_dispatch,
        usable_as_estimate=usable, caveat=caveat,
    ))
dispatch_proxy_df = pd.DataFrame(proxy_rows)
save_table(dispatch_proxy_df, "A2_dispatch_estimate_vs_insured_PROXY.csv")

# Dispatch-agency insured headcounts (evidence of under-insurance, not a size measure)
dispatch_co_long = dispatch_co_insured.melt(id_vars="公司", var_name="年份", value_name="参保人数")
dispatch_co_long["年份"] = dispatch_co_long["年份"].astype(int)
save_table(dispatch_co_long.dropna(subset=["参保人数"]), "A2_dispatch_agency_insured_headcounts.csv")

# --- Chart A2a: legal cap vs CLW-reported dispatch share
fig, ax = plt.subplots(figsize=(7.4, 4.6))
xs = [str(y) for y in dispatch_share_df["year"]]
vals = dispatch_share_df["share_low"]
bars = ax.bar(xs, vals, color=PAL["orange"], width=0.5, zorder=3)
for b, r in zip(bars, dispatch_share_df.itertuples()):
    label = f">{r.share_low:.0f}%" if pd.isna(r.share_high) else f"{r.share_low:.0f}%"
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 1.5, label,
            ha="center", fontsize=9.5, color=PAL["ink"])
ax.axhline(LEGAL_CAP_PCT, color=PAL["red"], linewidth=1.8, linestyle="--", zorder=4)
ax.text(len(xs) - 0.55, LEGAL_CAP_PCT + 1.5, "法定上限 10%", color=PAL["red"], fontsize=9,
        ha="right")
ax.set_ylim(0, 68)
style_ax(ax, title="派遣工占用工总量比例：CLW调查 vs. 劳动合同法上限",
         ylabel="占比（%）")
savefig(fig, "A2_dispatch_share_vs_legal_cap.png",
        note="来源：China Labor Watch 2019、2025年报告（访谈/实地调查估计，非全厂普查）。《劳动合同法》规定劳务派遣用工不得超过用工总量的10%。")

# --- Chart A2b: insured workers vs. CLW total/regular/dispatch (2025 snapshot)
fig, ax = plt.subplots(figsize=(7.6, 4.8))
cats = ["工伤保险参保人数\n（四家合计, 2025）", "CLW正式工估计\n（2025旺季）",
        "CLW派遣工估计\n（2025旺季）", "CLW总用工估计\n（2025旺季）"]
lo = [insured_annual_total.get(2025, np.nan), 60000, 80000, 150000]
hi = [insured_annual_total.get(2025, np.nan), 80000, 110000, 200000]
colors = [PAL["blue"], PAL["aqua"], PAL["orange"], PAL["ink2"]]
for i, (c, l, h, col) in enumerate(zip(cats, lo, hi, colors)):
    if l == h:
        ax.bar(i, l, color=col, width=0.55, zorder=3)
        ax.text(i, l + 3000, f"{l:,.0f}", ha="center", fontsize=9)
    else:
        ax.bar(i, h - l, bottom=l, color=col, width=0.55, zorder=3, alpha=0.9)
        ax.text(i, h + 3000, f"{l:,.0f}–{h:,.0f}", ha="center", fontsize=9)
ax.set_xticks(range(len(cats)))
ax.set_xticklabels(cats, fontsize=8.6)
style_ax(ax, title="2025年：参保人数 vs. CLW 正式工/派遣工/总用工估计（同一年份对照）",
         ylabel="人数")
savefig(fig, "A2_insured_vs_CLW_2025_snapshot.png",
        note="参保人数=鸿富锦+富联精密+富联裕展+河南富驰工伤保险口径合计（正式工，不含派遣工）。CLW数字来自2025年3-9月访谈调查（102人样本），是估计区间，不是普查。两者量级相近（6.1万 vs 6-8万正式工估计），可作为互相印证的弱-中等强度证据；不构成同一统计口径的验证。")

# =====================================================================
# A3. How much of the workforce does Revelio cover?
# =====================================================================
print("\nA3. Revelio coverage")

rev_annual = revelio_annual.rename(columns={
    "年份": "年份", "Revelio估计人数": "Revelio估计人数", "原始档案数": "原始档案数",
    "人均年薪_USD(模型估计)": "人均年薪_USD",
})[["年份", "Revelio估计人数", "原始档案数", "人均年薪_USD"]].copy()
rev_annual = rev_annual.merge(
    insured_annual_total.rename("插入保险参保人数合计").reset_index(), on="年份", how="left")
rev_annual = rev_annual.rename(columns={"插入保险参保人数合计": "四家实体工伤保险参保合计"})

coverage_rows = []
for yr in [2019, 2025]:
    rev = rev_annual.loc[rev_annual["年份"] == yr, "Revelio估计人数"]
    rev = rev.iloc[0] if not rev.empty else np.nan
    ins = insured_annual_total.get(yr, np.nan)
    lo, hi = clw_total_range(yr)
    coverage_rows.append(dict(
        year=yr, revelio_est_headcount=rev, insured_workers=ins,
        clw_total_workforce_low=lo, clw_total_workforce_high=hi,
        coverage_vs_insured_pct=100 * rev / ins if ins else np.nan,
        coverage_vs_clw_total_low_pct=100 * rev / hi if hi else np.nan,
        coverage_vs_clw_total_high_pct=100 * rev / lo if lo else np.nan,
    ))
coverage_df = pd.DataFrame(coverage_rows)
save_table(rev_annual, "A3_revelio_annual_vs_insured.csv")
save_table(coverage_df, "A3_revelio_coverage_pct.csv")
save_table(revelio_roles_2025, "A3_revelio_2025_role_composition.csv")

# --- Chart A3a: Revelio estimated headcount (flat) vs insured workers (declining), log scale
fig, ax = plt.subplots(figsize=(8.6, 5.0))
ax.plot(rev_annual["年份"], rev_annual["四家实体工伤保险参保合计"], marker="o", markersize=4,
        linewidth=2, color=PAL["blue"], label="工伤保险参保人数（四家合计）")
ax.plot(rev_annual["年份"], rev_annual["Revelio估计人数"], marker="s", markersize=4,
        linewidth=2, color=PAL["violet"], label="Revelio估计人数（郑州，含放大权重）")
ax.plot(rev_annual["年份"], rev_annual["原始档案数"], marker="^", markersize=4,
        linewidth=1.4, linestyle="--", color=PAL["violet"], alpha=0.6, label="Revelio原始档案数（未放大）")
ax.axhspan(150000, 300000, color=PAL["muted"], alpha=0.12, zorder=0)
ax.text(2008.3, 200000, "CLW总用工估计区间（旺季，示意）", fontsize=7.8, color=PAL["ink2"])
ax.set_yscale("log")
style_ax(ax, title="Revelio估计的郑州鸿海人数 vs. 参保人数 vs. 实际总用工规模（2008-2025）",
         ylabel="人数（对数刻度）")
ax.legend(loc="upper right", fontsize=8.3, frameon=False)
savefig(fig, "A3_revelio_coverage_vs_reality.png",
        note="Revelio（LinkedIn等公开职业档案+招聘网站抽样，经权重放大）序列几乎不随年份变化，反映不出2022年疫情封控或旺季招工，说明多为插补/回填值，不是逐年真实变化；且主要覆盖白领/工程师岗位，一线普工、派遣工、学生工基本不在样本中。覆盖率≈8,100/(15-30万)≈3-5%。")

# --- Chart A3b: Revelio 2025 role composition (mostly office-adjacent categories)
roles = revelio_roles_2025.sort_values("人数", ascending=True)
fig, ax = plt.subplots(figsize=(7.6, 4.6))
ax.barh(roles["role_k10"], roles["人数"], color=PAL["violet"])
style_ax(ax, title="Revelio 2025年6月：郑州鸿海在职档案的岗位构成", xlabel="估计人数（放大后）")
savefig(fig, "A3_revelio_role_composition_2025.png",
        note="岗位归类为Revelio的role_k10模型标签，'unknown'为最大类；'Technician'口径不等同工厂产线普工。整体样本仍以office/engineer/service一类的白领及技术岗位为主，用来说明该数据源能代表什么、不能代表什么，不用于估算工厂用工规模。")

# =====================================================================
# B1. Pay calculation: regular vs. dispatch (rebate-type & hourly-type)
# =====================================================================
print("\nB1. Pay structure - regular vs dispatch")

wage_structure = pd.read_excel(F_MEDIA, sheet_name="工资结构对比", header=None)
wage_structure.columns = ["字段", "正式工", "派遣工·返费型", "派遣工·小时工型", "学生工"]
wage_structure = wage_structure.iloc[3:].reset_index(drop=True)
save_table(wage_structure, "B1_pay_structure_by_worker_type.csv")

calc_raw = pd.read_excel(F_MEDIA, sheet_name="收入计算器_正式工vs派遣工", header=None)
month_scn = calc_raw.iloc[22:27, 0:14].copy()
month_scn.columns = calc_raw.iloc[22, 0:14].tolist()
month_scn = month_scn.iloc[1:].reset_index(drop=True)
month_scn.insert(0, "period", "month")
week_scn = calc_raw.iloc[30:33, 0:14].copy()
week_scn.columns = calc_raw.iloc[30, 0:14].tolist()
week_scn = week_scn.iloc[1:].reset_index(drop=True)
week_scn.insert(0, "period", "week")
income_scenarios = pd.concat([month_scn, week_scn], ignore_index=True)
income_scenarios = income_scenarios.rename(columns={"情景": "scenario"})
save_table(income_scenarios, "B1_income_calculator_scenarios.csv")

# --- Chart B1a: pretax monthly income, regular vs. hourly-type dispatch, by season
m = month_scn[month_scn["情景"] != "自定义"].copy()
fig, ax = plt.subplots(figsize=(7.8, 4.8))
xw = np.arange(len(m))
w = 0.32
b1 = ax.bar(xw - w / 2, m["正式工_税前（元）"].astype(float), width=w, color=PAL["blue"],
            label="正式工·税前（元/月）", zorder=3)
b2 = ax.bar(xw + w / 2, m["派遣工_税前（元）"].astype(float), width=w, color=PAL["orange"],
            label="小时工型派遣工·税前（元/月）", zorder=3)
for bars in (b1, b2):
    for b in bars:
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 60, f"{b.get_height():,.0f}",
                ha="center", fontsize=8.3)
ax.set_xticks(xw)
ax.set_xticklabels([str(s).replace("（", "\n（") for s in m["情景"]], fontsize=8.6)
style_ax(ax, title="正式工 vs. 小时工型派遣工：同季节税前月收入对比", ylabel="元/月")
ax.legend(loc="upper left", fontsize=8.6, frameon=False)
savefig(fig, "B1_income_scenarios_regular_vs_dispatch.png",
        note="来源：用工_媒体与NGO调查劳工数据 收入计算器（默认参数取自CLW 2025年报告p.15-18及劳动法加班规定）。派遣工税前更高是因为综合时薪无加班倍数、且不缴社保（少了一项应计成本），但\"当期到手\"更低（约13元/时的\"差价\"要推迟到下月底且须当月25日在职才发，提前离职则作废/打折），并且没有社保、带薪病假等保障，也不享受同季节工作日1.5/2/3倍加班倍数。")

# --- Chart B1b: dispatch/regular pretax ratio + take-home vs deferred split
fig, ax = plt.subplots(figsize=(7.4, 4.6))
ratio = m["派遣工÷正式工（税前）"].astype(float)
ax.bar(xw, ratio, width=0.45, color=PAL["aqua"], zorder=3)
for i, v in enumerate(ratio):
    ax.text(i, v + 0.02, f"{v:.2f}×", ha="center", fontsize=9)
ax.axhline(1.0, color=PAL["axis"], linewidth=1)
ax.set_xticks(xw)
ax.set_xticklabels([str(s).replace("（", "\n（") for s in m["情景"]], fontsize=8.6)
style_ax(ax, title="小时工型派遣工税前收入 / 正式工税前收入（同季节同工时）", ylabel="倍数")
savefig(fig, "B1_dispatch_regular_pretax_ratio.png",
        note="比值>1不代表派遣工总体待遇更好：正式工数字已扣除，派遣工数字未扣任何社保或住房公积金个人部分（本身也没有社保），且派遣工的\"差价\"部分（约占时薪一半）押后一个月发放、当月25号前离职即作废或打折（详见B1_pay_structure表\"离职损失\"行）。")

# =====================================================================
# B2. White-collar pay vs. factory-worker pay
# =====================================================================
print("\nB2. White-collar vs. factory-worker pay")

# White-collar: Revelio posted (non-model-predicted) salaries only, RMB annual -> RMB/month
wc = revelio_jobs.loc[~revelio_jobs["salary_predicted"]].copy()
wc["year"] = pd.to_datetime(wc["post_date"]).dt.year
wc["monthly_rmb"] = ((wc["salary_min"] + wc["salary_max"]) / 2) / 12
wc_annual = wc.groupby("year")["monthly_rmb"].agg(n_posts="count", median_monthly_rmb="median")
wc_annual["p25_monthly_rmb"] = wc.groupby("year")["monthly_rmb"].quantile(0.25)
wc_annual["p75_monthly_rmb"] = wc.groupby("year")["monthly_rmb"].quantile(0.75)
wc_annual = wc_annual.reset_index().rename(columns={"year": "年份"})
# 2026 postings carry annual-salary values as low as ~1,000 RMB (implied ~RMB90/month) -
# almost certainly a unit/parsing artifact for that recent batch, not a real wage. Flag
# any year whose median implies below-minimum-wage pay as implausible, on top of n<10.
wc_annual["reliable_n_ge_10"] = wc_annual["n_posts"] >= 10
wc_annual["plausible_ge_min_wage"] = wc_annual["median_monthly_rmb"] >= 1500
wc_annual["reliable"] = wc_annual["reliable_n_ge_10"] & wc_annual["plausible_ge_min_wage"]
save_table(wc_annual, "B2_whitecollar_monthly_pay_by_year.csv")

# Factory: 招聘帖 年度汇总 (base pay, hourly wage) + CLW direct monthly-income quotes.
STANDARD_HOURS_TYPICAL_MONTH = 226  # CLW 2025 calculator, "淡季" scenario total hours
factory = recruit_annual.copy()
factory["modeled_monthly_from_hourly_rmb"] = factory["小时工_中位数"] * STANDARD_HOURS_TYPICAL_MONTH
clw_monthly_quotes = pd.DataFrame([
    dict(年份=2019, clw_monthly_low=2000, clw_monthly_high=3500,
         note="CLW2019：淡季约2,000元/旺季约3,500元"),
    dict(年份=2025, clw_monthly_low=3000, clw_monthly_high=5100,
         note="CLW2025 p.15：普工3,000-3,500/技术工3,500-5,100（含加班）"),
])
factory = factory.merge(clw_monthly_quotes, on="年份", how="left")
save_table(factory, "B2_factory_pay_by_year.csv")

comparison = wc_annual[["年份", "median_monthly_rmb", "n_posts", "reliable"]].rename(
    columns={"median_monthly_rmb": "whitecollar_median_monthly_rmb", "n_posts": "whitecollar_n_posts"}
).merge(
    factory[["年份", "底薪_最高", "modeled_monthly_from_hourly_rmb", "clw_monthly_low", "clw_monthly_high"]],
    on="年份", how="outer"
).sort_values("年份")
comparison["ratio_wc_over_factory_modeled"] = (
    comparison["whitecollar_median_monthly_rmb"] / comparison["modeled_monthly_from_hourly_rmb"])
save_table(comparison, "B2_whitecollar_vs_factory_comparison.csv")

# --- Chart B2: white-collar posted salary vs factory pay (base/modeled/CLW), same unit (RMB/month)
fig, ax = plt.subplots(figsize=(9.0, 5.2))
wc_rel = wc_annual[wc_annual["reliable"]]
ax.plot(wc_rel["年份"], wc_rel["median_monthly_rmb"], marker="o", markersize=5, linewidth=2.2,
        color=PAL["violet"], label="白领招聘帖·发布月薪中位数（Revelio，仅非模型预测值）", zorder=4)
wc_unrel = wc_annual[~wc_annual["reliable"]]
ax.scatter(wc_unrel["年份"], wc_unrel["median_monthly_rmb"], marker="o", s=26,
           facecolor="none", edgecolor=PAL["violet"], linewidth=1.4, zorder=4,
           label="同上，样本量n<10或中位数低于最低工资（数据质量存疑）")
fac = factory.dropna(subset=["modeled_monthly_from_hourly_rmb"])
ax.plot(fac["年份"], fac["modeled_monthly_from_hourly_rmb"], marker="s", markersize=5,
        linewidth=2.2, color=PAL["orange"],
        label=f"派遣小时工·按{STANDARD_HOURS_TYPICAL_MONTH}h/月折算（招聘帖小时价中位数×{STANDARD_HOURS_TYPICAL_MONTH}）", zorder=3)
bs = factory.dropna(subset=["底薪_最高"])
ax.plot(bs["年份"], bs["底薪_最高"], marker="^", markersize=5, linewidth=1.6, linestyle="--",
        color=PAL["blue"], label="正式工·招聘帖底薪上限（不含加班）", zorder=3)
for _, r in clw_monthly_quotes.iterrows():
    ax.plot([r["年份"], r["年份"]], [r["clw_monthly_low"], r["clw_monthly_high"]],
            color=PAL["ink2"], linewidth=3, solid_capstyle="round", zorder=5)
ax.plot([], [], color=PAL["ink2"], linewidth=3, label="CLW厂区工人月收入实测区间（淡/旺季或普工/技术工）")
style_ax(ax, title="白领招聘薪资 vs. 工厂工人薪资：郑州（2012-2026）", ylabel="元/月")
ax.legend(loc="upper left", fontsize=7.6, frameon=False)
savefig(fig, "B2_whitecollar_vs_factory_pay.png",
        note="白领数据=Revelio郑州招聘帖中标注为\"非模型预测\"的实际发帖薪资（年薪/12，人民币），主要为工程师/职能岗位。空心点=样本量n<10（2024、2025）或中位数低于本地最低工资（2026年批次salary字段疑似单位错误，年薪最低仅约1,000元，予以标记不采信），均视为数据质量存疑。工厂数据：底薪为招聘帖标注的封顶底薪，不含加班；\"折算月收入\"是用招聘帖时薪中位数乘以一个假设的\"典型月工时\"（226小时，含常规加班），是建模估算，不是实测工资单；CLW区间是访谈样本的月收入实测值，两类工人不完全在同一时间点比较，不能做严格的同比。总体上白领发帖月薪（约7千-1万）显著高于工厂工人（约2千-7千），但白领数字是招聘\"要价\"、工厂数字常含大量加班，口径不对等，2022年白领中位数的异常下探（部分帖子实为保安/司机等低薪职位混入）也提示Revelio的岗位分类本身不够干净。")

# =====================================================================
# C1. Recruitment post types over time (fskzpw.com, 2010-2026)
# =====================================================================
print("\nC1. Recruitment post classification")

STUDENT_KW = ["学生工", "暑假工", "寒假工", "暑期工", "学生兼职", "大学生", "假期工"]
SHORTTERM_KW = ["日结", "临时工", "短期工", "短工", "钟点工"]
DISPATCH_KW = ["派遣", "劳务外包", "同工同酬", "工资差价", "差价确认书", "返费协议", "外包"]
DIRECT_KW = ["直招", "官方直招", "正式工", "厂方直招", "工厂直招", "无中介"]
ALL_KW = {"dispatch": DISPATCH_KW, "direct_hire_language": DIRECT_KW,
          "student": STUDENT_KW, "shortterm": SHORTTERM_KW}

posts = recruit_posts.copy()
posts["文章ID"] = posts["文章ID"].astype(str)
posts["year"] = posts["日期"].dt.year

def get_search_text(article_id, contaminated):
    """Title + summary always usable; body only if not flagged as template-contaminated
    (LABOR_DATA.md rule: if body mentions a year 2+ years after the post date, the site
    has overwritten it with a later FAQ template, so body must be dropped)."""
    p = raw_posts.get(str(article_id), {})
    text = f"{p.get('title', '')} {p.get('desc', '')}"
    if not contaminated:
        text += " " + p.get("body", "")
    return text

def find_hits(text, keywords):
    return [kw for kw in keywords if kw in text]

def quote_snippet(text, kw, span=35):
    i = text.find(kw)
    if i < 0:
        return ""
    return re.sub(r"\s+", " ", text[max(0, i - span):i + len(kw) + span]).strip()

records = []
quotes = []
for _, r in posts.iterrows():
    text = get_search_text(r["文章ID"], r["正文含后期模板"])
    hits = {k: find_hits(text, kws) for k, kws in ALL_KW.items()}

    has_hourly = pd.notna(r["小时工_最高时薪"]) or pd.notna(r["小时工_最低时薪"]) or pd.notna(r["小时工补贴_元"])
    has_rebate = pd.notna(r["返费_最高"]) or pd.notna(r["返费_最低"])

    if has_hourly:
        ptype = "hourly-type dispatch"
    elif has_rebate:
        ptype = "rebate-type dispatch"
    elif hits["student"]:
        ptype = "student/summer"
    elif hits["shortterm"]:
        ptype = "short-term"
    else:
        ptype = "regular/unspecified"

    records.append(dict(
        文章ID=r["文章ID"], 日期=r["日期"], year=r["year"], 标题=r["标题"],
        post_type=ptype,
        has_rebate_field=has_rebate, has_hourly_field=has_hourly,
        mentions_dispatch_language=bool(hits["dispatch"]),
        mentions_direct_hire_language=bool(hits["direct_hire_language"]),
        body_contaminated=r["正文含后期模板"],
    ))

    for kind, kws in hits.items():
        for kw in kws:
            quotes.append(dict(
                文章ID=r["文章ID"], 日期=r["日期"], year=r["year"], keyword_type=kind,
                keyword=kw, quote=quote_snippet(text, kw),
                body_used=not r["正文含后期模板"], 链接=r["链接"],
            ))

post_types_df = pd.DataFrame(records)
quotes_df = pd.DataFrame(quotes).drop_duplicates(subset=["文章ID", "keyword"])
save_table(post_types_df, "C1_post_type_classification.csv")
save_table(quotes_df, "C1_dispatch_and_related_language_evidence_quotes.csv")

type_by_year = (post_types_df.groupby(["year", "post_type"]).size()
                .unstack(fill_value=0))
type_by_year_share = type_by_year.div(type_by_year.sum(axis=1), axis=0)
save_table(type_by_year.reset_index(), "C1_post_type_counts_by_year.csv")
save_table(type_by_year_share.reset_index(), "C1_post_type_share_by_year.csv")

# --- Chart C1a: post-type mix over time (stacked share)
TYPE_ORDER = ["hourly-type dispatch", "rebate-type dispatch", "student/summer",
              "short-term", "regular/unspecified"]
TYPE_COLOR = dict(zip(TYPE_ORDER, [PAL["orange"], PAL["yellow"], PAL["aqua"],
                                    PAL["magenta"], PAL["blue"]]))
years = type_by_year_share.index.values
fig, ax = plt.subplots(figsize=(9.2, 5.2))
bottom = np.zeros(len(years))
for t in TYPE_ORDER:
    vals = type_by_year_share[t].values if t in type_by_year_share else np.zeros(len(years))
    ax.bar(years, vals, bottom=bottom, width=0.7, color=TYPE_COLOR[t], label=t, zorder=3)
    bottom += vals
style_ax(ax, title="fskzpw.com 招聘帖类型构成的变化（按标题/摘要及未污染正文分类，2010-2026）",
         ylabel="占当年帖子数的比例")
ax.set_ylim(0, 1.02)
ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), fontsize=8.6, frameon=False)
savefig(fig, "C1_post_type_mix_over_time.png",
        note="分类规则：帖子标注有小时工价->\"小时工型派遣\"；否则标注有返费->\"返费型派遣\"；否则标题/摘要含学生工/暑假工等关键词->\"学生/暑期工\"；否则含日结/临时工等->\"短期工\"；否则归为\"正规/未注明\"（含真正的正式工招聘，也含未明确说明用工性质的帖子，二者在标题/摘要层面无法可靠区分）。2019年之前帖子基本没有公开价格字段，\"返费/小时工\"型分类主要从2019(返费)、2021(小时工)年才开始出现，与说明sheet的记录一致。年帖子数样本量小（多数年份<30篇），年度占比会有较大波动。")

# --- Chart C1b: raw counts (shows sample-size context the share chart hides)
fig, ax = plt.subplots(figsize=(9.2, 4.6))
bottom = np.zeros(len(years))
for t in TYPE_ORDER:
    vals = type_by_year[t].values if t in type_by_year else np.zeros(len(years))
    ax.bar(years, vals, bottom=bottom, width=0.7, color=TYPE_COLOR[t], label=t, zorder=3)
    bottom += vals
style_ax(ax, title="fskzpw.com 招聘帖数量：按类型分层（2010-2026）", ylabel="帖子数")
ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), fontsize=8.6, frameon=False)
savefig(fig, "C1_post_type_counts_over_time.png",
        note="同一分类规则的绝对帖子数视图，用于判断上一张占比图中哪些年份的比例是基于很小的样本（例如2010、2024年样本量个位数，占比容易失真）。")

n_dispatch_lang = quotes_df[quotes_df["keyword_type"] == "dispatch"]["文章ID"].nunique()
n_direct_lang = quotes_df[quotes_df["keyword_type"] == "direct_hire_language"]["文章ID"].nunique()
print(f"  {n_dispatch_lang} posts mention dispatch-indicating language (派遣/同工同酬/差价等)")
print(f"  {n_direct_lang} posts mention direct-hire marketing language (直招/正式工等)")

# =====================================================================
# C2. Recruitment trends vs. seasonality, insurance enrollment, third-party data
# =====================================================================
print("\nC2. Recruitment vs. seasonality / insurance / third-party data")

monthly_posts = post_types_df.groupby(post_types_df["日期"].dt.to_period("M")).size().rename("帖子数_逐帖").to_frame()
monthly_dispatch_share = (
    post_types_df.assign(is_dispatch=post_types_df["post_type"].isin(
        ["hourly-type dispatch", "rebate-type dispatch"]))
    .groupby(post_types_df["日期"].dt.to_period("M"))["is_dispatch"].mean()
    .rename("派遣型占比_当月")
)
c2 = monthly_panel.copy()
c2["年月_period"] = pd.to_datetime(c2["年月"]).dt.to_period("M")
c2 = c2.merge(monthly_dispatch_share.rename_axis("年月_period"), on="年月_period", how="left")
save_table(c2.drop(columns=["年月_period"]), "C2_monthly_recruitment_automation_emissions_panel.csv")

annual_recruit_type = type_by_year_share.copy()
annual_recruit_type["帖子数"] = type_by_year.sum(axis=1)
annual_summary = annual_recruit_type.merge(
    insured_annual_total.rename("参保人数合计").reset_index().rename(columns={"年份": "year"}),
    on="year", how="left")
save_table(annual_summary.reset_index(), "C2_annual_dispatch_post_share_vs_insured_workers.csv")

# --- Chart C2a: three stacked single-axis panels sharing a time axis (no dual-axis)
fig, axes = plt.subplots(3, 1, figsize=(9.4, 8.6), sharex=True,
                          gridspec_kw=dict(height_ratios=[1.1, 1, 1], hspace=0.35))
c2_plot = c2.copy()
c2_plot["date"] = pd.to_datetime(c2_plot["年月"])

ax = axes[0]
ax.bar(c2_plot["date"], c2_plot["帖子数"], width=20, color=PAL["muted"], alpha=0.55,
       label="月度招聘帖数（全部类型）", zorder=2)
ax.plot(c2_plot["date"], c2_plot["帖子数"] * c2_plot["派遣型占比_当月"], color=PAL["orange"],
        linewidth=2, marker="o", markersize=3.2, label="其中：返费/小时工型（派遣）帖数", zorder=3)
style_ax(ax, title="月度招聘帖数量与派遣型占比 vs. 自动化/环评事件、参保人数下降", ylabel="帖子数/月")
ax.legend(loc="upper left", fontsize=8, frameon=False)

ax = axes[1]
ax.plot(c2_plot["date"], c2_plot["招工返费_最高（元）"], color=PAL["red"], linewidth=1.8,
        marker="o", markersize=3, label="招工返费·当月最高（元）")
style_ax(ax, ylabel="返费（元）")
ax.legend(loc="upper left", fontsize=8, frameon=False)

ax = axes[2]
ax.plot(c2_plot["date"], c2_plot["小时工_最高时薪（元）"], color=PAL["aqua"], linewidth=1.8,
        marker="o", markersize=3, label="小时工·当月最高时薪（元/时）")
style_ax(ax, ylabel="元/时", xlabel="年月")
ax.legend(loc="upper left", fontsize=8, frameon=False)

for yr, row in insured_annual_total.items():
    axes[0].axvline(pd.Timestamp(f"{yr}-01-01"), color=PAL["grid"], linewidth=0.7, zorder=1)
savefig(fig, "C2_monthly_recruitment_intensity_and_pricing.png",
        note="数据来源：自动化_环评设备定员产能面板与月度时间线\"月度面板\"（帖子数、返费、时薪均逐帖数据按月归并，仅2019年后有公开价格）；派遣型占比=当月返费/小时工型帖子数占该月全部帖子数比例（用C1分类结果按月重算）。竖向浅灰参考线=每年1月，便于观察招工旺季（通常在年中至年末冲量前）。返费与时薪在2021-2022年（自动化升级密集期，见月度事件时间线）走高，随后随富联裕展环评定员大幅削减而在2023年回落，2024-2025年旺季再度走高，与CLW描述的\"旺季返费/时薪走高\"一致。")

# --- Chart C2b: annual dispatch-type post share vs insured-worker decline, indexed to
# a common base (2019=100) on ONE shared axis - avoids a dual-axis chart entirely.
fig, ax = plt.subplots(figsize=(8.8, 5.0))
yrs = annual_summary["year"].values
dispatch_share_annual = (annual_recruit_type.get("hourly-type dispatch", 0) +
                          annual_recruit_type.get("rebate-type dispatch", 0)).reindex(yrs)
insured_series = insured_annual_total.reindex(yrs)
base_year = 2019
dispatch_idx = 100 * dispatch_share_annual / dispatch_share_annual.loc[base_year]
insured_idx = 100 * insured_series / insured_series.loc[base_year]
ax.plot(yrs, dispatch_idx.values, marker="o", markersize=5, linewidth=2.2, color=PAL["orange"],
        label="招聘帖\"派遣型\"（返费+小时工）占比，指数化", zorder=3)
ax.plot(yrs, insured_idx.values, marker="s", markersize=5, linewidth=2.2, color=PAL["blue"],
        label="工伤保险参保人数合计，指数化", zorder=3)
ax.axhline(100, color=PAL["axis"], linewidth=1)
ax.text(yrs.min(), 103, f"{base_year}年 = 100", fontsize=8, color=PAL["muted"])
style_ax(ax, title="招聘帖\"派遣型\"占比上升 vs. 工伤保险参保人数下降（指数化，2019=100）",
         ylabel=f"指数（{base_year}=100）")
ax.legend(loc="upper left", fontsize=8.6, frameon=False)
savefig(fig, "C2_dispatch_post_share_vs_insured_decline.png",
        note="两个序列量级和单位完全不同（占比0-1 vs 人数万级），改为各自以2019年为基准=100指数化后放在同一张单轴图上比较趋势方向，不代表二者存在计量意义上的比例或因果关系。招聘帖样本量小（多数年份<30篇），派遣型占比的年度波动本身也需谨慎解读（见C1图）；insured worker 与 recruitment-ad 派遣占比走势相反，与CLW\"直招转向派遣公司输送\"的定性描述方向一致，属于中等强度的佐证。")







