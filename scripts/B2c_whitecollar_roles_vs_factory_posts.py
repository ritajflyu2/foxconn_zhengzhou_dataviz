"""
B2c. Average posted monthly pay of white-collar roles (Revelio job posts, actual
employer-stated RMB salaries) vs. factory-worker monthly pay, using the SAME
peak-season pay calculation as B1c/B2b (CLW 2025 calculator, one peak month =
174 regular + 43.5 weekday-OT + 43.3 rest-day-OT hours = 261 h), so the factory
side of this chart matches the rest of the deck instead of being re-derived
from raw recruitment-post text.

Reads source files only; writes new files into labor_analysis_output/.
Run (from project root): python3 scripts/B2c_whitecollar_roles_vs_factory_posts.py
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
OUT_T = BASE / "outputs" / "labor_analysis_output" / "tables"
OUT_C = BASE / "outputs" / "labor_analysis_output" / "charts"
F_WC = BASE / "data" / "labor" / "用工_白领招聘薪资_Revelio招聘帖人民币月薪_2016-2025.xlsx"
F_MEDIA = BASE / "data" / "labor" / "用工_媒体与NGO调查劳工数据_2015-2025.xlsx"

WC_YEARS = (2021, 2023)      # most recent white-collar years with usable sample (2024-25: 7 posts)
STANDARD_HOURS = 174          # 8h x 5d x ~21.75 days, statutory standard month (white-collar basis)

ROLE_EN = {
    "项目管理": "Project management", "软件/IT/数据": "Software / IT / data",
    "测试/质量": "Testing / quality", "研发/产品/设计": "R&D / product / design",
    "采购/供应链/物流": "Procurement / supply chain", "硬件/电子/电气": "Hardware / electronics",
    "财务/法务/审计": "Finance / legal / audit", "人力资源/培训": "HR / training",
    "机械/设备/工艺/制造": "Mechanical / process eng.", "销售/市场/客户": "Sales / marketing",
    "其他": "Other white-collar",
}

# ---------------------------------------------------------------- white-collar
wc = pd.read_excel(F_WC, sheet_name="逐帖数据")
wc = wc[(wc["是否使用"] == "使用") & wc["年份"].between(*WC_YEARS)].copy()
lo = wc["月薪下限_元"].fillna(wc["月薪_元"])
hi = wc["月薪上限_元"].fillna(lo)
wc["low"], wc["high"] = lo, hi
# Bar value = the posted "salary" field (月薪_元, normally the bottom of the posted range),
# as in the source workbook. Range midpoints are not used: some posts carry implausibly wide
# bands (e.g. RMB120k-840k/yr) that would inflate the averages.
wc["mid"] = wc["月薪_元"]
wc_role = (wc.groupby("岗位类别")
             .agg(n_posts=("mid", "size"), mean_mid=("mid", "mean"), median_mid=("mid", "median"),
                  mean_low=("low", "mean"), mean_high=("high", "mean"))
             .reset_index())
wc_role["label"] = wc_role["岗位类别"].map(ROLE_EN)
wc_all = dict(label="All white-collar posts", n_posts=len(wc), mean_mid=wc["mid"].mean(),
              median_mid=wc["mid"].median(), mean_low=wc["low"].mean(), mean_high=wc["high"].mean())

# ---------------------------------------------------------------- factory pay
# Same calculator + same inputs as labor_data.py's B1c/B2b charts (one peak-season
# month: 6 days x 10 h/week -> 174 regular + 43.5 weekday-OT + 43.3 rest-day-OT h).
calc_raw = pd.read_excel(F_MEDIA, sheet_name="收入计算器_正式工vs派遣工", header=None)

def _calc_input(row_label, default):
    hit = calc_raw[calc_raw[0].astype(str).str.startswith(row_label)]
    try:
        return float(hit.iloc[0, 1])
    except Exception:
        return default

BASE_PAY = _calc_input("正式普工底薪", 2100)
PAY_DAYS = _calc_input("月计薪天数", 21.75)
STD_H = _calc_input("日标准工时", 8)
SI_PERSONAL = _calc_input("正式工社保个人缴费", 348)
HOURLY_ALLIN = _calc_input("派遣工综合时薪", 25)
HOURLY_PAID_NOW = _calc_input("其中按月发放的基本时薪", 12)
HOURLY_DEFERRED = HOURLY_ALLIN - HOURLY_PAID_NOW
REBATE = 9800

H_REG, H_OT_WD, H_OT_RD = 174.0, 43.5, 43.3
H_TOT = H_REG + H_OT_WD + H_OT_RD
rate = BASE_PAY / PAY_DAYS / STD_H
ft_total = H_REG * rate + H_OT_WD * rate * 1.5 + H_OT_RD * rate * 2
rb_total = H_REG * rate + (H_OT_WD * rate * 1.5 + H_OT_RD * rate * 2) + REBATE / 3
hr_total = H_TOT * HOURLY_PAID_NOW + H_TOT * HOURLY_DEFERRED

fac = pd.DataFrame([
    dict(label="Full-time insured line worker", n_posts=None, mean_mid=ft_total, median_mid=ft_total,
         mean_low=ft_total - SI_PERSONAL, mean_high=ft_total),
    dict(label="Dispatch, rebate type", n_posts=None, mean_mid=rb_total, median_mid=rb_total,
         mean_low=rb_total, mean_high=rb_total),
    dict(label="Dispatch, hourly type", n_posts=None, mean_mid=hr_total, median_mid=hr_total,
         mean_low=hr_total, mean_high=hr_total),
])

# ---------------------------------------------------------------- tables
FT_MEAN = ft_total
tbl = pd.concat([
    wc_role.assign(group=f"White-collar, Revelio posted salary {WC_YEARS[0]}-{WC_YEARS[1]}", hours_basis=STANDARD_HOURS),
    pd.DataFrame([wc_all]).assign(group=f"White-collar, Revelio posted salary {WC_YEARS[0]}-{WC_YEARS[1]}", hours_basis=STANDARD_HOURS),
    fac.assign(group="Factory, peak-season month (CLW 2025 calculator, same as B1c/B2b)", hours_basis=H_TOT),
], ignore_index=True)
tbl["x_fulltime_worker"] = tbl["mean_mid"] / FT_MEAN
tbl["implied_rmb_per_hour"] = tbl["mean_mid"] / tbl["hours_basis"]
tbl = tbl[["group", "label", "岗位类别", "n_posts", "mean_mid", "median_mid", "mean_low", "mean_high",
           "x_fulltime_worker", "hours_basis", "implied_rmb_per_hour"]].round(2)
tbl.to_csv(OUT_T / "B2c_whitecollar_roles_vs_factory_posts.csv", index=False, encoding="utf-8-sig")
print(tbl.to_string())

# ---------------------------------------------------------------- chart
# Same style system as labor_data.py: validated dataviz-skill palette, the
# same CJK-first font fallback list, and the same style_ax/savefig helpers
# (manual character-wrap for notes, so long English/CJK captions wrap cleanly).
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
    if note:
        width_chars = max(60, int(fig.get_figwidth() * 15.5))
        lines = []
        for para in note.split("\n"):
            lines.extend(textwrap.wrap(para, width=width_chars, break_long_words=True,
                                        break_on_hyphens=False) or [""])
        fig.text(0.01, -0.02, "\n".join(lines), fontsize=7.7, color=PAL["muted"],
                  ha="left", va="top", transform=fig.transFigure)
    fig.tight_layout()
    fig.savefig(OUT_C / name, bbox_inches="tight", facecolor=PAL["surface"])
    plt.close(fig)
    print(f"  chart -> {name}")


roles = wc_role.sort_values("mean_mid", ascending=False)
fac_colors = [PAL["blue"], PAL["yellow"], PAL["orange"]]
rows = ([(r.label, r.mean_mid, r.median_mid, r.n_posts, PAL["violet"]) for r in roles.itertuples()] + [None]
        + [(r.label, r.mean_mid, r.median_mid, r.n_posts, c) for r, c in zip(fac.itertuples(), fac_colors)])
fig, ax = plt.subplots(figsize=(10.5, 7.7))
ys = np.arange(len(rows))[::-1].astype(float)
for y, r in zip(ys, rows):
    if r is None:
        continue
    lab, m, med, n, c = r
    hollow = (n is not None) and n < 10
    ax.barh(y, m, height=0.66, color="none" if hollow else c, edgecolor=c, linewidth=1.4, zorder=3)
    if n is not None:
        ax.plot(med, y, marker="D", ms=5, mfc=PAL["surface"], mec=PAL["ink"], mew=1, zorder=5)
    label_n = f"   n={n}" if n is not None else ""
    ax.text(m + 260, y, f"¥{m:,.0f}   {m / FT_MEAN:.1f}×{label_n}", va="center", fontsize=9.5, color=PAL["ink"])
lab_rows = [(y, r) for y, r in zip(ys, rows) if r is not None]
ax.set_yticks([y for y, _ in lab_rows]); ax.set_yticklabels([r[0] for _, r in lab_rows], fontsize=10.5)
for t, (_, r) in zip(ax.get_yticklabels(), lab_rows):
    if r[4] != PAL["violet"]:
        t.set_color(r[4]); t.set_fontweight("bold")
ax.tick_params(axis="y", length=0)
sep = [y for y, r in zip(ys, rows) if r is None][0]
ax.axhline(sep, color=PAL["axis"], lw=0.8)
ax.axvline(wc_all["mean_mid"], color=PAL["violet"], lw=1, ls=(0, (3, 3)), zorder=2)
ax.text(wc_all["mean_mid"] + 120, sep + 0.05, f"all white-collar avg ¥{wc_all['mean_mid']:,.0f}", fontsize=8.8,
        color=PAL["violet"], va="center")
ax.set_xlim(0, 13500)
ax.set_ylim(-0.6, len(rows) - 0.4)
ax.xaxis.set_major_formatter(lambda v, _: f"¥{v/1000:.0f}k" if v else "0")
ax.plot([], [], "D", ms=5, mfc=PAL["surface"], mec=PAL["ink"], ls="none", label="median (white-collar roles)")
ax.legend(loc="lower right", frameon=False, fontsize=9)
style_ax(ax, xlabel="Average monthly pay (RMB)")
ax.text(0, 1.115, "Foxconn Zhengzhou: posted white-collar salaries vs. factory-worker pay",
        transform=ax.transAxes, fontsize=12.5, fontweight="bold", color=PAL["ink"])
ax.text(0, 1.045, f"White-collar roles (Revelio postings, {WC_YEARS[0]}–{WC_YEARS[1]}) in violet; factory workers "
        f"(CLW 2025 peak-season calculation, same as B1c/B2b) below. × = multiple of a full-time line worker",
        transform=ax.transAxes, fontsize=9.5, color=PAL["ink2"])
wc_hr = wc_all["mean_mid"] / STANDARD_HOURS
ft_hr = ft_total / H_TOT
rb_hr = rb_total / H_TOT
hr_hr = hr_total / H_TOT
note = (f"White-collar = Revelio posts with an employer-stated RMB salary (not model-predicted), posted salary field (usually the bottom of the posted range), "
        f"excluding overtime and bonus; hollow bar = fewer than 10 posts. 2024–25 have only 7 posts, so {WC_YEARS[0]}–{WC_YEARS[1]} is used.\n"
        f"Factory = the same one-peak-season-month calculation as charts B1c/B2b (CLW 2025 calculator: base ¥{BASE_PAY:,.0f}/month, {H_TOT:.0f} h = "
        f"{H_REG:.0f} regular + {H_OT_WD:.0f} weekday-OT + {H_OT_RD:.0f} rest-day-OT). Full-time = base+OT at legal rates minus ¥{SI_PERSONAL:,.0f} social "
        f"insurance is not subtracted here (bar shows pretax); rebate type = base+OT at legal rates plus the ¥{REBATE:,.0f} rebate spread over 3 months, forfeited "
        f"if the worker quits early; hourly type = a flat ¥{HOURLY_ALLIN:.0f}/h for every hour including overtime, of which ¥{HOURLY_DEFERRED:.0f}/h is paid a "
        f"month late and only if still employed on the 25th.\n"
        f"Per hour, at each side's own hours basis: white-collar ≈ ¥{wc_hr:,.0f} (at {STANDARD_HOURS:.0f} h/month) vs. full-time ≈ ¥{ft_hr:,.0f}, "
        f"rebate ≈ ¥{rb_hr:,.0f}, hourly ≈ ¥{hr_hr:,.0f} (all at {H_TOT:.0f} h/month, which already includes heavy overtime). White-collar figures are a "
        f"recruiting asking price, not a payslip; factory figures are a peak-season model, not measured pay.")
savefig(fig, "B2c_whitecollar_roles_vs_factory_posts.png", note=note)
print(f"ft_total={ft_total:.1f} rb_total={rb_total:.1f} hr_total={hr_total:.1f}")
