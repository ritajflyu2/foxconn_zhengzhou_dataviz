"""
B1d. Work hours per week: white-collar (office) staff vs. factory assembly-line
workers, by season.

No source in this project measures actual white-collar working hours at
Foxconn Zhengzhou (Revelio's job posts carry salary, not hours; CLW's surveys
are about line workers). So the white-collar side of this chart is drawn as
the statutory standard workweek only (40 h, China Labor Law) - a legal
reference point, not a measured figure - and is clearly flagged as such. The
factory side is CLW 2025's measured hours for line workers (full-time and
dispatch workers on the same shifts; CLW does not separate them by type).

Reads source files only; writes new files into labor_analysis_output/.
Run (from project root): python3 scripts/B1d_hours_by_worker_type.py
"""
import textwrap
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.patches import Patch

BASE = Path(__file__).resolve().parent.parent  # project root (scripts/ lives one level down)
OUT_T = BASE / "outputs" / "labor_analysis_output" / "tables"
OUT_C = BASE / "outputs" / "labor_analysis_output" / "charts"

# CLW 2025 (pp.5, 18): "多数约60小时/周，部分达75小时" (most workers ~60h/week, some up to 75h);
# monthly overtime "旺季65-130小时；淡季52-84小时" (peak 65-130h OT/month; off-season 52-84h OT/month).
# Converting the monthly figures to weekly (÷4.33) for a like-for-like axis with the "most
# workers ~60h" line, and adding the 40h legal standard week (used in the B1c calculator too).
STD_WEEK = 40.0
LEGAL_MAX = 48.0
SEASONS = pd.DataFrame([
    dict(season="Off-season", ot_month_low=52, ot_month_high=84),
    dict(season="Peak season", ot_month_low=65, ot_month_high=130),
])
SEASONS["hours_week_low"] = STD_WEEK + SEASONS["ot_month_low"] / 4.33
SEASONS["hours_week_high"] = STD_WEEK + SEASONS["ot_month_high"] / 4.33
MOST_WORKERS = 60.0
HEAVIEST_LOW, HEAVIEST_HIGH = 69, 75  # CLW: some shifts Aug-Sep 2025 >300h/month worked out to this range

factory_rows = [dict(group="Factory assembly-line worker", season=s["season"],
                      hours_low=s["hours_week_low"], hours_high=s["hours_week_high"], measured=True)
                for _, s in SEASONS.iterrows()]
factory_rows.append(dict(group="Factory assembly-line worker", season="Heaviest shifts (Aug-Sep 2025)",
                          hours_low=HEAVIEST_LOW, hours_high=HEAVIEST_HIGH, measured=True))
wc_rows = [dict(group="White-collar (office)", season=s, hours_low=STD_WEEK, hours_high=STD_WEEK, measured=False)
           for s in ["Off-season", "Peak season", "Heaviest shifts (Aug-Sep 2025)"]]
tbl = pd.DataFrame(wc_rows + factory_rows)
tbl.to_csv(OUT_T / "B1d_hours_whitecollar_vs_factory.csv", index=False, encoding="utf-8-sig")
print(tbl.to_string())

# ---------------------------------------------------------------- chart style (matches labor_data.py)
PAL = dict(
    surface="#fcfcfb", page="#f9f9f7", ink="#0b0b0b", ink2="#52514e",
    muted="#898781", grid="#e1e0d9", axis="#c3c2b7",
    blue="#2a78d6", orange="#eb6834", aqua="#1baf7a", yellow="#eda100",
    magenta="#e87ba4", green="#008300", violet="#4a3aa7", red="#e34948",
)
GROUP_COLOR = {"White-collar (office)": PAL["violet"], "Factory assembly-line worker": PAL["orange"]}
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


groups = ["White-collar (office)", "Factory assembly-line worker"]
seasons_order = ["Off-season", "Peak season", "Heaviest shifts (Aug-Sep 2025)"]
bar_h = 0.32
group_gap = 0.55

