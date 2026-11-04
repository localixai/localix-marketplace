Read this when you design a tool app (a tracker, table, dashboard, workbench) so it looks like Localix; for a game, learning or media app with its own character read `design-own.md` instead.

# The Localix look

## Contents

- Kit first
- Tokens and type
- The page anatomy
- Words, numbers and dates
- Lists and tables
- Charts
- Empty, loading and error states
- What the style gate refuses

A finished screen is a polished product screen, not a form above a raw list. Decide the page before writing it. **The squint test:** blurred, the eye still finds the one number that matters, then its breakdown, then the items. `examples/tracker/` and `examples/dashboard/` are the bar; copy their structure.

## Kit first

Build every control from the kit; a hand-made button, tab row, checkbox, progress bar or empty state drifts from the rest of the app and fails the style gate.

- `KIT.md` in the app folder (written by every `mini-app check`; never edit it) lists each kit module by the job it does. Search it for the job, do not read it whole.
- `mini-app api <module>` prints a module's exports with types; `mini-app api <module> <export>` one of them; `mini-app api <word>` finds names. Look a prop up instead of guessing it.
- Import `@localixai/kit/<id>`; the app never bundles its own copy. Sizes are control-ladder rungs: `xs` 20 · `sm` 24 · `md` 28 · `lg` 32 · `xl` 36 px, never a height in `className`. Action tone: `default` or `danger`/`destructive`; status tone: `neutral`, `info`, `success`, `warning`, `error`. `recommended` on the one `Button` that is the safe, expected next step.
- Most often hand-rolled, so check these first: tabs (`TabBar`), a checkbox column (`Checkbox`), a progress track (`ProgressBar`), an empty state (`StateNotice`), a labelled field (`Field`), a search box (`SearchInput`), a choice (`Select`, `SegmentedRadioGroup`), a menu (`MenuEntries` over `DropdownMenu`/`ContextMenu`), a stat (`StatCard`), a chip (`Chip`), a header (`PanelHeader`).
- Where the host's `Button`/`IconButton` prop names changed, trust `mini-app api` over older text (`IconButton` takes `aria-label` and optional `tooltip`).

## Tokens and type

Colour is meaning, never decoration. Host tokens only; they follow light and dark by themselves.

| Job | Class |
| --- | --- |
| Body text / secondary / tertiary | `text-foreground` / `text-text-soft` / `text-text-faint` |
| Hairlines | `border-border-faint` (rows), `border-border-soft` (groups), `border-border`; `divide-border-faint` |
| Surfaces | `bg-surface-hover`, `bg-surface-active`, `bg-surface-sunken`, `bg-surface-raised` |
| Status, always beside words or a number | `text-status-success` on track, `-warning` near a limit, `-error` over it, `-info`; a tint is `bg-status-warning/12` |
| A chart series | `var(--chart-1)` … `--chart-8` |
| Radius | `rounded-xs/sm/md/lg/xl/full` (md or lg for panels) |
| Lift | `shadow-(--shadow-raised\|soft\|popover\|drawer)` |
| Motion | `duration-(--dur-instant\|fast\|base\|moderate\|slow)`, `ease-(--ease-soft\|emphasized\|standard\|exit)`; name the properties (`transition-colors`) |
| Layers | `z-(--z-raised\|controls\|sticky\|overlay\|popover\|tooltip)` |

Type: the host's fonts (`font-sans` Inter, `font-heading`, `font-mono` for code, ids and paths only); never set a `font-family`. Sizes on the scale `text-3xs … text-sm … text-3xl`, never `text-[13px]`. A headline number is `text-3xl font-semibold tabular-nums`, its goal and unit beside it in `text-xs text-text-faint`. A row title is `text-sm font-medium`, its meta line `text-xs text-text-faint`, a value right-aligned with `tabular-nums` and a muted unit. Text in a flex row gets `min-w-0` and `truncate` (full text in `title`) or `line-clamp-2`.

