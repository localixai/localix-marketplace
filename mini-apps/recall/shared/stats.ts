import { addDays } from './day'
import type { QueueCounts } from './queue'

/**
 * The numbers behind Today and Stats, as pure functions over the per-day aggregates SQL returns.
 * Days are study-day keys ('YYYY-MM-DD', see `shared/day.ts`); a missing day is a zero.
 */

export interface DayCount {
  day: string
  reviews: number
  /** Answered with anything but Again. */
  correct: number
  ms: number
}

/** The last `span` days ending today, each filled (zero when nothing happened). */
export function dailySeries(rows: readonly DayCount[], todayKey: string, span: number): DayCount[] {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  return Array.from({ length: span }, (_, index) => {
    const day = addDays(todayKey, index - span + 1)
    return byDay.get(day) ?? { day, reviews: 0, correct: 0, ms: 0 }
  })
}

/** Cards due per day for the next `span` days; anything overdue counts today. */
export function forecastSeries(
  rows: readonly { day: string; count: number }[],
  todayKey: string,
  span: number,
): { day: string; count: number }[] {
  const series = Array.from({ length: span }, (_, index) => ({
    day: addDays(todayKey, index),
    count: 0,
  }))
  const index = new Map(series.map((entry, at) => [entry.day, at]))
  for (const row of rows) {
    const at = row.day < todayKey ? 0 : index.get(row.day)
    if (at !== undefined) series[at]!.count += row.count
  }
  return series
}

/** Days in a row with a review, ending today (or yesterday while today has none yet). */
export function streak(rows: readonly DayCount[], todayKey: string): number {
  const studied = new Set(rows.filter((row) => row.reviews > 0).map((row) => row.day))
  let day = studied.has(todayKey) ? todayKey : addDays(todayKey, -1)
  let count = 0
  while (studied.has(day)) {
    count += 1
    day = addDays(day, -1)
  }
  return count
}

export interface HeatCell {
  day: string
  reviews: number
  goalMet: boolean
  /** 0 nothing, 1..4 by share of the goal. */
  level: 0 | 1 | 2 | 3 | 4
}

/** The last `weeks` weeks of days ending today, each with whether the daily goal was met. */
export function heatmap(
  rows: readonly DayCount[],
  todayKey: string,
  goal: number,
  weeks = 12,
): HeatCell[] {
  return dailySeries(rows, todayKey, weeks * 7).map((row) => {
    const share = goal > 0 ? row.reviews / goal : 0
    const level = row.reviews === 0 ? 0 : share >= 1 ? 4 : share >= 0.66 ? 3 : share >= 0.33 ? 2 : 1
    return { day: row.day, reviews: row.reviews, goalMet: row.reviews >= goal, level }
  })
}

/** Share of reviews answered correctly, or `null` with none. */
export function retentionOf(correct: number, total: number): number | null {
  return total > 0 ? correct / total : null
}

/** Typical seconds per card before there is history to measure. */
export const DEFAULT_CARD_MS = 8_000

/** Minutes a session takes: a new card takes about twice a review. At least 1 when any is due. */
export function estimateMinutes(counts: QueueCounts, averageMs: number | null): number {
  const per = averageMs && averageMs > 0 ? Math.min(averageMs, 60_000) : DEFAULT_CARD_MS
  const units = counts.learning + counts.review + counts.new * 2
  return units ? Math.max(1, Math.round((units * per) / 60_000)) : 0
}

/** FSRS-6's default decay; intervals at another retention scale by `intervalFactor`. */
const DECAY = -0.1542

/**
 * How much longer (or shorter) intervals are at `retention` than at 90%: FSRS's interval is
 * S/F·(r^(1/decay) − 1), and S is by definition the interval at 90%.
 */
export function intervalFactor(retention: number): number {
  const base = 0.9 ** (1 / DECAY) - 1
  return (retention ** (1 / DECAY) - 1) / base
}

export interface StateCounts {
  new: number
  learning: number
  /** Review cards with an interval under 21 days. */
  young: number
  mature: number
  paused: number
  hard: number
  drafts: number
}
