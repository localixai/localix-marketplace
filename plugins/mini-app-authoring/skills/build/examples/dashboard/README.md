# Example Dashboard

A worked example of a **numbers screen**: spending by month and category, budgets with tone beside
the number, and a few sentences that say what the numbers mean. The agent records expenses from the
chat and reports the same figures the screen shows.

## When to copy from it

Copy this when the screen is mostly derived numbers over a collection: stat cards, a distribution,
a trend, targets, insights. Its pattern: one collection, **one pure `summarize`**, one custom
`/summary` route, and one function that words the result for both the screen and the agent.

## Read the files in this order

1. `shared/model.ts`: the expense schemas (no `.default()`), the budgets and `summarize`, the one function every number comes from.
2. `shared/format.ts`: `Intl` money, percent, month and plural helpers; an em dash for a missing value.
3. `shared/report.ts`: `insightsOf`, `describeSummary` and the budget tone, used by the screen and the agent alike.
4. `backend/expenses.ts`: the collection; the date default is filled in `create`.
5. `backend/index.ts`: `register`, with the custom `/summary` route.
6. `backend/tools.ts`: the record and report tools, and the write-tool shape.
7. `ui/App.tsx`: `usePolledSnapshot`, `StatSection`/`StatCard`, `DistributionChart`, `TrendChart` (`bucketLabel="month"`), the states and the agent context.
8. `ui/parts.tsx`: `BudgetRow` (a `ProgressBar` with tone) and the loading skeleton.
9. `ui/register.tsx` and `guide.md`: the tab, and how the agent uses the tools.
10. Tests: `shared/*.test.ts` (math and wording), `backend/index.test.ts` (tools and route agree), `ui/App.dom.test.tsx` (figures, tone, states).