Group by space and dividers, not boxes: at most one container level (a `rounded-lg border` list with `divide-y divide-border-faint`), never a card in a card. Tight inside a group (`gap-1` to `gap-2`), generous between groups (`gap-6`). Use the width: columns and panes share it (`flex-1` with a `min-w`), never a few fixed narrow columns beside an empty half. No gradients, glow, glass, thick side stripes or emoji.

Icons: `lucide-react`, sized by context (`size-3` in a meta line, `size-4` in a button via `data-icon="inline-start"`). A glyph that carries meaning has a text label or `aria-label`.

## The page anatomy

```text
PanelHeader      title, a one-line summary, actions on the right
ProblemLine      only when a read failed and items are still shown
Toolbar          SearchInput + filters (WorkbenchFilterBar) / WorkbenchToolbar for the action on the selection
Body             the one scrolling region: the hero figure, then the items
```

Lead with what the person came for.

- A **tracker**: one headline number (today's kcal, this month's spend) with its goal, in a `ContextRing` (`fraction` 0–1) or above a `ProgressBar`, then its history in a `TrendChart`, then the items.
- A **list, table or board**: the items themselves, a toolbar above (search, filters, the action on the selection) and the totals in one line.
- A **dashboard**: a few `StatCard`s grouped by `StatSection`, charts that answer a question, and a table that lets the person act. Never a row of identical stat tiles with nothing under them.
- A **detail beside a list**: master-detail, the detail a second column from `@lg` (see `screens.md`).

A card has anatomy: a title, a meta line (company · owner) with `size-3` icons, the figure that matters, a status dot or badge.

## Words, numbers and dates

A button says verb and object ("Log meal", never "Submit"). One name per thing across the screen, the tools and `guide.md`. An error says what failed and what to do. Counts read as words: never "1 deals".

Format with `Intl`; build each formatter once at module level (they are costly); follow the person's locale by passing `undefined`. Put them in `shared/format.ts` so the screen and the tools say the same thing.

```ts
const LOCALE: string | undefined = undefined
export const EM_DASH = '—' // a missing value is a dash, never "", "null" or "N/A"

const money = (currency: string) => new Intl.NumberFormat(LOCALE, { style: 'currency', currency, maximumFractionDigits: 0 })
export const formatMoney = (amount: number, currency = 'USD') => money(currency).format(amount) // $84,000 · 12 000 ₽
const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 })
export const formatPercent = (fraction: number | null | undefined) =>
  fraction == null || !Number.isFinite(fraction) ? EM_DASH : percent.format(fraction)
const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })
export const formatCompact = (value: number) => compact.format(value) // 1.2K, for a stat that would not fit

// Plurals: Intl.PluralRules, never `count === 1 ? … : …s` for a language that has more forms.
const rules = new Intl.PluralRules(LOCALE)
export const countOf = (count: number, forms: { one: string; other: string } & Partial<Record<Intl.LDMLPluralRule, string>>) =>
  `${count} ${forms[rules.select(count)] ?? forms.other}`
```

Dates: a day without a time is `'YYYY-MM-DD'`; read it as a **local** day (`new Date(y, m - 1, d)`) so it never slips a day with the time zone. A moment is an ISO time in UTC. Show `Nov 3` or `3h ago` with the full date in `title`; use `formatRelativeTime(timestamp, now?)` from `@localixai/mini-app-sdk/ui/utilities` and re-render it with `useNow(60_000, active)`. The same module has `formatTimeAgo`, `formatDuration`, `formatElapsed`, `formatFileSize`, `formatTokens`, `formatUsd` and `formatBucketLabel`. Use `tabular-nums` wherever numbers line up. `examples/tracker/` has the whole set with its tests.

## Lists and tables

| Use | When |
| --- | --- |
| A `rounded-lg border` list with `divide-y`, rows by `WorkbenchListRow` or your own anatomy | a few columns, mostly read, each item a sentence |
| `TableGrid` (`@localixai/mini-app-sdk/ui/components`) | tabular data: typed columns, sorting (`sort`, `onToggleSort`), paging (`onReachEnd`, `total`), optional editing (`editable`, `onCellEdit`) |
| Your own rows with `Checkbox` (indeterminate on the header) + a toolbar | the person **selects rows to act on**: `TableGrid` has no row selection. Put the count and the actions in the toolbar above; keep sort, filters and search in shared functions the tools use too |
| `CardGrid`/`ItemCard` | browsable collections with a page of their own per item |

