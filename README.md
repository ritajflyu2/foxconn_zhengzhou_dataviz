# foxconn_zhengzhou_dataviz
MDE first year studio project - data visualization - Rita Lyu &amp; Eleanor Li

## Folder structure

All paths in the project's `.md` files are relative to this folder (the project root).

```
data/                      source data, not edited by scripts
  labor/                   用工_*    workforce, pay, recruitment posts
  automation/              自动化_*  EIA equipment/headcount panel + EIA search log
  environment/             环境_*    emissions, permits, Trucost
  legal/                   法律_*    court cases, hearing announcements
  原始文件_抓取数据/          raw scrapes (posts, 北大法宝 JSON, Revelio export)
scripts/                   analysis scripts (run from the project root)
outputs/                   everything the scripts generate
  labor_analysis_output/   tables/, charts/, MEMO.md
  environment_analysis_output/
  automation_analysis_output/
  legal_analysis_output/
  airquality_analysis_output/
  water_analysis_output/
  map_insured_2025/        self-contained map (script + data + PNGs); run from inside its folder
docs/                      data guide (00_文件说明.md), research questions, deliverable drafts
design/                    site storyboard (LABOR_STORYBOARD.md) and reference/ images
```

Run a script from the project root, e.g. `python3 scripts/labor_data.py`.

