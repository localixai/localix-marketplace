/**
 * Time, injectable. Every function that depends on "now" or "today" takes a `Clock`, so tests pin
 * the moment and the time zone. A study day starts at `dayStartsAt` o'clock local time (4 am by
 * default), so a review at 1 am still counts for the day before.
 */
export interface Clock {
  now(): Date
  /** Minutes east of UTC at that moment (UTC+3 → 180). */
  utcOffset(at: Date): number
}

export const systemClock: Clock = {
  now: () => new Date(),
  utcOffset: (at) => -at.getTimezoneOffset(),
}

/** A fixed clock for tests and replays. */
export function fixedClock(at: Date | string, utcOffsetMinutes = 0): Clock {
  const moment = new Date(at)
  return { now: () => new Date(moment), utcOffset: () => utcOffsetMinutes }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
export const DAY_MS = 24 * HOUR

export interface StudyDay {
  /** 'YYYY-MM-DD' of the study day. */
  key: string
  /** The moment the study day starts and the next one starts, UTC. */
  start: Date
  end: Date
}

/**
 * The study day a moment falls in. The offset is the one at that moment; on the night a clock
 * changes the day is an hour longer or shorter, which only moves the boundary by that hour.
 */
export function studyDay(at: Date, dayStartsAt: number, utcOffset: number): StudyDay {
  const shifted = at.getTime() + utcOffset * MINUTE - dayStartsAt * HOUR
  const day = Math.floor(shifted / DAY_MS)
  const start = day * DAY_MS + dayStartsAt * HOUR - utcOffset * MINUTE
  return {
    key: new Date(day * DAY_MS).toISOString().slice(0, 10),
    start: new Date(start),
    end: new Date(start + DAY_MS),
  }
}

/** Today's study day by the clock. */
export function today(clock: Clock, dayStartsAt: number): StudyDay {
  const now = clock.now()
  return studyDay(now, dayStartsAt, clock.utcOffset(now))
}

/** The day key `days` after (or before, negative) a day key. */
export function addDays(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from one day key to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/**
 * The SQLite modifiers that turn a UTC ISO time into its study-day key with `date(x, …)`: the
 * zone's offset, then back by the day start. Used for per-day aggregates in SQL.
 */
export function sqlDayModifiers(dayStartsAt: number, utcOffset: number): [string, string] {
  return [`${utcOffset >= 0 ? '+' : ''}${utcOffset} minutes`, `-${dayStartsAt} hours`]
}
