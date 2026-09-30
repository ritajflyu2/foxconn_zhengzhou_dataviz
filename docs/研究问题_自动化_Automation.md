# Automation data: research questions

Data folder: ~/Desktop/Harvard/F2026/Studio/Assignment 2 data viz/富士康郑州数据_2008-2026/
Read docs/00_文件说明.md first.
Main file: data/automation/自动化_环评设备定员产能面板与月度时间线_2010-2026.xlsx
Source documents: 原始文件_环评PDF/ (14 EIA reports; 3 are scans)

## Headline questions (what this section is really asking)

1. Across selected Foxconn Zhengzhou projects, did design capacity rise while
   design headcount stayed flat or fell, and how did equipment composition
   change?
2. Which manufacturing processes were automated over time, and what changes
   in labor requirements were reported alongside those upgrades?

E1–E6 below are the individual, doable sub-questions that build toward these
two. All of them stay at the level of what EIA/company documents state
(design headcount, design capacity, stated reasons, listed equipment) - none
of them are a measurement of actual employment, actual output, or actual
automation-caused job loss.

## E. Automation

E1. Headcount vs. machines over time.
    富联裕展 (A/C/D/E zones), EIA design headcount: 51,000 (2020-12) → 30,000 (2021-09) → 26,000 (2022-05) → 11,614 (2023-05).
    CNC stayed at ~4,500–5,300 units, so CNC per worker rose from 0.10 to 0.46.
    Also compute robots per 1,000 workers.
    Sheets: 富联裕展时间序列, 项目面板_自动化与用工
    Caution (feedback): decompose the ratio before presenting it. CNC per
    worker rising is driven almost entirely by design headcount falling
    (51,000 → 11,614), not by CNC count increasing (it does not - it stays
    roughly flat, ~4,500–5,300 across the whole period). Show the two series
    separately (headcount trend, CNC-count trend) alongside the ratio, so the
    chart cannot be misread as "more automation" when it is actually "fewer
    designed workers, same machines."

E2. Output with a fixed workforce.
    富泰华/富联精密: design headcount stayed at 23,000 while capacity went from 70k to ~110k pieces/day (2017–2022).
    CNC: 6,272 (2017) → 4,540 (2021) → 4,531 (2022).
    Compute pieces per worker per day by project.
    Sheets: 富泰华时间序列, 项目面板_自动化与用工
    Caution (feedback): label every figure here as design headcount / design
    capacity (both EIA planning values), never as "productivity" or "output
    per worker" - this is not a measured actual-output number, and should not
    be presented or captioned as one.

E3. What machines were added?
    Use the 915-row equipment list: share of CNC, robots/robotic arms, automation-specific machines, inspection equipment, and manual stations.
    Compare before vs. after each project, using the month columns to place each state in time.
    Example: the 2026 new floors add CNC 675, robots 284, automation machines 331, and manual stations 536, for 3,500 new workers.
    Sheets: 设备清单_原始, 设备类别汇总. Use the column 状态说明 to separate built equipment from planned-only equipment.
    The category rules are keyword-based (see the 类别 column); review them before relying on the robot counts.
    Feedback: comparatively the best/most solid of these questions. Two
    concrete to-dos before finalizing: (1) keep planned-only and actually-built
    equipment as clearly separate series throughout - never sum them into one
    total; (2) spot-check the keyword-based 类别 assignment against a sample of
    the original 915 rows (especially the robot/robotic-arm category) before
    reporting a robot count as a fact rather than a keyword-derived estimate.

E4. What reasons do companies give for reducing headcount?
    Collect the quotes, e.g. "由于工艺进行自动化升级，劳动定员减少" (headcount reduced because of automation upgrades), with dates.
    Separate "automation" from "capacity reduction" reasons.
    Sheets: 月度事件时间线, 项目面板_自动化与用工 (备注 column); source PDFs.
    Feedback: good as scoped - keep it explicitly framed as "reasons the
    EIA/company documents themselves state," not as our own inference about
    why headcount changed. Every quote should carry its source document and
    date so this stays a documented-statement exercise, not analysis.

E5. Timing: automation events vs. labor and emissions.
    Overlay the monthly event timeline (approval, construction, commissioning, acceptance) on:
    - recruitment prices (rebates, hourly rates)
    - insured workers (annual)
    - monthly emissions
    Sheet: 月度面板_自动化×用工×排放
    Note: few events and many confounders (iPhone cycles, COVID, tariffs). Describe co-movement; do not claim causation.
    Feedback: doable, but scale back the ambition - there are too many
    separate 法人 (legal entities) involved to argue any real cross-entity
    relationship. Keep this to a single overlay/timeline per entity (do not
    pool entities together), present it as an illustrative timeline only, and
    do not attempt a summary "automation correlates with X" claim across the
    whole dataset - the confounders and small event count make that
    unsupportable.

E6. Baseline: labor intensity of the early assembly era (鸿富锦, 2010–2017).
    Design headcount per 10,000 phones/year of capacity, by zone.
    Note: the D-zone capacity figure contains a typo in the source ("10900万万件"); flag it.
    Feedback: fine as a purely descriptive baseline - no changes needed.

## Cross-cutting story to test
Did Foxconn Zhengzhou produce the same or more with fewer (insured, designed) workers and more machines?
Link to the labor questions (insured workers, dispatch share) and the environmental questions (emissions per worker).
For each chart, state the evidence strength (strong/medium/weak) and the limitations.

## Known limitations
- EIA headcounts are design values (劳动定员), not actual employment. Scopes differ: single project vs. whole plant. Filter by the 定员口径 column.
- EIA "after" equipment counts are sometimes plans that were later superseded (e.g. the 2020-12 and 2023-05 智能制造 projects). Use the 状态说明 column.
- Construction periods are planned dates; use commissioning/acceptance dates for actual timing. 鸿富锦 2010–2017 projects have year-level dates only.
- The 3 scanned EIAs (2021-08, 2021-09, 2022-05) were read by OCR; headcount and capacity were cross-checked against later EIAs, but their equipment tables were not used.
- Every "per worker" or "per headcount" ratio in this section (E1, E2, E6) uses
  a DESIGN figure in the denominator, and design headcount can fall for
  reasons that have nothing to do with automation (see E1's caution above,
  and the labor analysis's dispatch-worker findings) - a rising ratio is not
  by itself evidence of "more automation," and every chart using one should
  show the underlying headcount and equipment/output series separately, not
  just the ratio.

## Output
Tidy CSV/XLSX tables, draft charts (PNG), and a short memo with each finding's evidence strength (strong/medium/weak) and limitations. All captions and variable names should be in English.
Results should be directly usable for a data visualization narrative.
Do not modify existing files; create a new subfolder for outputs.