`TableGrid` is never a raw `<table>`. Search is `SearchInput`, choices `Select` (a few) or `Combobox` (many, searchable), several on/off filters `TogglePill`.

## Charts

`TrendChart` (a value over days or months) and `DistributionChart` (shares by category) from `@localixai/mini-app-sdk/ui/stats-charts` take points `{ key, value, detail? }` and a `formatValue`; `ChartView` (`ui/charts`) draws bar, line, area and pie from a dataset spec. Feed them from the shared logic, never from numbers made up for the screen. Series use `--chart-N`, not hex.

```tsx
<TrendChart points={byMonth} formatValue={formatMoney} bucketLabel="month" emptyLabel="No spending yet" />
<DistributionChart rows={byCategory} formatValue={formatMoney} selectedKey={filter} onSelect={setFilter} />
```

A `TrendChart` over months takes `bucketLabel="month"`, or its caption says "/day". A chart that answers a question has a caption that names it. `DistributionChart` rows can select a filter. For a chart library of your own see `design-own.md`.

## Empty, loading and error states

- **Empty** points to the chat, with an icon: `StateNotice icon={…} title="Nothing here yet" body="Attach a photo of your meal and ask to log it, or add one above."`. Never a blank pane, never sample data.
- **Loading**: `LoadingHint` or `Skeleton`; controls disabled while a change is sending.
- **No match** is not empty: "No meals match “soup”" with a clear action.
- **Error**: `ProblemLine` over the items that remain, `StateNotice`/`ProblemState` when it is the whole pane.

## What the style gate refuses

`mini-app check` scans `ui/**/*.{ts,tsx}` and `shared/**/*.tsx` (not tests, not `.css`) and reports each hit as `file:line`. A rule exists because the thing looks like somebody else's app or breaks in a theme.

| Rule | Why | Use instead |
| --- | --- | --- |
| native control (`<button>`, `<select>`, `<textarea>`, `<input>` except file/range/color/hidden) | the kit carries the focus ring, height and tokens | the kit control; a deliberate native hit target (a board cell) gets a comment `mini-app: native-control — <reason>` on its line or the line above |
| palette colour (`text-red-500`, `bg-emerald-500`) | does not follow the theme | `text-status-*`, `--chart-N` |
| `text-muted-foreground`, `text-foreground/60` | off the text tiers | `text-text-soft`, `text-text-faint` |
| literal duration / stock easing / `transition-all` | off the motion scale | `duration-(--dur-fast)`, `ease-(--ease-soft)`, `transition-colors` |
| raw `z-10` | unstacked layers | `z-(--z-raised)` |
| `text-[10px]` | off the type scale | `text-2xs`, `text-xs` |
| `border-border/40` | hand-picked alpha | `border-border-faint\|soft` |
| `rounded`, `rounded-[7px]` | off the radius scale | `rounded-md` |
| `shadow-sm\|md\|lg` | stock shadow | `shadow-(--shadow-raised)` |
| `mx-auto` with `max-w-*` | a centred column in a pane | fill the pane; prose `max-w-(--reading-measure)` |
| `bg-clip-text`, `bg-gradient-*`, `border-l-4`, emoji, `animate-bounce\|ping`, `shadow-[0_0_12px]` | decoration standing in for structure | flat host surfaces, `divide-y`, words with `text-status-*`, a lucide icon |
| an absent token (`text-text-sofy`) | builds, type-checks and paints nothing | the real token |
| `@hono/zod-validator` / `hono/validator`, a leftover of the template's domain, a missing test, the template's `icon.svg`, a file over 300 lines | house rules | `routeValidator`, the app's own domain, `mini-app icon` |

The gate reads class strings and source: a class assembled at runtime from variables passes unchecked, and a rule it cannot see is still yours to keep. Taste a regex cannot judge (one headline, flat structure, words on buttons) is the brief above.
