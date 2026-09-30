"""
Foxconn Zhengzhou labor data analysis.

Answers the research questions in LABOR_DATA.md (A1-A3, B1-B2, C1-C2) using the
source workbooks listed in 00_文件说明.md. Reads existing files only; writes all
output (tidy tables, draft charts, memo) into ./labor_analysis_output/.

Run (from project root): python3 scripts/labor_data.py
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

BASE = Path(__file__).resolve().parent.parent  # project root (scripts/ lives one level down)
RAW = BASE / "data" / "原始文件_抓取数据"
OUT = BASE / "outputs" / "labor_analysis_output"
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
F_INSURED = BASE / "data" / "labor" / "用工_富士康郑州四家实体社保参保人数_2016-2025.xlsx"
F_MEDIA = BASE / "data" / "labor" / "用工_媒体与NGO调查劳工数据_2015-2025.xlsx"
F_AUTOMATION = BASE / "data" / "automation" / "自动化_环评设备定员产能面板与月度时间线_2010-2026.xlsx"
F_DISPATCH_CO = BASE / "data" / "labor" / "用工_派遣公司参保人数与法院记录_2016-2025.xlsx"
F_RECRUIT_WAGE = BASE / "data" / "labor" / "用工_招聘帖返费小时工价与底薪_2010-2026.xlsx"
F_REVELIO = BASE / "data" / "labor" / "用工_Revelio职业档案与招聘帖_2008-2026.xlsx"
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
ax.text(len(xs) - 0.55, LEGAL_CAP_PCT + 1.5, "Legal cap 10%", color=PAL["red"], fontsize=9,
        ha="right")
ax.set_ylim(0, 68)
style_ax(ax, title="Dispatch share of total workforce: CLW surveys vs. Labor Contract Law cap",
         ylabel="Share (%)")
savefig(fig, "A2_dispatch_share_vs_legal_cap.png",
        note="Source: China Labor Watch 2019 and 2025 reports (interview/fieldwork estimates, not a full-plant census). China's Labor Contract Law caps dispatch (agency) labor at 10% of total workforce.")

# --- Chart A2b: counted insured workers vs. CLW's estimated workforce (2025)
# One shared x-axis so the numbers can be compared directly.
#   Top row    = counted (annual-report insured headcount): solid fill.
#   Bottom row = CLW survey estimate, peak season: light hatched fill + range whiskers.
# Same hue = same group of workers: blue = regular / insured, orange = dispatch.
ins_by_ent = insured_long[insured_long["年份"] == 2025].set_index("实体")["工伤保险参保人数"]
airport_ins = ins_by_ent[["鸿富锦精密电子（郑州）", "富联裕展科技（河南）", "河南富驰科技"]].sum()
edz_ins = ins_by_ent["富联精密电子（郑州）"]
REG = (60000, 80000); DIS = (80000, 110000); TOT = (150000, 200000)
reg_mid, dis_mid = sum(REG) / 2, sum(DIS) / 2

C_REG, C_DIS = PAL["blue"], PAL["orange"]
LIGHT_REG, LIGHT_DIS = "#bcd4f2", "#f8c9b4"
fig, ax = plt.subplots(figsize=(10, 4.6))
H = 0.46
Y_REC, Y_CLW = 1.0, 0.0

# counted row
ax.barh(Y_REC, airport_ins, height=H, color=C_REG, edgecolor=PAL["surface"], linewidth=2, zorder=3)
ax.barh(Y_REC, edz_ins, left=airport_ins, height=H, color=C_REG, alpha=0.45,
        edgecolor=PAL["surface"], linewidth=2, zorder=3)
ax.text(airport_ins / 2, Y_REC, f"Airport Zone\n{airport_ins:,.0f}", ha="center", va="center",
        fontsize=9, color="white", fontweight="bold", zorder=5)
ax.text(airport_ins + edz_ins + 2500, Y_REC,
        f"+ {edz_ins:,.0f} FII Precision (Econ. Dev. Zone)\n= {airport_ins + edz_ins:,.0f} insured, all four entities",
        ha="left", va="center", fontsize=8.6, color=PAL["ink2"])

# estimate row (midpoints) + whiskers for the ranges
ax.barh(Y_CLW, reg_mid, height=H, color=LIGHT_REG, hatch="///", edgecolor=PAL["surface"],
        linewidth=2, zorder=3)
ax.barh(Y_CLW, dis_mid, left=reg_mid, height=H, color=LIGHT_DIS, hatch="///",
        edgecolor=PAL["surface"], linewidth=2, zorder=3)
for b in ax.patches[-2:]:
    b._hatch_color = (1, 1, 1, 0.9)
ax.text(reg_mid / 2, Y_CLW, f"Regular workers\n~{reg_mid/1e3:.0f}k (60–80k)", ha="center",
        va="center", fontsize=9, color=PAL["ink"], fontweight="bold", zorder=5)
ax.text(reg_mid + dis_mid / 2, Y_CLW, f"Dispatch workers\n~{dis_mid/1e3:.0f}k (80–110k)",
        ha="center", va="center", fontsize=9, color=PAL["ink"], fontweight="bold", zorder=5)

def whisker(x0, x1, y, label=None):
    ax.plot([x0, x1], [y, y], color=PAL["ink2"], lw=1.2, zorder=6)
    for x in (x0, x1):
        ax.plot([x, x], [y - 0.06, y + 0.06], color=PAL["ink2"], lw=1.2, zorder=6)
    if label:
        ax.text((x0 + x1) / 2, y - 0.1, label, ha="center", va="top", fontsize=8.4, color=PAL["ink2"])

whisker(*REG, Y_CLW - H / 2 - 0.07, "regular 60–80k")
whisker(*TOT, Y_CLW - H / 2 - 0.07, f"CLW total 150–200k\n(bar: {reg_mid/1e3:.0f}k + {dis_mid/1e3:.0f}k = {(reg_mid+dis_mid)/1e3:.0f}k)")

# guide lines: the counted insured number, dropped onto the estimate row
for x in (airport_ins, airport_ins + edz_ins):
    ax.plot([x, x], [Y_REC - H / 2, Y_CLW + H / 2], color=PAL["ink2"], lw=0.9, ls=(0, (3, 3)), zorder=4)
ax.annotate("Counted insured workers ≈ CLW's regular-worker estimate.\n"
            f"The rest of the line (~{dis_mid/1e3:.0f}k, ~{dis_mid/(reg_mid+dis_mid)*100:.0f}%) are dispatch workers,\n"
            "who are not on Foxconn's own insurance records.",
            xy=(reg_mid + dis_mid, Y_CLW + H / 2), xytext=(reg_mid + dis_mid + 6000, 0.62),
            fontsize=8.8, color=PAL["ink"], ha="left", va="center",
            arrowprops=dict(arrowstyle="-", color=PAL["muted"], lw=0.8))

ax.set_yticks([Y_REC, Y_CLW])
ax.set_yticklabels(["Counted\n(annual reports,\ninsured headcount)", "Estimated\n(CLW survey,\n2025 peak season)"],
                   fontsize=9.2, color=PAL["ink"])
ax.set_xlim(0, 262000)
ax.set_ylim(-0.72, 1.45)
ax.xaxis.set_major_formatter(lambda v, _: f"{v/1e3:.0f}k" if v else "0")
ax.grid(True, axis="x", linewidth=0.6); ax.grid(False, axis="y")
ax.tick_params(axis="y", length=0)
ax.set_xlabel("Workers", fontsize=9.5)
ax.set_title("2025: the insured headcount matches CLW's regular-worker estimate — most of the line is dispatch labor",
             loc="left", pad=26)
ax.text(0, 1.03, "Solid = counted in official records; light hatched + whiskers = survey estimate (bar = midpoint, whisker = range). "
                 "Blue = regular / insured, orange = dispatch.",
        transform=ax.transAxes, fontsize=8.6, color=PAL["ink2"], ha="left", va="bottom")
savefig(fig, "A2_insured_vs_CLW_2025_snapshot.png",
        note="Counted: 2025 annual-report work-injury-insurance headcount (direct employees only). CLW covers the Airport Zone campus, so the solid Airport Zone bar "
             "(Hongfujin + FII Yuzhan + Henan Fuchi) is the like-for-like comparison; FII Precision (Economic Development Zone) is shown lighter. "
             "Estimated: China Labor Watch 2025, interview survey March-September 2025 (102 workers), peak-season ranges, not a census; bars use range midpoints. "
             "The insured count sitting at or just below CLW's 60-80k regular-worker range is consistent evidence, not proof on the same statistical basis.")

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
        linewidth=2, color=PAL["blue"], label="Insured workers (4 entities combined)")
ax.plot(rev_annual["年份"], rev_annual["Revelio估计人数"], marker="s", markersize=4,
        linewidth=2, color=PAL["violet"], label="Revelio estimated headcount (Zhengzhou, weighted)")
ax.plot(rev_annual["年份"], rev_annual["原始档案数"], marker="^", markersize=4,
        linewidth=1.4, linestyle="--", color=PAL["violet"], alpha=0.6, label="Revelio raw profile count (unweighted)")
ax.axhspan(150000, 300000, color=PAL["muted"], alpha=0.12, zorder=0)
ax.text(2008.3, 200000, "CLW total-workforce estimate range (peak season, illustrative)", fontsize=7.8, color=PAL["ink2"])
ax.set_yscale("log")
style_ax(ax, title="Revelio's estimated Zhengzhou Hon Hai headcount vs. insured workers vs. actual total workforce (2008-2025)",
         ylabel="Number of workers (log scale)")
ax.legend(loc="upper right", fontsize=8.3, frameon=False)
savefig(fig, "A3_revelio_coverage_vs_reality.png",
        note="Revelio (sampled from public professional profiles such as LinkedIn plus job postings, reweighted) barely moves year to year - it shows no dip for the 2022 COVID lockdown crisis or peak-season hiring surges, suggesting the series is mostly interpolated/backfilled rather than a real annual count. It also covers mainly white-collar/engineering roles; frontline production, dispatch, and student workers are largely absent from the sample. Coverage is roughly 8,100 / (150,000-300,000) = 3-5%.")

# --- Chart A3b: Revelio 2025 role composition (mostly office-adjacent categories)
roles = revelio_roles_2025.sort_values("人数", ascending=True)
fig, ax = plt.subplots(figsize=(7.6, 4.6))
ax.barh(roles["role_k10"], roles["人数"], color=PAL["violet"])
style_ax(ax, title="Revelio, June 2025: role composition of Zhengzhou Hon Hai profiles", xlabel="Estimated headcount (weighted)")
savefig(fig, "A3_revelio_role_composition_2025.png",
        note="Roles are Revelio's own role_k10 model labels; 'unknown' is the largest category, and 'Technician' does not equal a factory-line production worker. The sample still skews toward office/engineer/service-type white-collar and technical roles, illustrating what this data source can and cannot represent - it is not used here to estimate factory workforce size.")

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

SCENARIO_EN = {
    "淡季（加班约52小时）": "Low season\n(~52h OT)",
    "旺季一般（每周6天×10小时，加班约87小时）": "Peak season, typical\n(6d x 10h/wk, ~87h OT)",
    "旺季高峰（加班约130小时）": "Peak season, extreme\n(~130h OT)",
}

# --- Chart B1a: pretax monthly income, regular vs. hourly-type dispatch, by season
m = month_scn[month_scn["情景"] != "自定义"].copy()
fig, ax = plt.subplots(figsize=(7.8, 4.8))
xw = np.arange(len(m))
w = 0.32
b1 = ax.bar(xw - w / 2, m["正式工_税前（元）"].astype(float), width=w, color=PAL["blue"],
            label="Regular worker - pretax (RMB/month)", zorder=3)
b2 = ax.bar(xw + w / 2, m["派遣工_税前（元）"].astype(float), width=w, color=PAL["orange"],
            label="Hourly-type dispatch - pretax (RMB/month)", zorder=3)
for bars in (b1, b2):
    for b in bars:
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 60, f"{b.get_height():,.0f}",
                ha="center", fontsize=8.3)
ax.set_xticks(xw)
ax.set_xticklabels([SCENARIO_EN.get(s, str(s)) for s in m["情景"]], fontsize=8.6)
style_ax(ax, title="Regular vs. hourly-type dispatch: pretax monthly income, same season", ylabel="RMB/month")
ax.legend(loc="upper left", fontsize=8.6, frameon=False)
savefig(fig, "B1_income_scenarios_regular_vs_dispatch.png",
        note="Source: the income calculator in the media/NGO labor-data workbook (default parameters from CLW's 2025 report pp.15-18 and Labor Law overtime rules). Dispatch pay is higher pretax because the blended hourly rate carries no overtime multiplier and no social-insurance deduction (one fewer cost item) - but the 'take-home now' amount is lower (about RMB13/hour of the rate is a deferred 'price gap' paid at the end of the following month, contingent on still being employed on the 25th; leaving early forfeits or discounts it), and dispatch workers get no social insurance, no paid sick leave, and no 1.5x/2x/3x weekday/weekend/holiday overtime multipliers that regular workers get in the same season.")

# --- Chart B1b: dispatch/regular pretax ratio + take-home vs deferred split
fig, ax = plt.subplots(figsize=(7.4, 4.6))
ratio = m["派遣工÷正式工（税前）"].astype(float)
ax.bar(xw, ratio, width=0.45, color=PAL["aqua"], zorder=3)
for i, v in enumerate(ratio):
    ax.text(i, v + 0.02, f"{v:.2f}×", ha="center", fontsize=9)
ax.axhline(1.0, color=PAL["axis"], linewidth=1)
ax.set_xticks(xw)
ax.set_xticklabels([SCENARIO_EN.get(s, str(s)) for s in m["情景"]], fontsize=8.6)
style_ax(ax, title="Hourly-type dispatch pretax income / regular-worker pretax income (same season, same hours)", ylabel="Ratio")
savefig(fig, "B1_dispatch_regular_pretax_ratio.png",
        note="A ratio > 1 does not mean dispatch workers are overall better off: the regular-worker figure has social insurance already deducted, while the dispatch figure has no social insurance or housing-fund personal contribution deducted (dispatch workers have none to begin with), and the dispatch worker's 'price-gap' portion (roughly half the hourly rate) is held back a month and is forfeited or discounted if the worker leaves before the 25th (see the 'loss on leaving' row in the B1 pay-structure table).")

# --- Chart B1c: how each worker type's pay is calculated + working hours (2025)
# Inputs come from the calculator sheet (yellow cells) so the chart stays in sync with it;
# the other figures are CLW 2025 (pp.13-18) values recorded in the 劳工数据 sheet.
def _calc_input(row_label, default):
    hit = calc_raw[calc_raw[0].astype(str).str.startswith(row_label)]
    try:
        return float(hit.iloc[0, 1])
    except Exception:
        return default

BASE_PAY = _calc_input("正式普工底薪", 2100)          # RMB/month, full-time general worker
PAY_DAYS = _calc_input("月计薪天数", 21.75)
STD_H = _calc_input("日标准工时", 8)
SI_PERSONAL = _calc_input("正式工社保个人缴费", 348)  # RMB/month
HOURLY_ALLIN = _calc_input("派遣工综合时薪", 25)      # RMB/h, hourly-type dispatch
HOURLY_PAID_NOW = _calc_input("其中按月发放的基本时薪", 12)
HOURLY_DEFERRED = HOURLY_ALLIN - HOURLY_PAID_NOW
REBATE = 9800             # RMB, Aug 2025 (Jul 4,800; Jun 0) - CLW 2025
REBATE_DAYS = 90

# Typical peak-season month (calculator row "旺季一般"): 6 days x 10 h/week
H_REG, H_OT_WD, H_OT_RD = 174.0, 43.5, 43.3
H_TOT = H_REG + H_OT_WD + H_OT_RD
rate = BASE_PAY / PAY_DAYS / STD_H
ft_parts = [("reg", H_REG * rate), ("ot", H_OT_WD * rate * 1.5), ("ot", H_OT_RD * rate * 2)]
ft_total = sum(v for _, v in ft_parts)
rb_parts = [("reg", H_REG * rate), ("ot", H_OT_WD * rate * 1.5 + H_OT_RD * rate * 2),
            ("rebate", REBATE / 3)]
rb_total = sum(v for _, v in rb_parts)
hr_parts = [("reg", H_TOT * HOURLY_PAID_NOW), ("deferred", H_TOT * HOURLY_DEFERRED)]
hr_total = sum(v for _, v in hr_parts)

# Same thing for one peak-season WEEK (calculator row "旺季一周": 6 days x 10 h = 60 h),
# used in panel A because readers think in 40-hour weeks.
WH_REG, WH_OT_WD, WH_OT_RD = 40.0, 10.0, 10.0
WH_TOT = WH_REG + WH_OT_WD + WH_OT_RD
WEEKS_REBATE = 13                      # 90 days ~ 13 weeks
SI_WEEK = SI_PERSONAL * 12 / 52
wft = [("reg", WH_REG * rate), ("ot", WH_OT_WD * rate * 1.5), ("ot", WH_OT_RD * rate * 2)]
wft_total = sum(v for _, v in wft)
wrb = [("reg", WH_REG * rate), ("ot", WH_OT_WD * rate * 1.5 + WH_OT_RD * rate * 2),
       ("rebate", REBATE / WEEKS_REBATE)]
wrb_total = sum(v for _, v in wrb)
whr = [("reg", WH_TOT * HOURLY_PAID_NOW), ("deferred", WH_TOT * HOURLY_DEFERRED)]
whr_total = sum(v for _, v in whr)

pay_calc = pd.DataFrame([
    dict(worker="Full-time (insured)", component="Regular hours", hours=H_REG, rate=rate, rmb=H_REG * rate, conditional=False),
    dict(worker="Full-time (insured)", component="Weekday overtime x1.5", hours=H_OT_WD, rate=rate * 1.5, rmb=H_OT_WD * rate * 1.5, conditional=False),
    dict(worker="Full-time (insured)", component="Rest-day overtime x2", hours=H_OT_RD, rate=rate * 2, rmb=H_OT_RD * rate * 2, conditional=False),
    dict(worker="Full-time (insured)", component="Social insurance (personal)", hours=np.nan, rate=np.nan, rmb=-SI_PERSONAL, conditional=False),
    dict(worker="Dispatch - rebate type", component="Base + overtime (legal rates assumed)", hours=H_TOT, rate=np.nan, rmb=rb_parts[0][1] + rb_parts[1][1], conditional=False),
    dict(worker="Dispatch - rebate type", component=f"Rebate {REBATE:,} / 3 months", hours=np.nan, rate=np.nan, rmb=REBATE / 3, conditional=True),
    dict(worker="Dispatch - hourly type", component=f"Paid monthly {HOURLY_PAID_NOW:.0f}/h x all hours", hours=H_TOT, rate=HOURLY_PAID_NOW, rmb=hr_parts[0][1], conditional=False),
    dict(worker="Dispatch - hourly type", component=f"Deferred wage difference {HOURLY_DEFERRED:.0f}/h", hours=H_TOT, rate=HOURLY_DEFERRED, rmb=hr_parts[1][1], conditional=True),
])
save_table(pay_calc.round(1), "B1c_pay_calculation_peak_month_2025.csv")

from matplotlib.patches import Patch, Rectangle
C_REGPAY, C_OT, C_DEF, C_REB = PAL["blue"], PAL["aqua"], PAL["orange"], PAL["yellow"]
GREY_LOST = "#c9c8c2"
fig = plt.figure(figsize=(14, 11.5))
gs = fig.add_gridspec(2, 2, height_ratios=[3.0, 2.2], hspace=0.5, wspace=0.42,
                      left=0.13, right=0.97, top=0.845, bottom=0.10)
axA = fig.add_subplot(gs[0, :]); axB = fig.add_subplot(gs[1, 0]); axC = fig.add_subplot(gs[1, 1])

# ---------------- A. monthly pay, component by component ----------------
rows = [("Full-time\n(insured)", wft),
        ("Dispatch\nrebate type", wrb),
        ("Dispatch\nhourly type", whr)]
COL = {"reg": C_REGPAY, "ot": C_OT, "deferred": C_DEF, "rebate": C_REB}
SEG_TXT = {
    0: [f"{WH_REG:.0f} h × ¥{rate:.2f}\n¥{wft[0][1]:,.0f}",
        f"Weekday OT {WH_OT_WD:.0f} h\n× ¥{rate*1.5:.2f}\n¥{wft[1][1]:,.0f}",
        f"Rest-day OT {WH_OT_RD:.0f} h\n× ¥{rate*2:.2f}\n¥{wft[2][1]:,.0f}"],
    1: [f"{WH_REG:.0f} h × ¥{rate:.2f}\n¥{wrb[0][1]:,.0f}",
        f"OT* {WH_OT_WD:.0f} h × ¥{rate*1.5:.2f}\n+ {WH_OT_RD:.0f} h × ¥{rate*2:.2f}\n¥{wrb[1][1]:,.0f}",
        f"Rebate ¥{REBATE:,} ÷ {WEEKS_REBATE} wks\n¥{wrb[2][1]:,.0f}"],
    2: [f"{WH_REG:.0f} h + OT {WH_OT_WD + WH_OT_RD:.0f} h\n× ¥{HOURLY_PAID_NOW:.0f}\n¥{whr[0][1]:,.0f}",
        f"{WH_TOT:.0f} h × ¥{HOURLY_DEFERRED:.0f} deferred = ¥{whr[1][1]:,.0f}\npaid at the end of next month,\nonly if still employed on the 25th"],
}
END_TXT = [f"¥{wft_total:,.0f}  (¥{wft_total - SI_WEEK:,.0f} after social insurance)",
           f"≈ ¥{wrb_total:,.0f}",
           f"¥{whr_total:,.0f}  (flat ¥{HOURLY_ALLIN:.0f}/h, overtime too)"]
H = 0.58
for i, (lab, parts) in enumerate(rows):
    y = len(rows) - 1 - i
    left = 0
    for j, (kind, v) in enumerate(parts):
        conditional = kind in ("deferred", "rebate")
        ax_b = axA.barh(y, v, left=left, height=H, color=COL[kind], edgecolor=PAL["surface"],
                        linewidth=2, zorder=3, hatch="///" if conditional else None,
                        alpha=0.75 if conditional else 1.0)
        txt_col = PAL["ink"] if kind in ("ot", "rebate", "deferred") else "white"
        axA.text(left + v / 2, y, SEG_TXT[i][j], ha="center", va="center", fontsize=8.4,
                 color=txt_col, zorder=5, linespacing=1.15,
                 bbox=dict(boxstyle="round,pad=0.2", fc=PAL["surface"], ec="none", alpha=0.8)
                 if conditional else None)
        left += v
    axA.text(left + 25, y, END_TXT[i], ha="left", va="center", fontsize=8.8, color=PAL["ink"])
axA.set_yticks(range(len(rows)))
axA.set_yticklabels([r[0] for r in rows][::-1], fontsize=9.8)
axA.tick_params(axis="y", length=0)
axA.set_xlim(0, 2150)
axA.xaxis.set_major_formatter(lambda v, _: f"¥{v:,.0f}")
axA.grid(True, axis="x", linewidth=0.6); axA.grid(False, axis="y")
axA.text(0, -0.1,
         "Overtime rates (Labor Law art. 44): weekday evenings, 2 h × 5 days, are paid ×1.5; the 6th day is a rest day, paid ×2. "
         "The law also allows a day off later instead of ×2;\nCLW doesn't say which Foxconn uses, so ×2 is assumed. "
         "The hourly-type dispatch worker gets the same flat ¥25/h for every hour, with no overtime rate.",
         transform=axA.transAxes, ha="left", va="top", fontsize=8.8, color=PAL["ink2"])
axA.set_title("A. Pay for one peak-season week: 40 regular + 20 overtime hours = 60 h",
              loc="left", pad=44)
axA.legend(handles=[Patch(color=C_REGPAY, label="Hours pay"),
                    Patch(color=C_OT, label="Overtime pay (×1.5 weekday, ×2 rest day)"),
                    Patch(facecolor=C_DEF, alpha=0.75, hatch="///", edgecolor=PAL["surface"], label="Deferred (lost if you quit before the 25th)"),
                    Patch(facecolor=C_REB, alpha=0.75, hatch="///", edgecolor=PAL["surface"], label=f"Rebate after {REBATE_DAYS} days (spread per week)")],
           loc="lower left", bbox_to_anchor=(0.0, 1.0), ncol=4, frameon=False, fontsize=9)

# ---------------- B. what you actually get if you leave after 2 months ----------------
two = [("Full-time", 2 * ft_total, 0, ""),
       ("Rebate type", 2 * (rb_parts[0][1] + rb_parts[1][1]), REBATE, ""),
       ("Hourly type", 2 * hr_parts[0][1], 2 * hr_parts[1][1], "")]
for i, (lab, got, lost, note) in enumerate(two):
    y = len(two) - 1 - i
    axB.barh(y, got, height=0.55, color=C_REGPAY, edgecolor=PAL["surface"], linewidth=2, zorder=3)
    if lost:
        axB.barh(y, lost, left=got, height=0.55, color=GREY_LOST, hatch="xx",
                 edgecolor=PAL["surface"], linewidth=2, zorder=3)
    axB.text(got / 2, y, f"¥{got:,.0f}", ha="center", va="center", fontsize=8.8,
             color="white", fontweight="bold", zorder=5)
    axB.text(got + lost + 250, y, f"−¥{lost:,.0f} lost" if lost else "",
             ha="left", va="center", fontsize=8.2, color=PAL["ink2"])
axB.set_yticks(range(len(two)))
axB.set_yticklabels([t[0] for t in two][::-1], fontsize=9.5)
axB.tick_params(axis="y", length=0)
axB.set_xlim(0, 21000)
axB.xaxis.set_major_locator(plt.MultipleLocator(5000))
axB.xaxis.set_major_formatter(lambda v, _: f"¥{v/1e3:.0f}k" if v else "0")
axB.grid(True, axis="x", linewidth=0.6); axB.grid(False, axis="y")
axB.set_title("B. Quitting after 2 months: total pay kept vs. lost (2 months combined)", loc="left", pad=10, fontsize=11.5)

# ---------------- C. monthly working hours vs. the legal limit ----------------
# Weekly hours. CLW gives monthly hours (174 regular + overtime) for the seasons; converted
# to weekly with 52/12 = 4.33 weeks per month. Heaviest shifts: CLW says some work 75 h/week
# (and >300 h/month in Aug-Sep 2025, i.e. >69 h/week).
WPM = 52 / 12
hrs = [("Off-season", (174 + 52) / WPM, (174 + 84) / WPM, ""),
       ("Peak season", (174 + 65) / WPM, (174 + 130) / WPM, ""),
       ("Heaviest shifts\nAug–Sep 2025", 300 / WPM, 75, "")]
for i, (lab, lo_h, hi_h, note) in enumerate(hrs):
    y = len(hrs) - 1 - i
    axC.barh(y, hi_h - lo_h, left=lo_h, height=0.5, color=PAL["red"], alpha=0.85, zorder=3)
    axC.text(hi_h + 0.8, y, f"{lo_h:.0f}–{hi_h:.0f} h",
             ha="left", va="center", fontsize=8.3, color=PAL["ink2"])
for x, lab in [(40, "standard\n40 h"), (40 + 36 / WPM, "legal max\n≈48 h")]:
    axC.axvline(x, color=PAL["ink2"], lw=1.1, ls=(0, (4, 3)), zorder=2)
    axC.text(x, len(hrs) - 0.45, lab, ha="center", va="bottom", fontsize=8, color=PAL["ink2"])
axC.axvspan(40 + 36 / WPM, 82, color=PAL["red"], alpha=0.05, zorder=0)
axC.set_yticks(range(len(hrs)))
axC.set_yticklabels([h[0] for h in hrs][::-1], fontsize=9)
axC.tick_params(axis="y", length=0)
axC.set_xlim(30, 82)
axC.set_ylim(-0.6, len(hrs) + 0.1)
axC.set_xlabel("Hours per week", fontsize=9)
axC.grid(True, axis="x", linewidth=0.6); axC.grid(False, axis="y")
axC.axvline(60, color=PAL["ink"], lw=1.4, ls=(0, (1, 2)), zorder=4)
axC.text(60, -0.55, "most workers ~60 h", ha="center", va="bottom", fontsize=8, color=PAL["ink"],
         bbox=dict(boxstyle="round,pad=0.2", fc=PAL["surface"], ec="none"), zorder=5)
axC.set_title("C. Hours per week", loc="left", pad=10, fontsize=11.5)

fig.text(0.06, 0.965, "Foxconn Zhengzhou 2025: same job, three ways to get paid",
         ha="left", fontsize=15, fontweight="bold")
fig.text(0.06, 0.95, "Hatched = paid only if you stay.",
         fontsize=10, color=PAL["ink2"], ha="left")
_b1c_note = ("Source: China Labor Watch 2025; Labor Law (OT ×1.5 / ×2, cap 36 h/month ≈ 8 h/week). Weekly hours in C = CLW monthly hours ÷ 4.33. Full-time base ¥2,100 ÷ 21.75 days ÷ 8 h = ¥12.07/h. "
             "*Rebate-type overtime assumed at legal rates (CLW doesn't specify).")
fig.text(0.06, 0.02, "\n".join(textwrap.wrap(_b1c_note, 190)), fontsize=8, color=PAL["muted"], ha="left", va="bottom")
fig.savefig(CHARTS / "B1c_pay_calculation_and_hours_2025.png", bbox_inches="tight", facecolor=PAL["surface"])
plt.close(fig)
print("  chart -> B1c_pay_calculation_and_hours_2025.png")

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
        color=PAL["violet"], label="White-collar postings - median monthly pay (Revelio, non-predicted only)", zorder=4)
wc_unrel = wc_annual[~wc_annual["reliable"]]
ax.scatter(wc_unrel["年份"], wc_unrel["median_monthly_rmb"], marker="o", s=26,
           facecolor="none", edgecolor=PAL["violet"], linewidth=1.4, zorder=4,
           label="Same, but n<10 or median below minimum wage (data quality uncertain)")
fac = factory.dropna(subset=["modeled_monthly_from_hourly_rmb"])
ax.plot(fac["年份"], fac["modeled_monthly_from_hourly_rmb"], marker="s", markersize=5,
        linewidth=2.2, color=PAL["orange"],
        label=f"Dispatch hourly workers - converted at {STANDARD_HOURS_TYPICAL_MONTH}h/month (posting median hourly rate x {STANDARD_HOURS_TYPICAL_MONTH})", zorder=3)
bs = factory.dropna(subset=["底薪_最高"])
ax.plot(bs["年份"], bs["底薪_最高"], marker="^", markersize=5, linewidth=1.6, linestyle="--",
        color=PAL["blue"], label="Regular workers - posted base-pay ceiling (excludes overtime)", zorder=3)
for _, r in clw_monthly_quotes.iterrows():
    ax.plot([r["年份"], r["年份"]], [r["clw_monthly_low"], r["clw_monthly_high"]],
            color=PAL["ink2"], linewidth=3, solid_capstyle="round", zorder=5)
ax.plot([], [], color=PAL["ink2"], linewidth=3, label="CLW measured factory-worker monthly income range (low/peak season or general/skilled worker)")
style_ax(ax, title="White-collar posted pay vs. factory-worker pay: Zhengzhou (2012-2026)", ylabel="RMB/month")
ax.legend(loc="upper left", fontsize=7.6, frameon=False)
savefig(fig, "B2_whitecollar_vs_factory_pay.png",
        note="White-collar data = Revelio Zhengzhou job postings flagged 'non-model-predicted' (actual posted salary, annual/12, RMB), mostly engineer/functional roles. Hollow points = n<10 (2024, 2025) or median below the local minimum wage (the 2026 batch's salary field appears to have a unit error - annual salaries as low as ~RMB1,000 - flagged as unreliable); both are treated as data-quality uncertain. Factory data: base pay is the posted ceiling base salary, excluding overtime; 'converted monthly income' multiplies the posting median hourly rate by an assumed 'typical monthly hours' figure (226 hours, including routine overtime) - a modeled estimate, not an actual payslip; the CLW range is a measured monthly-income figure from an interview sample. The two worker types are not compared at exactly the same point in time, so this is not a strict year-over-year comparison. Overall, white-collar posted monthly pay (roughly RMB7,000-10,000) is markedly higher than factory workers' (roughly RMB2,000-7,000), but the white-collar figure is a recruiting 'asking price' while the factory figure often includes substantial overtime - the two are not on equal footing. The 2022 white-collar median's odd dip (some postings turned out to be low-wage roles like security guard/driver) also suggests Revelio's own occupation classification isn't fully clean.")


# --- Chart B2b: Revelio June-2025 role salaries vs. line workers' monthly pay (RMB/month)
# Revelio's role salaries are MODEL-PREDICTED annual USD (not payslips or postings).
# Converted at USD_CNY and /12. Line-worker pay = the B1c peak-month calculation (261 h).
USD_CNY = 7.2   # approx. 2025 average exchange rate
rv = revelio_roles_2025.copy()
rv["monthly_rmb"] = rv["人均年薪_USD"] * USD_CNY / 12
rv["label"] = rv["role_k10"].replace({"unknown": "Unknown role"})
rv = rv.sort_values("monthly_rmb")
workers = pd.DataFrame([
    dict(label="Full-time line worker (insured)", monthly_rmb=ft_total),
    dict(label="Dispatch, hourly type", monthly_rmb=hr_total),
    dict(label="Dispatch, rebate type", monthly_rmb=rb_total),
])
wc_posted_2023 = wc_annual.loc[wc_annual["年份"] == 2023, "median_monthly_rmb"]
wc_posted_2023 = float(wc_posted_2023.iloc[0]) if len(wc_posted_2023) else np.nan
b2b = pd.concat([rv.assign(group="Revelio role (modeled salary, Jun 2025)")[["group", "label", "monthly_rmb"]],
                 workers.assign(group="Line worker (CLW 2025, peak month)")], ignore_index=True)
b2b["x_full_time_worker"] = b2b["monthly_rmb"] / ft_total
save_table(b2b.round(1), "B2b_revelio_roles_vs_line_workers_2025.csv")

fig, ax = plt.subplots(figsize=(10, 7.2))
labels = list(workers["label"]) + [""] + list(rv["label"])
vals = list(workers["monthly_rmb"]) + [np.nan] + list(rv["monthly_rmb"])
cols = [PAL["blue"]] * len(workers) + [PAL["surface"]] + [PAL["violet"]] * len(rv)
ys = np.arange(len(labels))
ax.barh(ys, vals, height=0.62, color=cols, zorder=3)
for y, v in zip(ys, vals):
    if pd.notna(v):
        ax.text(v + 300, y, f"¥{v:,.0f}  ({v / ft_total:.1f}×)", va="center", fontsize=8.8, color=PAL["ink"])
if pd.notna(wc_posted_2023):
    ax.plot([wc_posted_2023] * 2, [len(workers) - 0.3, len(labels) - 0.4], color=PAL["ink2"], lw=1.2, ls=(0, (4, 3)), zorder=4)
    ax.text(wc_posted_2023 + 250, len(workers), f"salaries Foxconn actually posts (white-collar median, 2023): ¥{wc_posted_2023:,.0f}",
            fontsize=8.4, color=PAL["ink2"], va="center")
ax.set_yticks(ys)
ax.set_yticklabels(labels, fontsize=9.3)
ax.tick_params(axis="y", length=0)
ax.set_xlim(0, 42000)
ax.xaxis.set_major_formatter(lambda v, _: f"¥{v/1e3:.0f}k" if v else "0")
ax.grid(True, axis="x", linewidth=0.6); ax.grid(False, axis="y")
ax.legend(handles=[Patch(color=PAL["violet"], label="Revelio role, modeled salary (June 2025)"),
                   Patch(color=PAL["blue"], label="Line worker, peak month (CLW 2025)")],
          loc="lower right", frameon=False, fontsize=9)
ax.set_title("Revelio role salaries vs. line workers' pay, RMB per month (× = times a full-time line worker)",
             loc="left", pad=12)
fig.text(0.01, -0.02,
         f"Revelio salaries are model-predicted annual USD, converted at ¥{USD_CNY}/$ ÷ 12; for most roles they are about 2× what Foxconn actually posts (dashed line), so treat them as an upper bound.\n"
         f"Line-worker pay = one peak-season month, 261 h (see B1c); full-time = ¥{ft_total:,.0f} before social insurance. The rebate type spreads the ¥9,800 rebate over 3 months.",
         fontsize=8, color=PAL["muted"], ha="left", va="top")
fig.tight_layout()
fig.savefig(CHARTS / "B2b_revelio_roles_vs_line_workers_2025.png", bbox_inches="tight", facecolor=PAL["surface"])
plt.close(fig)
print("  chart -> B2b_revelio_roles_vs_line_workers_2025.png")

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
style_ax(ax, title="fskzpw.com: how recruitment-post types shifted over time (classified from title/summary and uncontaminated body, 2010-2026)",
         ylabel="Share of that year's posts")
ax.set_ylim(0, 1.02)
ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), fontsize=8.6, frameon=False)
savefig(fig, "C1_post_type_mix_over_time.png",
        note="Classification rule: a post with an hourly wage field -> 'hourly-type dispatch'; else with a rebate field -> 'rebate-type dispatch'; else title/summary contains keywords like student worker/summer job -> 'student/summer'; else contains keywords like day-pay/temp worker -> 'short-term'; else 'regular/unspecified' (this bucket mixes genuine regular-worker hiring with posts that never state the employment type - the two cannot be reliably separated at the title/summary level). Before 2019 almost no post carries a public price field; the rebate/hourly-type categories only start appearing from 2019 (rebate) and 2021 (hourly), consistent with the source workbook's own notes. Yearly post counts are small (fewer than 30 in most years), so year-to-year shares can swing widely.")

# --- Chart C1b: raw counts (shows sample-size context the share chart hides)
fig, ax = plt.subplots(figsize=(9.2, 4.6))
bottom = np.zeros(len(years))
for t in TYPE_ORDER:
    vals = type_by_year[t].values if t in type_by_year else np.zeros(len(years))
    ax.bar(years, vals, bottom=bottom, width=0.7, color=TYPE_COLOR[t], label=t, zorder=3)
    bottom += vals
style_ax(ax, title="fskzpw.com: recruitment-post counts by type (2010-2026)", ylabel="Number of posts")
ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1.0), fontsize=8.6, frameon=False)
savefig(fig, "C1_post_type_counts_over_time.png",
        note="Same classification, shown as raw post counts rather than a share, so it's possible to tell which years in the previous chart are based on very small samples (e.g. 2010 and 2024 have single-digit counts, so their shares are easily distorted).")

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
       label="Monthly recruitment posts (all types)", zorder=2)
ax.plot(c2_plot["date"], c2_plot["帖子数"] * c2_plot["派遣型占比_当月"], color=PAL["orange"],
        linewidth=2, marker="o", markersize=3.2, label="Of which: rebate/hourly-type (dispatch) posts", zorder=3)
style_ax(ax, title="Monthly recruitment-post volume and dispatch-type share vs. automation/EIA events, insured-worker decline", ylabel="Posts/month")
ax.legend(loc="upper left", fontsize=8, frameon=False)

ax = axes[1]
ax.plot(c2_plot["date"], c2_plot["招工返费_最高（元）"], color=PAL["red"], linewidth=1.8,
        marker="o", markersize=3, label="Recruitment rebate - monthly max (RMB)")
style_ax(ax, ylabel="Rebate (RMB)")
ax.legend(loc="upper left", fontsize=8, frameon=False)

ax = axes[2]
ax.plot(c2_plot["date"], c2_plot["小时工_最高时薪（元）"], color=PAL["aqua"], linewidth=1.8,
        marker="o", markersize=3, label="Hourly worker - monthly max rate (RMB/hour)")
style_ax(ax, ylabel="RMB/hour", xlabel="Year-month")
ax.legend(loc="upper left", fontsize=8, frameon=False)

for yr, row in insured_annual_total.items():
    axes[0].axvline(pd.Timestamp(f"{yr}-01-01"), color=PAL["grid"], linewidth=0.7, zorder=1)
savefig(fig, "C2_monthly_recruitment_intensity_and_pricing.png",
        note="Source: the 'monthly panel' in the automation/EIA-equipment-staffing-capacity workbook (post counts, rebates, and hourly rates are all per-post data aggregated by month; public prices exist only from 2019 on). Dispatch-type share = the share of that month's posts that are rebate/hourly-type (recomputed monthly from the C1 classification). Vertical light-grey reference lines = January of each year, to help spot the hiring peak season (typically ramping mid-year through year-end). Rebates and hourly rates rise in 2021-2022 (the dense automation-upgrade period, see the monthly event timeline), then fall back in 2023 as FII Yuzhan's EIA design headcount was cut sharply, then rise again in the 2024-2025 peak seasons - consistent with CLW's description of rebates/hourly rates rising in peak season.")

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
        label="Recruitment posts: dispatch-type (rebate+hourly) share, indexed", zorder=3)
ax.plot(yrs, insured_idx.values, marker="s", markersize=5, linewidth=2.2, color=PAL["blue"],
        label="Insured workers (total), indexed", zorder=3)
ax.axhline(100, color=PAL["axis"], linewidth=1)
ax.text(yrs.min(), 103, f"{base_year} = 100", fontsize=8, color=PAL["muted"])
style_ax(ax, title="Recruitment posts' dispatch-type share rising vs. insured-worker count falling (indexed, 2019=100)",
         ylabel=f"Index ({base_year}=100)")
ax.legend(loc="upper left", fontsize=8.6, frameon=False)
savefig(fig, "C2_dispatch_post_share_vs_insured_decline.png",
        note="The two series differ completely in scale and unit (a 0-1 share vs. tens of thousands of workers), so each is indexed to its own 2019=100 base and plotted on one shared single axis to compare direction of trend - this does not imply a measured proportional or causal relationship between them. Recruitment-post samples are small (fewer than 30 posts in most years), so the dispatch-type share's year-to-year swings need cautious interpretation too (see the C1 chart); insured workers trending opposite to the recruitment-ad dispatch share is directionally consistent with CLW's qualitative account of hiring shifting from direct recruitment to dispatch agencies - medium-strength corroborating evidence.")







