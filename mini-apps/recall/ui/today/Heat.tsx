import { useRef, type CSSProperties } from 'react'
import { useElementWidth } from '@localixai/kit/lib'
import { addDays } from '../../shared/day'
import { countOf, formatDay } from '../../shared/format'
import type { Heatmap } from '../../shared/payloads-more'
import { weekdayName, weekdayOf } from '../format'

/** A cell and the gap between cells, and the column of weekday names, in px. */
export const CELL = 12
export const GAP = 3
const LABELS = 28
export const MOST_WEEKS = 53
/** Weeks drawn when the width is not known yet. */
const DEFAULT_WEEKS = 26

/** How many week columns fit in `width` px, at least 4, at most a year. */
export function weeksThatFit(width: number | null): number {
  if (width === null || width <= 0) return DEFAULT_WEEKS
  return Math.max(4, Math.min(MOST_WEEKS, Math.floor((width - LABELS) / (CELL + GAP))))
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Reviews as a grid of small fixed cells, like a contribution graph: a column a week, a row a
 * weekday (Monday on top), so a day sits where its weekday says. As many weeks as fit the width are
 * drawn, up to a year, newest on the right; days after today are left empty. Months are named over
 * the first week they start in, and Monday, Wednesday and Friday on the left.
 */
export function Heat({ heat }: { heat: Heatmap }) {
  const box = useRef<HTMLDivElement>(null)
  const weeks = Math.min(weeksThatFit(useElementWidth(box)), MOST_WEEKS)
  const today = heat.today.day
  const start = addDays(today, -weekdayOf(today) - (weeks - 1) * 7)
  const byDay = new Map(heat.cells.map((cell) => [cell.day, cell]))
  const slots = Array.from({ length: weeks * 7 }, (_, index) => {
    const day = addDays(start, index)
    return { day, column: Math.floor(index / 7) + 2, row: (index % 7) + 2, cell: day <= today ? byDay.get(day) : undefined }
  })
  const shown = slots.flatMap((slot) => (slot.cell ? [slot.cell] : []))
  const total = shown.reduce((sum, cell) => sum + cell.reviews, 0)
  const met = shown.filter((cell) => cell.goalMet).length
  const months = slots
    .filter((slot) => slot.row === 2 && (slot.column === 2 || Number(slot.day.slice(8)) <= 7))
    .map((slot) => ({ column: slot.column, label: MONTHS[Number(slot.day.slice(5, 7)) - 1]! }))
  return (
    <div ref={box} className="w-full">
    <div
      role="img"
      className="recall-heat"
      style={{ '--recall-weeks': weeks } as CSSProperties}
      aria-label={`Reviews in the last ${weeks} weeks: ${countOf(total, 'review')}, goal met on ${countOf(met, 'day')}`}
    >
      {months.map((month) => (
        <span key={month.column} className="recall-heat-label" style={{ gridColumn: month.column, gridRow: 1 }}>
          {month.label}
        </span>
      ))}
      {[0, 2, 4].map((row) => (
        <span key={row} className="recall-heat-label" style={{ gridColumn: 1, gridRow: row + 2 }}>
          {weekdayName(row)}
        </span>
      ))}
      {slots.map(({ day, column, row, cell }) => (
        <span
          key={day}
          className="recall-heat-cell"
          data-level={cell?.level ?? 0}
          data-goal={cell?.goalMet ?? false}
          data-today={day === today}
          data-empty={cell === undefined}
          title={cell ? `${formatDay(day)}: ${countOf(cell.reviews, 'review')}` : undefined}
          style={{ gridColumn: column, gridRow: row }}
        />
      ))}
    </div>
    </div>
  )
}
