"""Data for the site's Management page (the factory's 3F in the floor index).

Writes site/data/labor/scene_mgmt.json:
  categories  white-collar hiring posts by job family: count, share, top job
              titles, and the median posted monthly pay (midpoint of each
              post's salary range), with its sample size
  headcount   CLW's 2025 workforce estimate and the 2025 insured count (read
              from Scene 3's JSON, so the two pages agree), and Revelio's 2025
              weighted estimate and raw profile count

Line-worker pay is NOT here: the page computes it at run time with the wage
calculator's own model (site/src/lib/payModel.js), so it cannot drift.

Run from the project root: .venv/bin/python scripts/export_mgmt_scene.py
Source workbooks are read only, never edited.
"""
import json
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
POSTS_XLSX = ROOT / "data" / "labor" / "用工_白领招聘薪资_Revelio招聘帖人民币月薪_2016-2025.xlsx"
PROFILES_XLSX = ROOT / "data" / "labor" / "用工_Revelio职业档案与招聘帖_2008-2026.xlsx"
SCENE3 = ROOT / "site" / "data" / "labor" / "scene3_workforce_by_year.json"
OUT = ROOT / "site" / "data" / "labor" / "scene_mgmt.json"

# Revelio job families (岗位类别) -> the page's five categories; 其他 (other) is dropped.
CATEGORIES = [  # key, label, source families
    ("tech", "Tech & Engineering", ["机械/设备/工艺/制造", "软件/IT/数据", "研发/产品/设计", "测试/质量", "硬件/电子/电气"]),
    ("hr", "HR & Training", ["人力资源/培训"]),
    ("mgmt", "Management & Operations", ["项目管理", "采购/供应链/物流"]),
    ("finance", "Finance & Accounting", ["财务/法务/审计"]),
    ("sales", "Sales & Marketing", ["销售/市场/客户"]),
]
PAY_YEARS = (2021, 2025)
SMALL_SAMPLE = 15  # a category's pay median from fewer posts is flagged
TOP_TITLES = 5

# Revelio's title field is sometimes a field or activity, not a job title
# ("software engineering", "staffing"). For display these are given the
# closest actual job title; titles that already are one are just capitalised.
TITLE_DISPLAY = {
    "software engineering": "Software engineer",
    "project engineering": "Project engineer",
    "planning": "Production planner",
    "material": "Materials planner",
    "business project": "Business project manager",
    "talent development": "Talent development specialist",
    "staffing": "Staffing specialist",
    "key accounts": "Key account manager",
    "legal": "Legal counsel",
    "accounting": "Accountant",
    "financial analysis": "Financial analyst",
    "media": "Media specialist",
    "communications": "Communications specialist",
    "press": "Press officer",
    "creative services": "Creative designer",
}

CJK = re.compile(r"[㐀-鿿]")


def title(t):
    return TITLE_DISPLAY.get(t, t[:1].upper() + t[1:])


def main():
    posts = pd.read_excel(POSTS_XLSX, sheet_name="逐帖数据")
    need = {"年份", "岗位（Revelio分类）", "岗位类别", "是否使用", "月薪下限_元", "月薪上限_元"}
    assert need <= set(posts.columns), need - set(posts.columns)
    family_to_cat = {f: key for key, _, fams in CATEGORIES for f in fams}
    used = posts[posts["是否使用"] == "使用"].copy()
    used["cat"] = used["岗位类别"].map(family_to_cat)
    used = used[used["cat"].notna()]  # drops 其他
    used["mid"] = (used["月薪下限_元"] + used["月薪上限_元"]) / 2  # not 月薪_元: that is the range's lower bound
    total = len(used)
    pay = used[used["年份"].between(*PAY_YEARS)]

    categories = []
    for key, label, _ in CATEGORIES:
        c = used[used["cat"] == key]
        p = pay[pay["cat"] == key]
        top = c["岗位（Revelio分类）"].value_counts().head(TOP_TITLES)
        categories.append({
            "key": key, "label": label,
            "posts": int(len(c)), "share": round(len(c) / total, 4),
            "top_titles": [{"title": title(t), "posts": int(n)} for t, n in top.items()],
            "pay_median_monthly_cny": round(float(p["mid"].median())),
            "pay_n": int(len(p)),
            "small_sample": bool(len(p) < SMALL_SAMPLE),
        })
    pay_by_year = pay.groupby("年份").size()

    prof = pd.read_excel(PROFILES_XLSX, sheet_name="年度汇总")
    r25 = prof[prof["年份"] == 2025].iloc[0]
    s3 = json.loads(SCENE3.read_text())
    y25 = next(y for y in s3["years"] if y["year"] == 2025)

    out = {
        "posts_total": total,
        "post_years": [int(used["年份"].min()), int(used["年份"].max())],
        "pay_years": list(PAY_YEARS),
        "pay_posts_by_year": {str(int(y)): int(n) for y, n in pay_by_year.items()},
        "pay_hours_per_week": 40,
        "categories": categories,
        "headcount": {
            "year": 2025,
            "clw_low": y25["clw_total"]["low"], "clw_high": y25["clw_total"]["high"],
            "clw_season": y25["clw_total"]["season_label"],
            "insured": y25["airport_insured"],
            "revelio_weighted": round(float(r25["Revelio估计人数"]), 1),
            "revelio_raw": round(float(r25["原始档案数"]), 1),
        },
        "category_note": "Categories come from keyword matching on job titles, so some are imperfect (for example, key-account roles sit under Finance but are really sales). Revelio's title field sometimes names a field rather than a job (e.g. \"software engineering\"); those are shown as the closest actual job title.",
        "pay_note": "Posted pay, not pay actually received, with no overtime or bonus: the midpoint of each post's salary range, then the median per category. Posts are mostly 2021-2022 (very few after 2022).",
        "source": "Revelio Labs job postings and career profiles (via WRDS), Hon Hai entities in the Zhengzhou metro area",
        "caveat": "White-collar figures are posted pay from Revelio job postings, mostly engineering roles; line-worker figures come from CLW 2025 via the wage calculator. The periods differ.",
    }
    text = json.dumps(out, indent=1, ensure_ascii=False)
    assert not CJK.search(text), "Chinese text in the export"
    OUT.write_text(text + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}  ({total} posts, {len(categories)} categories)")


if __name__ == "__main__":
    main()
