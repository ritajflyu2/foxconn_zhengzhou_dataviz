# Environmental data: research questions

Data folder: ~/Desktop/Harvard/F2026/Studio/Assignment 2 data viz/富士康郑州数据_2008-2026/
Read 00_文件说明.md first.

## D. Environmental footprint

D1. How did monthly emissions change in 2020–2025 at the two permitted plants (鸿富锦 at the Airport Zone, 富联精密 at the Economic Development Zone)?
    Pollutants: COD, NH3-N, VOCs, particulates.
    Look at the long-term trend and the seasonal pattern. Does emissions peak with the iPhone production ramp (Aug–Oct)?
    Files: 环境_月度排放长表_鸿富锦与富联精密_2020-2025.csv (long format); 环境_排污许可执行报告月度排放_鸿富锦与富联精密_2020-2025.xlsx
    Notes: self-reported values. 富联精密 2020 covers Sep–Dec only; its VOCs are reported as 0 for 2020–2022 (likely not reported).
    Flag outliers, e.g. 鸿富锦 COD in 2024-09 (152.6 t vs ~40 t in neighboring months).

D2. How do actual emissions compare with what was approved?
    鸿富锦: EIA-approved NMHC adds up to ~600 t/a across the 2010–2017 assembly projects, while actual reported VOCs were 22–81 t (4–13%).
    EIA-approved COD is ~161.7 t/a, while actual reported COD was 446–485 t in 2024–2025 (~3x).
    Also compare with permit limits (许可排放量) in the permit panel file.
    Files: 环境_环评核定与验收历史排放_2010-2026.xlsx (sheet 鸿富锦_核定量vs实际); permit panel.
    Note: the scopes may differ (e.g. production wastewater only vs. production + domestic sewage). Do not call it "exceeding limits" without checking.

D3. Emissions relative to workers and output.
    COD, VOCs per insured worker and per design headcount, by year.
    Where the EIA gives capacity, compute emissions per unit of output.
    Files: emissions panel + 用工_富士康郑州四家实体社保参保人数_2016-2025.xlsx + 自动化_环评设备定员产能面板与月度时间线_2010-2026.xlsx
    Note: per-worker intensity rises mechanically when headcount falls. Present it as "fewer workers, emissions did not fall", not as a causal claim.

D4. How did approved emissions build up as the site expanded, 2010–2026?
    Plot cumulative approved NMHC and COD by project approval year and zone (K, F, C, L, D, B/E, G).
    File: 环境_环评核定与验收历史排放_2010-2026.xlsx (long-format sheet).

D5. Where do labor and environment connect directly?
    EIA domestic-sewage COD is calculated from design headcount: 富联裕展 domestic COD fell from 66.7 to 39.1 t/a as design headcount fell from 26,000 to 11,614 (2023).
    Show this as the clearest link between the labor and environmental ledgers.

D6. Context: group-level carbon footprint, 2015–2025.
    Hon Hai and Foxconn Industrial Internet (FII): Scope 1, 2, 3 emissions, water use, and emissions per million USD revenue.
    File: 环境_Trucost鸿海与工业富联集团碳排放_2015-2025.xlsx
    Note: this is consolidated group data, not Zhengzhou. Use it only as background.

D7. Plant snapshot, 2025.
    Legal entities, permit categories, pollutants and standards, and 2025 quarterly actual emissions.
    File: 环境_厂区法人实体排污许可与2025年实际排放_2025.xlsx
    Note: in this file, the 鸿富锦 VOCs row is shifted by one column (the "permitted amount" cell holds the annual total, 22.14 t), and the 富联裕展 note ("2025 emissions all 0, may not be in production") contradicts the EIAs. Verify before use.

## Known limitations
- EIA emissions are design/approved values, not measurements. Permit execution reports are self-reported.
- Scopes differ across EIAs (single project vs. whole plant; production wastewater vs. domestic sewage). Filter by the 口径 column.
- Permit reports cover only 2020 onward and only two plants. 富联裕展's execution reports are not in the panel.
- Units: tonnes per year unless noted; wastewater volume in 10,000 m³/a in EIA tables.

## Output
Tidy CSV/XLSX tables, draft charts (PNG), and a short memo with each finding's evidence strength (strong/medium/weak) and limitations.
Results should be directly usable for a data visualization narrative.
Do not modify existing files; create a new subfolder for outputs.
