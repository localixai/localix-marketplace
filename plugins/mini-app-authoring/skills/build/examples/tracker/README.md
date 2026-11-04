# Example Tracker

A job search tracker: companies, and the applications made to them. It is the worked example of **a
list app done properly**: one screen with a header, a toolbar, a master-detail list, a data table,
add/edit dialogs, every state, and agent tools that keep the same data.

## When to copy from it

Copy it when your app is a list of records the person scans, filters, sorts, edits and deletes (a
reading list, a CRM, an inbox, an inventory), especially with a second collection that belongs to
the first (a cascade on delete). For a board with columns use `board/`; for numbers and charts use
`dashboard/`.

## What it shows

- Two related collections with a **cascade**: removing a company removes its applications, in one
  function used by the screen's route and the agent's tool.
- A page shell, a resizable master-detail pane with a timeline, and a table with sort, multi-select,
  bulk delete behind a confirm dialog, and "Show more".
- One add/edit dialog **validated by the shared zod schema**, a sentence per field, focus on the
  first invalid field, and the server's refusal shown inside the dialog.
- Loading skeletons, an empty state with actions, "no match" with a way out, and an error with retry.
- Formatting with `Intl` (money, dates, plurals) and an em dash for a missing value.

## Read the files in this order

1. `shared/model.ts`: the schemas without defaults, and the rules both sides call (`patchFor`).
2. `shared/report.ts`: what the agent is told, and what the screen publishes as context.
3. `backend/companies.ts`, `backend/applications.ts`: the two collections and how a record is made.
4. `backend/cascade.ts`: the rule that removes a company with its applications.
5. `backend/index.ts`: `register`, and the route that carries the cascade.
6. `backend/tools.ts`: the agent's tools (add, update, find, report, remove a company).
7. `backend/index.test.ts`: the backend tested as the agent and the screen use it.
8. `ui/App.tsx`: the screen's state and writes; everything else takes plain props.
9. `ui/list-view.tsx`, `ui/list-parts.tsx`, `ui/detail-pane.tsx`: master-detail with a timeline.
10. `ui/table-view.tsx`, `ui/table-parts.tsx`: the data table.
11. `ui/application-form.tsx`, `ui/company-form.tsx`, `ui/form-dialog.tsx`: the dialogs.
12. `ui/states.tsx`, `ui/toolbar.tsx`, `ui/use-filters.ts`, `ui/format.ts`, `ui/status.ts`: the rest.
13. `ui/test-support.tsx` and the `*.dom.test.tsx` files: how a screen is tested like a person uses it.
