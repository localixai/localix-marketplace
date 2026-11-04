/**
 * Number and date formatting, in `shared/` because the agent's report words the same figures the
 * screen shows. All of it goes through `Intl`: never `toFixed`, never a hand-built "$" or "1 items".
 *
 * The locale is fixed so the example reads (and tests) the same everywhere. A real app passes
 * `undefined` to follow the person's own locale.
 */
const LOCALE: string | undefined = 'en-US'

/** What a missing value shows: an em dash, never an empty cell, "null" or "NaN". */
export const EM_DASH = '—'

const money = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const compactMoney = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const percent = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 })
const monthName = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' })
const monthShort = new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' })
const plurals = new Intl.PluralRules(LOCALE)

/** `$1,284`: a whole amount. */
export const formatMoney = (amount: number): string => money.format(amount)
/** `$1.3K`: for a stat card or a chart value where the full amount would not fit. */
export const formatCompactMoney = (amount: number): string => compactMoney.format(amount)
/** A fraction as a percent: `0.4` is `40%`. Missing or not finite is an em dash. */
export const formatPercent = (fraction: number | null | undefined): string =>
  fraction == null || !Number.isFinite(fraction) ? EM_DASH : percent.format(fraction)
/** A signed change: `+12%`, `−8%`, `0%`. `Intl` writes the real minus sign. */
export const formatChange = (fraction: number | null): string =>
  fraction == null
    ? EM_DASH
    : new Intl.NumberFormat(LOCALE, {
        style: 'percent',
        maximumFractionDigits: 0,
        signDisplay: 'exceptZero',
      }).format(fraction)

/** A `YYYY-MM` month as a date in that local month (the 1st, so no time zone can move it). */
const firstOf = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1)
/** `November 2026`. */
export const formatMonthLong = (month: string): string => monthName.format(firstOf(month))
/** `Nov 2026`. */
export const formatMonth = (month: string): string => monthShort.format(firstOf(month))
/** `November`, for a sentence that already knows the year. */
export const monthOnly = (month: string): string =>
  new Intl.DateTimeFormat(LOCALE, { month: 'long' }).format(firstOf(month))

/** `1 expense`, `3 expenses`: `Intl.PluralRules` picks the form, the number is formatted. */
export const countOf = (count: number, one: string, other = `${one}s`): string =>
  `${count.toLocaleString(LOCALE)} ${plurals.select(count) === 'one' ? one : other}`
