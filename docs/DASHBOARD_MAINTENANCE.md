# Dashboard Maintenance

## Goal

Keep future dashboard changes small, cheap, and safe. A new requirement should usually edit one focused file, not a whole tab.

## Where To Edit

- Sheet IDs, benchmarks, tab names: `dashboard/src/config.js`
- CSV parsing, Google Sheets reads, amount parsing: `dashboard/src/utils/sheets.js`
- Date helpers: `dashboard/src/utils/dates.js`
- Number and currency display: `dashboard/src/utils/format.js`
- Performance audit business rules: `dashboard/src/tabs/performance/auditEngine.js`
- Performance tab layout: `dashboard/src/tabs/Performance.jsx`
- One-off tab UI changes: the matching file in `dashboard/src/tabs/`

## Editing Pattern

1. Read `docs/DASHBOARD_CONTEXT.md`.
2. Find the smallest owning file for the requested change.
3. Change logic in helper/engine files before changing UI.
4. Keep JSX files mostly presentational.
5. Run `npm run build` in `dashboard/`.
6. Commit with a narrow message.

## Current Refactor State

Good:

- Tabs are separate files.
- Shared sheet reads are centralized.
- Performance audit logic is split into `performance/auditEngine.js`.
- Business constants are in config.

Still worth improving later:

- Split `Sales.jsx` into sub-tabs and a sales engine.
- Split `CRM.jsx` into sub-tabs and CRM helpers.
- Move common table/card styles into shared UI components.
- Add a safe write endpoint for `AuditMemory` and Slack posting.

## Codex Usage Rules

- Prefer reading these docs over re-reading the whole conversation.
- Prefer small patches over full-file rewrites.
- Avoid running broad searches unless changing cross-cutting behavior.
- When adding a new metric, add the calculation in an engine/helper file and surface it in JSX.
- When adding a new source, add config first, then loader, then UI.
