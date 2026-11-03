import { formatRelativeTime } from '@localixai/mini-app-sdk/ui/utilities'

/**
 * Formatting helpers every pattern shares. Numbers, money, dates and counts are formatted in one
 * place so a screen never prints "1 deals", "$84000" or "Invalid Date".
 *
 * The locale is fixed so the gallery reads (and tests) the same everywhere. A real app passes
 * `undefined` to follow the person's own locale.
 */
const LOCALE: string | undefined = 'en-US'

/** What a missing value shows: an em dash, never an empty cell, "null" or "N/A". */
export const EM_DASH = '—'
export const orDash = (value: string | null | undefined): string => value || EM_DASH

// Intl formatters are costly to build; one per currency, made on first use.
const moneyFormats = new Map<string, Intl.NumberFormat>()
function moneyFormat(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`
  let format = moneyFormats.get(key)
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      maximumFractionDigits: compact ? 1 : 0,
      ...(compact ? { notation: 'compact' as const } : {}),
    })
    moneyFormats.set(key, format)
  }
  return format
}

/** `$84,000`, `€41,500`: a whole amount in its own currency. */
export const formatMoney = (amount: number, currency: string = 'USD'): string =>
  moneyFormat(currency, false).format(amount)

/** `$1.2M`, `€41.5K`: for a column total or a stat card where the full amount would not fit. */
export const formatCompactMoney = (amount: number, currency: string = 'USD'): string =>
  moneyFormat(currency, true).format(amount)

const compactNumber = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
})
/** `1.2K`, `3.4M`. */
export const formatCompact = (value: number): string => compactNumber.format(value)

const percentNumber = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 })
/** A fraction as a percent: `0.4` → `40%`. A missing value is an em dash. */
export const formatPercent = (fraction: number | null | undefined): string =>
  fraction == null || !Number.isFinite(fraction) ? EM_DASH : percentNumber.format(fraction)

/** A `YYYY-MM-DD` day read as a local day, so the date never slips a day with the time zone. */
export function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year!, month! - 1, date)
}
const asDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDay(value) : new Date(value)

/** The local month of a moment as `YYYY-MM`, the key a close date's first seven characters match. */
export const monthOf = (timestamp: number): string => {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const longDate = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' })
const longDateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })
const shortDate = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' })

/** `Nov 3, 2026`; an ISO day or timestamp. Missing or invalid is an em dash. */
export function formatDate(value: string | null | undefined): string {
  const date = value ? asDate(value) : null
  return date && !Number.isNaN(date.getTime()) ? longDate.format(date) : EM_DASH
}

/** `Nov 3, 2026, 2:30 PM`: the full moment, for a `title` behind a relative time. */
export function formatDateTime(value: string | null | undefined): string {
  const date = value ? asDate(value) : null
  return date && !Number.isNaN(date.getTime()) ? longDateTime.format(date) : EM_DASH
}

/** `Nov 3`: a date in a tight space such as a table cell or a chart axis. */
export function formatShortDate(value: string | null | undefined): string {
  const date = value ? asDate(value) : null
  return date && !Number.isNaN(date.getTime()) ? shortDate.format(date) : EM_DASH
}

/** `Nov 2026`, from a `YYYY-MM` month. */
export const formatMonth = (month: string): string =>
  new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' }).format(
    parseDay(`${month}-01`),
  )

/** "tomorrow", "in 3d", "in 2w", then a short date: how far ahead a day or moment is. */
function ahead(days: number, date: Date): string {
  if (days <= 1) return 'tomorrow'
  if (days <= 14) return `in ${days}d`
  if (days < 60) return `in ${Math.round(days / 7)}w`
  return shortDate.format(date)
}

/**
 * Relative time for a moment that may be past or future. The past re-uses the SDK's
 * `formatRelativeTime` (`now`, `5m`, `3h`, `2d`, then a short date), which does not read a future
 * moment; this adds "in 3d" for it. Pass `now` from `useNow` so a screen that stays open keeps
 * current.
 */
export function formatRelative(value: string | null | undefined, now: number): string {
  const date = value ? asDate(value) : null
  if (!date || Number.isNaN(date.getTime())) return EM_DASH
  const timestamp = date.getTime()
  if (timestamp > now) return ahead(Math.ceil((timestamp - now) / 86_400_000), date)
  const past = formatRelativeTime(timestamp, now)
  return /^\d+[mhd]$/.test(past) ? `${past} ago` : past
}

/**
 * A close date, which is a day and not a moment: "today", "tomorrow", "in 5d", "3d ago". Compared
 * by calendar day so a deal closing today never reads "in 0d" or "5h ago".
 */
export function formatCloseDay(day: string | null | undefined, now: number): string {
  if (!day) return EM_DASH
  const closes = parseDay(day)
  if (Number.isNaN(closes.getTime())) return EM_DASH
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const days = Math.round((closes.getTime() - today.getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days > 0) return ahead(days, closes)
  if (days === -1) return 'yesterday'
  return days > -7 ? `${-days}d ago` : formatShortDate(day)
}

const pluralRules = new Intl.PluralRules(LOCALE)
/**
 * The right form for a count: `plural(1, 'deal', 'deals')` is `deal`, `plural(2, …)` is `deals`.
 * `Intl.PluralRules` picks the form by the language's own rules; English has two. A language with
 * more forms would take them as a map instead of two arguments.
 */
export function plural(count: number, one: string, other: string): string {
  return pluralRules.select(count) === 'one' ? one : other
}

/** `1 deal`, `3 deals`, with the number formatted. */
export const countOf = (count: number, one: string, other = `${one}s`): string =>
  `${count.toLocaleString(LOCALE)} ${plural(count, one, other)}`
