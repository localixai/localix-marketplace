/**
 * Values as words, the same on the screen and in what the agent is told: intervals ("10 min",
 * "3 d", "2 mo"), counts ("1 card", "3 cards"), percentages, durations and moments. Pure: the time
 * zone is passed in as an offset, never read from the machine.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function trim(value: number): string {
  return value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)
}

/** An interval as a button label: "<1 min", "10 min", "3 h", "3 d", "2 mo", "1.5 y". */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return '<1 min'
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} min`
  if (ms < DAY) return `${Math.round(ms / HOUR)} h`
  const days = ms / DAY
  if (days < 30) return `${Math.round(days)} d`
  if (days < 365) return `${trim(days / 30)} mo`
  return `${trim(days / 365)} y`
}

/** "1 card", "3 cards", "0 cards"; an irregular plural is given. */
export function countOf(count: number, noun: string, plural = `${noun}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? noun : plural}`
}

/** 0.873 → "87%". */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/** Study time: "45 s", "12 min", "2 h 5 min". */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return `${Math.round(ms / 1000)} s`
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} min`
  const hours = Math.floor(ms / HOUR)
  const minutes = Math.round((ms % HOUR) / MINUTE)
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A day key as "4 Nov" (with the year when it is not `currentYear`). */
export function formatDay(key: string, currentYear?: number): string {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number]
  const text = `${day} ${MONTHS[month - 1]}`
  return currentYear !== undefined && year !== currentYear ? `${text} ${year}` : text
}

/**
 * A moment relative to now, in the person's zone: "18:40" today, "tomorrow 09:15",
 * "4 Nov 09:15" otherwise. `utcOffset` is minutes east of UTC.
 */
export function formatMoment(iso: string, now: Date, utcOffset: number): string {
  const local = new Date(Date.parse(iso) + utcOffset * MINUTE)
  const localNow = new Date(now.getTime() + utcOffset * MINUTE)
  const time = local.toISOString().slice(11, 16)
  const key = local.toISOString().slice(0, 10)
  const todayKey = localNow.toISOString().slice(0, 10)
  if (key === todayKey) return time
  const tomorrow = new Date(localNow.getTime() + DAY).toISOString().slice(0, 10)
  if (key === tomorrow) return `tomorrow ${time}`
  return `${formatDay(key, localNow.getUTCFullYear())} ${time}`
}

/** When a card is next due, in words: "now", "in 10 min", "in 3 d". */
export function formatDue(iso: string, now: Date): string {
  const ms = Date.parse(iso) - now.getTime()
  if (ms <= 0) return 'now'
  return `in ${formatInterval(ms)}`
}

/** Text cut to `max` characters on one line, with an ellipsis. */
export function snippet(text: string, max = 80): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`
}
