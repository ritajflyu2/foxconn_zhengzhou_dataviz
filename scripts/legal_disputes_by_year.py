"""
Legal exposure: Foxconn Zhengzhou's four entities, court hearing announcements
(开庭公告) by dispute type and year.

Source: 法律_郑州富士康四家公司开庭公告.xlsx, sheet 开庭公告 (150 hearing-announcement
records scraped from court-notice sites, covering 鸿富锦/富联裕展/富联精密/河南富驰,
2015-2026). Each row is one scheduled/held court hearing; 案由 (cause of action) is
the court's own case-type label. Year = year of 开庭时间 (the hearing date/time);
this is when the case was HEARD (or scheduled to be), not when it was filed.

The 28 distinct 案由 values are grouped into 6 broad categories (kept fine-grained
in the CSV, grouped only for the chart) so the chart has a legend a person can
actually read - see CATEGORY_MAP below for the exact grouping.

Caveats baked into the note:
- These are hearing ANNOUNCEMENTS, not case outcomes - a case with a
  postponed/rescheduled hearing can appear more than once, and this is not a
  count of unique lawsuits or of rulings.
- 2026 has only 1 record (the year is not yet over as of this data pull) - not
  comparable to a full year.
- This is whatever a court-notice-scraping source surfaced, not necessarily
  every hearing these entities have ever had (coverage/scraping completeness is
  unverified).

Reads the source file read-only; writes into a new legal_analysis_output/.
Run (from project root): python3 scripts/legal_disputes_by_year.py
"""
import textwrap
from pathlib import Path

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

BASE = Path(__file__).resolve().parent.parent  # project root (scripts/ lives one level down)
F_LEGAL = BASE / "data" / "legal" / "法律_郑州富士康四家公司开庭公告.xlsx"
OUT = BASE / "outputs" / "legal_analysis_output"
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


def style_ax(ax, ylabel=None):
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


# ---------------------------------------------------------------- data
df = pd.read_excel(F_LEGAL, sheet_name="开庭公告")
df["year"] = df["开庭时间"].dt.year

# 案由 (cause of action) -> broad category, in the FIXED order the chart will
# stack/color them (largest, most central category first).
CATEGORY_MAP = {
    # Labor & employment (includes labor-adjacent social-insurance disputes)
    "劳动争议": "Labor & employment", "劳动合同纠纷": "Labor & employment",
    "人事争议": "Labor & employment", "竞业限制纠纷": "Labor & employment",
    "申请撤销仲裁裁决": "Labor & employment", "工伤保险待遇纠纷": "Labor & employment",
    "失业保险待遇纠纷": "Labor & employment", "社会保险纠纷": "Labor & employment",
    # Commercial contract disputes
    "合同纠纷": "Commercial contract", "买卖合同纠纷": "Commercial contract",
    "广告合同纠纷": "Commercial contract", "建设工程施工合同纠纷": "Commercial contract",
    "建设工程分包合同纠纷": "Commercial contract", "装饰装修合同纠纷": "Commercial contract",
    "房屋买卖合同纠纷": "Commercial contract", "金融借款合同纠纷": "Commercial contract",
    "房屋租赁合同纠纷": "Commercial contract", "承揽合同纠纷": "Commercial contract",
    # Intellectual property
    "侵害发明专利权纠纷": "Intellectual property", "侵害作品信息网络传播权纠纷": "Intellectual property",
    "著作权权属纠纷": "Intellectual property",
    # Personal injury / personal rights
    "名誉权纠纷": "Personal injury / rights", "身体权纠纷": "Personal injury / rights",
    "生命权、健康权、身体权纠纷": "Personal injury / rights", "健康权纠纷": "Personal injury / rights",
    "提供劳务者受害责任纠纷": "Personal injury / rights",
    # Other / administrative
    "其他民事": "Other / administrative", "行政确认": "Other / administrative",
}
CAT_ORDER = ["Labor & employment", "Commercial contract", "Intellectual property",
             "Personal injury / rights", "Other / administrative"]
