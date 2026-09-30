# Assignment 2 — Deliverables Draft
**Foxconn Zhengzhou: Behind the Line** · Studio, Fall 2026

---

## 1. Narrative Abstract (250 words)

Our project narrows "Natural + Artificial" to a single site: Foxconn's Zhengzhou campus, the world's largest iPhone assembly complex, read as four stacked ledgers — emissions, automation, management, and labor. We chose this scale deliberately. A national or industry-wide view would flatten the tradeoffs our two source texts each insist on holding open: the thermal-power/climate paper's insistence that emissions accounting is a *choice* of boundary, not a neutral fact, and the UK biodiversity–national-security assessment's argument that ecological degradation converts silently into human and political instability. Zhengzhou lets us test both claims against one artificial system built to look natural, orderly, and inevitable.

Our narrative traces three ledgers back to those texts directly. Air and water comparisons against Boston (environment) mirror the climate paper's boundary problem: whose emissions count, and against what baseline. Workforce composition — a dispatch majority run through insourced-looking payroll systems, 3–4× over the legal 10% dispatch cap — mirrors the security paper's thesis that a system can look stable while its underlying resource (in this case, labor, not ecology) is being drawn down unsustainably. The 150-hearing legal record, dominated by labor disputes since 2021, is where that drawdown surfaces as visible conflict.

The strategic question our visualization pursues: **when an industrial system reports itself through synthesized, AI-assisted data, at what point does the reporting itself become the thing obscuring the natural and human cost it claims to measure?** Every chart in this project is therefore built to show its own uncertainty, not just its headline number.

*(248 words)*

---

## 2. Draft Algorithmic Forensics Appendix (420 words)

**Prompt engineering strategy.** Each analytical thread (air/water quality, automation headcount, labor composition, legal disputes) was scoped through an iterative back-and-forth rather than a single prompt: for the water comparison, we deliberately stopped to clarify *which* water question was being asked (city drinking/river quality vs. plant wastewater) before generating anything, because the two datasets use incompatible standards and a wrong assumption would have propagated through every downstream chart. Every chart-generation prompt also carries a fixed instruction to attach a written caveat block to the figure itself — source, date range, known gaps — so the audit trail travels with the artifact instead of living only in chat.

**Auditing AI-assisted data manipulation.** The clearest audit moment: when asked what share of hearings were labor disputes, we did not report "56% of all disputes." We separated the count (150 hearing *announcements*, court-notice-scraped) from the claim it can support, and flagged two specific manipulation risks in the underlying data itself — (1) postponed hearings can be re-noticed, inflating the announcement count relative to unique cases, and (2) scraping completeness is unverified, so 150 is a floor, not a census. This distinction — between what a number *is* and what it is being used to *claim* — is the recurring check applied to every synthesized figure in the deck.

**Mitigating bias or hallucination.** The clearest instance: an early draft of the water-quality comparison nearly forced Zhengzhou's river-grade metric and Boston's bacteria-compliance metric onto one shared axis, which would have implied a false apples-to-apples ranking between two different regulatory standards. We caught this before publishing and split it into two independently-labeled panels instead, each keyed to its own standard — a case where the *easier* visualization choice was also the more misleading one, and was rejected on those grounds.

**Methodology behind the visualized metrics.** The legal-dispute chart's five categories are a manual reduction of 28 raw court-assigned cause-of-action labels, validated with an `assert` check that no record is left unmapped. The wage-calculator figures are derived directly from two internal source tables (a peak-month pay breakdown and a multi-scenario overtime model), not invented — the guaranteed/conditional split shown to the user is the same split the source model uses to separate paid-now wages from rebate/deferred pay that dispatch workers forfeit if they leave early. Every categorical palette used across the project was run through a colorblind-safe validator (CIE-Lab ΔE separation, contrast floor) before shipping, so a colorblind reader loses no information a sighted reader has.

*(≈420 words)*

---

## 3. Narrative Wireframes / Storyboard — 5 states of interaction

A working prototype implementing this storyboard is linked in this conversation. States below correspond to it directly.

