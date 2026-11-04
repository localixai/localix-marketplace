/**
 * Formatting the board shares. Counts and days are formatted in one place so a screen never prints
 * "1 cards", "Invalid Date" or an empty cell. The locale is fixed so the tests read the same
 * everywhere; a real app passes `undefined` to follow the person's own locale.
 */
const LOCALE: string | undefined = 'en-US'

/** What a missing value shows: an em dash, never an empty cell, "null" or "N/A". */
export const EM_DASH = '—'

const shortDate = new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric' })
const longDate = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' })
const number = new Intl.NumberFormat(LOCALE)
const pluralRules = new Intl.PluralRules(LOCALE)

/** A `YYYY-MM-DD` day read as a local day, so the date never slips a day with the time zone. */
function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year!, month! - 1, date)
}

/** The local day of a moment as `YYYY-MM-DD`: what a card's `due` is compared with. */
export function dayOf(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `Nov 12, 2026`, for a tooltip. A missing day is an em dash. */
export function formatDate(day: string | null | undefined): string {
  return day ? longDate.format(parseDay(day)) : EM_DASH
}

/**
 * A due day, which is a day and not a moment: "today", "tomorrow", "in 5d", "2d ago", then a short
 * date. Compared by calendar day, so a card due today never reads "in 0d" or "5h ago".
 */
export function formatDue(day: string | null | undefined, now: number): string {
  if (!day) return EM_DASH
  const days = Math.round((parseDay(day).getTime() - parseDay(dayOf(now)).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 1 && days <= 14) return `in ${days}d`
  if (days < -1 && days > -7) return `${-days}d ago`
  return shortDate.format(parseDay(day))
}

/** `plural(1, 'card', 'cards')` is `card`: `Intl.PluralRules` picks the form by the language. */
export function plural(count: number, one: string, other: string): string {
  return pluralRules.select(count) === 'one' ? one : other
}

/** `1 card`, `1,200 cards`, with the number formatted. */
export const countOf = (count: number, one: string, other = `${one}s`): string =>
  `${number.format(count)} ${plural(count, one, other)}`

/** `5 pts`, and an em dash for a column or card with none. */
export const formatPoints = (points: number | null | undefined): string =>
  points ? `${number.format(points)} pts` : EM_DASH
