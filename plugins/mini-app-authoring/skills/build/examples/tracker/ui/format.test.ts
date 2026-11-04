import { describe, expect, test } from 'bun:test'
import {
  EM_DASH,
  formatCompactMoney,
  formatDate,
  formatMoney,
  formatRelative,
  formatShortDate,
  orDash,
  plural,
} from './format'

// A fixed "now" so no test depends on the clock: Tuesday, 3 Nov 2026, 15:00 local time.
const NOW = new Date(2026, 10, 3, 15, 0, 0).getTime()

describe('formatting', () => {
  test('money is whole dollars with separators, and a missing amount is a dash', () => {
    expect(formatMoney(90000)).toBe('$90,000')
    expect(formatCompactMoney(1_250_000)).toBe('$1.3M')
    expect(formatMoney(null)).toBe(EM_DASH)
    expect(formatCompactMoney(undefined)).toBe(EM_DASH)
  })

  test('a day never slips with the time zone, and a bad value is a dash', () => {
    expect(formatDate('2026-11-03')).toBe('Nov 3, 2026')
    expect(formatShortDate('2026-01-01')).toBe('Jan 1')
    for (const bad of [null, undefined, '', 'not a date']) expect(formatDate(bad)).toBe(EM_DASH)
  })

  test('the past reads as "ago", then as a date once it is a week old', () => {
    expect(formatRelative(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('5m ago')
    expect(formatRelative(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe('2d ago')
    expect(formatRelative(new Date(NOW - 30 * 86_400_000).toISOString(), NOW)).toBe('Oct 4')
    expect(formatRelative(null, NOW)).toBe(EM_DASH)
  })

  test('plurals follow the language, and an empty string is a dash', () => {
    expect(plural(1, 'application', 'applications')).toBe('application')
    expect(plural(0, 'application', 'applications')).toBe('applications')
    expect(orDash('')).toBe(EM_DASH)
    expect(orDash('Remote')).toBe('Remote')
  })
})
