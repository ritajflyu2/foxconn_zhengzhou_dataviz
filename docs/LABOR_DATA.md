# Labor data: research questions

Read docs/00_文件说明.md first.

## A. Workforce size and composition
A1. How did the number of insured workers change over time across Foxconn Zhengzhou's four legal entities (鸿富锦, 富联精密/富泰华, 富联裕展/河南裕展, 河南富驰), 2016–2025?
    Compare against total workforce estimates (CLW reports, news, EIA design headcounts).
    Files: data/labor/用工_富士康郑州四家实体社保参保人数_2016-2025.xlsx; data/labor/用工_媒体与NGO调查劳工数据_2015-2025.xlsx; data/automation/自动化_环评设备定员产能面板与月度时间线_2010-2026.xlsx
    Note: there is no annual total-workforce series, only point estimates. Mark peak vs. off-season figures.

A2. How many dispatch workers are there? use CLW point estimates (2018: 55%; 2019: ~50%; 2025: 80,000–110,000, at least 50%).
    Optionally estimate "total workforce − insured workers" and "insured workers * how many times of dispatched worker vs insuranced worker" as a proxy, but label it clearly as an estimate.
    Note: the legal cap is 10%.

A3. How much of the workforce does Revelio cover? Compare Revelio's estimated headcount (~8,100, mostly white-collar) to insured workers and total workforce.
    The aim is to show what this data source can and cannot represent, not to use it for workforce size.

## B. Pay
B1. How is pay calculated differently for regular (insured) workers and dispatch workers, including rebate-type and hourly-type dispatch workers?
    Use the calculator sheet in data/labor/用工_媒体与NGO调查劳工数据_2015-2025.xlsx, CLW 2023/2025, and court cases.

B2. How does white-collar pay compare with factory-worker pay?
    White-collar: data/labor/用工_白领招聘薪资_Revelio招聘帖人民币月薪_2016-2025.xlsx (posted salaries only, converted to RMB/month).
    Factory workers: CLW reports and hourly rates from data/labor/用工_招聘帖返费小时工价与底薪_2010-2026.xlsx. 
    Note: white-collar figures are posted base salaries; factory figures often include overtime. Do not use Revelio's model-predicted USD salaries. For dispatched workers use hourly rate type for convinience. 

## C. Recruitment posts (fskzpw.com, a labor-agency site, 2010–2026)
C1. What types of workers are recruited (regular, rebate-type dispatch, hourly-type dispatch, student/summer, short-term), and how does this change over time?
    Include posts mentioning "派遣" (dispatch) or "同工同酬" (equal pay for equal work), or other similiar terms that illustrate dispatch workers without expliciting saying it, with the source text quoted. "official direct hiring" 
C2. How do these changes relate to peak production season, social insurance enrollment, and third-party investigation data?
    File: data/原始文件_抓取数据/招聘帖全文抓取_fskzpw_2010-2026.json
    Known issues:
    - It is an agency site. Phrases like "直招" "官方直招" "正式工"are marketing illustrate full time employment.
    - The site later appended FAQ templates (e.g. "definition of new/old dispatch workers") to old post bodies.
      If a body mentions a year 2+ years after the post date, treat the body as contaminated and use only the title and summary.
    - Recruitment posts cannot be used to estimate the dispatch share of total employment.

## Output
Results should be directly usable for a data visualization narrative:
tidy CSV/XLSX tables, draft charts, and a short memo with each finding's evidence strength (strong/medium/weak) and limitations.
Do not modify existing files; create a new subfolder for outputs.