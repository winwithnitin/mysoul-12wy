# Dashboard Context

This dashboard is for MySoulSchool / 12WY business review.

## Main Tabs

- `Marketing`: ad spend, leads, CPL, tracking gaps.
- `Ads Intelligence`: moved CRM Ads Performance view for campaign/adset enrollment attribution.
- `Sales`: enrollments, cashflow, closers, company revenue.
- `CRM`: students, defaulters, duplicates, ads performance.
- `Performance`: weekly workshop audit engine.
- `Finance`: monthly revenue, expense, net profit.
- `SUPER & RGM`: high-ticket EMI and launch cycle views.
- `LTV & Funnel`: LTV, ROAS, funnel progression, forecast, growth curve.

## Trusted Sources

- Sales/conversion/revenue truth: Students Records `Dashboard` tab configured as `SALES_SHEET`.
- Ad spend and lead pools: existing `SHEETS` config.
- Campaign/adset enrollment attribution: existing lead attribution loader used by CRM.
- Workshop calendar: `WORKSHOP_PMS`, tab `Plan`, where `STATUS = Done` means approved/happened.
- Daily show-up: `WORKSHOP_PERFORMANCE`, tab `ShowUp`, filled by Tanvi form.
- Audit notes/memory: `WORKSHOP_PERFORMANCE`, tab `AuditMemory`; current UI stores notes in browser localStorage until a write endpoint is added.
- Intern calls: `INTERNS_KPI`, one tab per intern.

## Workshop Types

- `UTW`: Tarot 3-day workshop, usually Monday-Wednesday.
- `ICP`: Tarot 1-day webinar, no invitation calls.
- `THW`: Tarot Health workshop.
- `R12`: Reiki workshop.

## Workshop Audit Rules

- Lead source window: previous Monday-Sunday before the reviewed workshop week.
- Tarot/UTW call window: Friday-Monday.
- Reiki/R12 call window: Tuesday-Thursday.
- ICP: no calls.
- TMR: ignored completely.
- Intern KPI date filter: Column B / Timeline.
- Intern KPI totals:
  - Tarot: D/E/F = leads assigned / calls attempted / connected.
  - Reiki: H/I/J = leads assigned / calls attempted / connected.
  - Formula ratio columns are ignored; ratios are recalculated.
- Show-up percent = Tanvi show-up / source lead pool.
- Conversion and ROAS use trusted Dashboard sales data available by Monday 12 PM.
- Performance conversion/revenue includes only core front-end programs: Tarot - Diploma, Tarot - Mastery, and Reiki - L1/L2.

## Benchmarks

- Tarot CPL: less than Rs. 250.
- Reiki CPL: less than Rs. 120.
- Tarot Day 1 show-up: greater than 28%.
- Tarot Day 2 show-up: greater than 18%.
- Tarot Day 3 show-up: greater than 13%.
- Tarot L1 conversion: greater than 2%.
- Reiki L1 conversion: greater than 1%.

## Important Product Decisions

- Do not trust manually reported conversion numbers from analytics sheets.
- Tanvi's daily form should stay simple: workshop name, day, start date, maximum people showed up.
- Slack posting should not be implemented with exposed frontend tokens. Use copy-to-Slack until a safe backend/App Script write path exists.
- New intern tabs should be discovered if possible; fallback tabs are configured in `INTERNS_KPI.fallbackTabs`.