CAT_COLOR = {"Labor & employment": PAL["blue"], "Commercial contract": PAL["orange"],
             "Intellectual property": PAL["violet"], "Personal injury / rights": PAL["red"],
             "Other / administrative": PAL["aqua"]}

df["category"] = df["案由"].map(CATEGORY_MAP)
assert df["category"].isna().sum() == 0, "unmapped 案由 values: " + str(df.loc[df['category'].isna(), '案由'].unique())

detail = df.groupby(["year", "案由", "category"]).size().reset_index(name="hearings")
detail.to_csv(TABLES / "legal_disputes_by_year_detail.csv", index=False, encoding="utf-8-sig")

wide = df.groupby(["year", "category"]).size().unstack(fill_value=0).reindex(columns=CAT_ORDER, fill_value=0)
wide.to_csv(TABLES / "legal_disputes_by_year_category.csv", encoding="utf-8-sig")
print(wide)
print()
print(f"Total hearings: {len(df)}; entities: {df['企业'].nunique()}; years: {df['year'].min()}-{df['year'].max()}")

# ---------------------------------------------------------------- chart: stacked bar, category by year
years = wide.index.tolist()
fig, ax = plt.subplots(figsize=(11, 6.2))
bottom = pd.Series(0, index=wide.index, dtype=float)
for cat in CAT_ORDER:
    vals = wide[cat]
    if vals.sum() == 0:
        continue
    ax.bar([str(y) for y in years], vals, bottom=bottom, color=CAT_COLOR[cat], label=cat,
           width=0.62, edgecolor=PAL["surface"], linewidth=1.2, zorder=3)
    bottom += vals

totals = wide.sum(axis=1)
for x, (y, t) in enumerate(zip(years, totals)):
    ax.text(x, t + 0.8, f"{t:.0f}", ha="center", fontsize=9, color=PAL["ink2"])

# flag 2026 as a partial year (data pulled mid-year; not a full annual count)
if 2026 in years:
    i2026 = years.index(2026)
    ax.text(i2026, totals.iloc[i2026] + 3.2, "partial\nyear", ha="center", fontsize=7.6,
            color=PAL["red"], style="italic")

style_ax(ax, ylabel="Court hearings (announcements)")
ax.set_ylim(0, totals.max() * 1.18)
ax.legend(loc="upper left", fontsize=8.8, frameon=False, ncols=1)
ax.text(0, 1.12, "Foxconn Zhengzhou's four entities: court hearings by dispute type, 2015-2026",
        transform=ax.transAxes, fontsize=13, fontweight="bold", color=PAL["ink"])
ax.text(0, 1.045, "Labor & employment disputes dominate every year with hearings, and hearing volume rose sharply from 2021 onward.",
        transform=ax.transAxes, fontsize=9.3, color=PAL["ink2"])

note = (f"Source: court hearing announcements (开庭公告) scraped for Foxconn Zhengzhou's four legal entities (鸿富锦精密电子, 富联裕展科技, 富联精密电子, 河南富驰科技), n={len(df)} hearings, "
        f"{df['year'].min()}-{df['year'].max()}. Year = year of the hearing date/time (开庭时间), not the filing date. Each row is one scheduled/held hearing, grouped from the court's own 28 distinct "
        f"案由 (cause-of-action) labels into 5 broad categories for readability (see the detail CSV for the original labels): Labor & employment includes 劳动争议/劳动合同纠纷 plus labor-adjacent "
        f"social-insurance and non-compete disputes; Commercial contract covers general/sales/construction/lease/loan contract disputes; Intellectual property covers patent/copyright cases; Personal "
        f"injury / rights covers reputation/health/bodily-injury claims; Other / administrative is a small residual category.\n"
        f"This counts hearing ANNOUNCEMENTS, not unique lawsuits or outcomes - a case that was postponed and re-noticed can appear more than once, and this says nothing about who won. 2026 shows only "
        f"1 hearing because this data was pulled partway through the year, not because litigation dropped off a cliff - it is not comparable to a full year. This reflects whatever a court-notice "
        f"scraping source surfaced; it is not verified to be every hearing these entities have had.")
savefig(fig, "legal_disputes_by_year.png", note=note)
