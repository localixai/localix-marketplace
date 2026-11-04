import { formatMoment } from '../shared/format'

/** 2524 → "2,524". */
export const numberLabel = (value: number): string => value.toLocaleString('en-US')

/** 108003328 → "103 MB"; small sizes keep a decimal ("4.2 MB"), tiny ones are in KB. */
export function bytesLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  if (mb >= 10) return `${Math.round(mb)} MB`
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** The screen's clock: the person's zone and the host's wall time, read once per call. */
export const utcOffset = (): number => -new Date().getTimezoneOffset()

/** "18:40", "tomorrow 09:15", "4 Nov 09:15". */
export const momentOf = (iso: string, now: number): string =>
  formatMoment(iso, new Date(now), utcOffset())

/** "next at 18:40" today, "next tomorrow 09:15" otherwise. */
export function nextWords(iso: string, now: number): string {
  const moment = momentOf(iso, now)
  return /^\d\d:\d\d$/.test(moment) ? `next at ${moment}` : `next ${moment}`
}

/** 83 → "1:23"; 3725 → "1:02:05". */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const s = String(total % 60).padStart(2, '0')
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Monday-first weekday (0..6) of a 'YYYY-MM-DD' key. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}
export const weekdayName = (index: number): string => DAY_NAMES[index] ?? ''

/** Plain text for a field's error from a zod issue list: the first sentence of each field. */
export function fieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}
