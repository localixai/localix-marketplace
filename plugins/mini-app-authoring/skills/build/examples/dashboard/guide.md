_Use: Record the person's expenses and answer how the month is going — spending, budgets, trend — from
the numbers the Spending screen shows. Use when they say they spent something or ask how they are
doing; not for income, accounts or anything outside USD expenses._

# Record an expense

- "I spent $42 on groceries": call `example_dashboard_add_expense` once per expense with a short
  `title`, the closest `category`, and the `amount` as a number in USD. Leave `date` out for today;
  give it as `YYYY-MM-DD` only when the person names another day.
- The tool answers with the month so far. Tell the person what was recorded and, in one line,
  anything that changed the picture (a budget now over its limit).

# Answer about the numbers

While the Spending tab is open, the person's message carries what it shows: answer from it. Call
`example_dashboard_report` when nothing is attached or for a fresh read. Quote its figures as they
are; never recompute them.