| # | State | What it shows | Interaction / data structure it demonstrates |
|---|-------|----------------|-----------------------------------------------|
| **1** | **Factory, exploded** | Four stacked ledgers (emissions / management / automation / labor) as an isometric-style diagram, entry state | Click-target on the 1F labor band — categorical navigation into one ledger among four |
| **2** | **Labor, opening** | Two proportionally-sized circles (dispatch 235k vs. insourced 65k), a three-row peak-month payroll comparison, and a 56%-disputes sparkline | Three parallel "doors" out of one scene — shows the data has three independent dimensions (who / pay / conflict) branching from one entry point |
| **3** | **Who keeps the line moving** | The two circles physically shrink and migrate into a 300-dot proportional field; two real time-series appear (insured headcount decline 2016–2025, recruitment-language shift 2016–2026) | A shared-element transition — the same two numbers persist across states, demonstrating that "workforce composition" and "workforce trend" are the same data at two time resolutions, not two datasets |
| **4** | **How work is paid** | Worker-type tabs (full-time / dispatch-rebate / dispatch-hourly / student) cross a two-slider control (hours worked, days employed) | Live-recomputed guaranteed-vs-conditional pay bar — demonstrates a *conditional* data structure: identical hours produce different take-home pay depending on a non-numeric contract variable (tenure past a payout threshold) |
| **5** | **Legal disputes** | Stacked bar, 12 years × 5 dispute categories, with the caveat note rendered in place | Shows time-stacked categorical data with an explicit "known incomplete" state built into the chart rather than hidden in a footnote |

The throughline across all five states: every transition reveals a variable the previous state had compressed away (headcount → composition → trend → conditionality → conflict), which is the layered-engagement opportunity we'd extend next — e.g., letting a viewer drag the calculator's "days employed" slider *from* the legal-disputes view, tying a forfeited payout directly to a real filed case.

---

## 4. Implementation Plan

**Tools, skills, and workflows currently deployed**
- Python (pandas, matplotlib) for all synthesized-data charts, run against real project spreadsheets (社保 insured headcount, court hearing announcements, recruitment posts, EIA/automation filings)
- A shared chart-style module (fixed categorical palette, CJK font fallback, consistent title/subtitle handling) reused across every script for visual consistency
- A colorblind-safe palette validator (CIE-Lab ΔE separation + contrast floor) run before shipping any new categorical chart
- Figma for the narrative wireframe/storyboard source design
- A hand-built interactive HTML prototype (vanilla JS, inline SVG charts) implementing the 5-frame storyboard above, as a stand-in for the eventual hosted deliverable
- A device-bridge workflow for moving scripts/data between the shared project folder and the analysis sandbox, with base64-transfer and post-write verification as a reliability check

**Technical hurdles remaining before October 7**
- **Hosting decision**: the current prototype is a single static HTML file with hand-rolled interactivity; we still need to decide whether the final deliverable is this same approach scaled up, or a proper front-end build (e.g. React/D3) that our Figma can hand off to more cleanly
- **Real basemap tiles**: the geographic (insured-workforce zone) map cannot fetch live street-tile basemaps from inside our current analysis sandbox (network policy); we have a working script but it needs to be run on a machine with normal internet access before final export
- **Live vs. synthesized data**: several figures (payroll, workforce composition) are point-estimates triangulated from CLW reports and internal filings, not a live feed — we need one pass reconciling every number against its cited source before the appendix is finalized
- **Accessibility/responsive QA**: the prototype needs a phone-width and dark-mode pass; some chart labels currently assume desktop width
- **Algorithmic Forensics completeness**: the appendix draft above needs one more audit pass specifically modeled on the Chain of Custody Audit Card format from the 9/16 exercise, with each metric's provenance chain filled in explicitly rather than narratively

**Nine-day plan**
- **Days 1–2**: Reconcile every visualized number against its source spreadsheet; fill in the Chain-of-custody-style provenance table for the appendix
- **Days 3–4**: Decide and commit to final hosting approach; if scaling the current prototype, begin componentizing the five states; if rebuilding, port the real data/logic first
- **Days 5–6**: Re-run the geographic map with live basemap tiles on unrestricted network; integrate into the prototype
- **Day 7**: Responsive + dark-mode + accessibility pass across all five states
- **Day 8**: Team review against the Team Canvas and rehearsal of the video presentation
- **Day 9**: Buffer / final polish before October 7 review