fig, ax = plt.subplots(figsize=(9.5, 5.0))
season_centers = []
for si, season in enumerate(seasons_order):
    base_y = si * (len(groups) * bar_h + group_gap)
    season_centers.append(base_y + (len(groups) - 1) * bar_h / 2)
    for gi, g in enumerate(groups):
        r = tbl[(tbl["season"] == season) & (tbl["group"] == g)].iloc[0]
        y = base_y + gi * bar_h
        c = GROUP_COLOR[g]
        hatch = "///" if not r["measured"] else None
        ax.barh(y, max(r["hours_high"] - r["hours_low"], 0.6), left=r["hours_low"], height=bar_h * 0.8,
                color=c, alpha=0.9 if season == "Peak season" else 0.6, hatch=hatch,
                edgecolor=c if hatch else "none", zorder=3)
        txt = f"{r['hours_low']:.0f} h (legal standard, not measured)" if not r["measured"] else f"{r['hours_low']:.0f}–{r['hours_high']:.0f} h"
        ax.text(max(r["hours_high"], r["hours_low"]) + 1.2, y, txt, va="center", fontsize=8.8, color=PAL["ink2"])

ax.axvline(STD_WEEK, color=PAL["axis"], lw=1, ls=(0, (2, 2)), zorder=1)
ax.axvline(LEGAL_MAX, color=PAL["axis"], lw=1, ls=(0, (2, 2)), zorder=1)
ax.axvline(MOST_WORKERS, color=PAL["ink2"], lw=1, ls=":", zorder=1)
top_y = season_centers[-1] + len(groups) * bar_h * 0.85
ax.text(STD_WEEK, top_y, "standard\n40 h", ha="center", fontsize=8, color=PAL["muted"])
ax.text(LEGAL_MAX, top_y, "legal max\n≈48 h", ha="center", fontsize=8, color=PAL["muted"])
ax.text(MOST_WORKERS, top_y, "line workers,\nmost ≈60 h", ha="center", fontsize=8, color=PAL["ink2"])

ax.set_yticks(season_centers)
ax.set_yticklabels(seasons_order, fontsize=10.5)
ax.set_ylim(-bar_h * 2.2, top_y + bar_h * 2.6)
ax.set_xlim(30, 82)
ax.tick_params(axis="y", length=0)
ax.grid(True, axis="x", color=PAL["grid"], lw=0.6); ax.grid(False, axis="y")
ax.set_axisbelow(True)
ax.set_xlabel("Hours per week", fontsize=9.5, color=PAL["ink2"])

ax.legend(handles=[
    Patch(color=GROUP_COLOR["Factory assembly-line worker"], label="Factory assembly-line worker (measured, CLW 2025)"),
    Patch(facecolor=GROUP_COLOR["White-collar (office)"], hatch="///", edgecolor=GROUP_COLOR["White-collar (office)"],
          alpha=0.6, label="White-collar office staff (legal standard week - not measured)"),
], loc="lower left", frameon=False, fontsize=8.4)
ax.text(0, 1.135, "Foxconn Zhengzhou: work hours, white-collar vs. factory line workers",
        transform=ax.transAxes, fontsize=12.5, fontweight="bold", color=PAL["ink"])
ax.text(0, 1.05, "Factory line workers' hours rise sharply in peak season; no comparable survey of white-collar office hours exists,\n"
        "so that side shows only the legal standard workweek, not what office staff actually work.",
        transform=ax.transAxes, fontsize=9.2, color=PAL["ink2"])
note = ("Factory assembly-line worker hours: CLW 2025 (China Labor Watch) - “most workers ~60 h/week, some up to 75 h” (p.5); monthly overtime "
        "“65–130 h in peak season, 52–84 h in the off-season” (p.18), converted to weekly by dividing by 4.33 and adding the 40 h standard week; "
        "“heaviest shifts” is CLW's Aug–Sep 2025 finding that some rotating-shift workers exceeded 300 h/month (~130 h overtime). CLW's hours are reported "
        "for the factory floor as a whole and are not broken out by full-time vs. dispatch employment status.\n"
        "White-collar office staff: no source in this project measures their actual hours (Revelio's job posts record salary, not working hours). The bar "
        "shown is the Chinese Labor Law standard workweek (40 h) as a legal reference point only - it is very likely an underestimate, since long-hours "
        "cultures (e.g. '大小周' alternating six-day weeks) are common in Chinese tech/manufacturing office roles, but no measured figure for this "
        "workforce is available to plot. The legal overtime cap for hourly/manual workers is 36 h/month (~8 h/week); factory hours regularly exceed it.")
savefig(fig, "B1d_hours_whitecollar_vs_factory.png", note=note)
