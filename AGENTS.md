# Dashboard Coding Instructions

When editing this repository, first read:

1. `docs/DASHBOARD_CONTEXT.md`
2. `docs/DASHBOARD_MAINTENANCE.md`

Keep changes scoped:

- Edit one tab or one data loader at a time.
- Do not rewrite a full tab when changing one section.
- Put reusable business logic in an engine/helper file, not inside JSX.
- Keep sheet IDs, benchmarks, tab names, and workflow rules in `dashboard/src/config.js`.
- Keep Google Sheets parsing/loading in `dashboard/src/utils/sheets.js`.
- For workshop audit changes, prefer `dashboard/src/tabs/performance/auditEngine.js` for logic and `dashboard/src/tabs/Performance.jsx` for display only.
- Run `npm run build` from `dashboard/` before committing dashboard code.

Deployment:

- Source lives in `dashboard/src`.
- GitHub Actions builds `dashboard/dist` into `docs/dashboard`.
- Do not hide credentials or writable API tokens in frontend code.
