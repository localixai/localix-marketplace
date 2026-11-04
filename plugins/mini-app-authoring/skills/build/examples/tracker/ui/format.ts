import { formatRelativeTime } from '@localixai/mini-app-sdk/ui/utilities'

/**
 * Formatting the tracker shares. Money, dates and counts are formatted in one place so a screen
 * never prints "1 applications", "$90000" or "Invalid Date". The locale is fixed so the tests read
 * the same everywhere; a real app passes `undefined` to follow the person's own locale.
 */
const LOCALE: string | undefined = 'en-US'

/** What a missing value shows: an em dash, never an empty cell, "null" or "N/A". */
export const EM_DASH = '—'
export const orDash = (value: string | null | undefined): string => value || EM_DASH

// Intl formatters are costly to build: make each once.
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
const longDate = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' })
const longDateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })
const shortDate = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' })
const pluralRules = new Intl.PluralRules(LOCALE)

/** `$90,000`; a missing amount is an em dash. */
export const formatMoney = (amount: number | null | undefined): string =>
  amount == null ? EM_DASH : money.format(amount)

/** `$1.2M`, `$90K`: for a place where the whole amount would not fit. */
export const formatCompactMoney = (amount: number | null | undefined): string =>
  amount == null ? EM_DASH : compactMoney.format(amount)

/** A `YYYY-MM-DD` day read as a local day, so the date never slips a day with the time zone. */
export function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year!, month! - 1, date)
}
const asDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDay(value) : new Date(value)

function format(formatter: Intl.DateTimeFormat, value: string | null | undefined): string {
  const date = value ? asDate(value) : null
  return date && !Number.isNaN(date.getTime()) ? formatter.format(date) : EM_DASH
}
/** `Nov 3, 2026`. Missing or invalid is an em dash. */
export const formatDate = (value: string | null | undefined) => format(longDate, value)
/** `Nov 3, 2026, 2:30 PM`: for a `title` behind a relative time. */
export const formatDateTime = (value: string | null | undefined) => format(longDateTime, value)
/** `Nov 3`: for a table cell. */
export const formatShortDate = (value: string | null | undefined) => format(shortDate, value)

/**
 * Relative time for a moment in the past: `now`, `5m`, `3h`, `2d` (the SDK's own formatter, with
 * "ago" added), then a short date. Pass `now` from `useNow` so a screen left open stays current.
 */
export function formatRelative(value: string | null | undefined, now: number): string {
  const date = value ? asDate(value) : null
  if (!date || Number.isNaN(date.getTime())) return EM_DASH
  const past = formatRelativeTime(Math.min(date.getTime(), now), now)
  return /^\d+[mhd]$/.test(past) ? `${past} ago` : past
}

/** The right form for a count: `plural(1, 'role', 'roles')` is `role`. English has two forms. */
export const plural = (count: number, one: string, other: string): string =>
  pluralRules.select(count) === 'one' ? one : other
