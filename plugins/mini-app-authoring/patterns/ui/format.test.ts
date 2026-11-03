import { describe, expect, test } from 'bun:test'
import {
  EM_DASH,
  countOf,
  formatCloseDay,
  formatCompact,
  formatCompactMoney,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMonth,
  formatPercent,
  formatRelative,
  formatShortDate,
  orDash,
  parseDay,
  plural,
} from './format'

// A fixed "now" so no test depends on the clock: Tuesday, 3 Nov 2026, 15:00 local time.
const NOW = new Date(2026, 10, 3, 15, 0, 0).getTime()

describe('numbers', () => {
  test('money is formatted in its own currency, whole units', () => {
    expect(formatMoney(84000, 'USD')).toBe('$84,000')
    expect(formatMoney(41500, 'EUR')).toBe('€41,500')
    expect(formatMoney(96000, 'GBP')).toBe('£96,000')
  })

  test('compact forms keep a column total short', () => {
    expect(formatCompact(1234)).toBe('1.2K')
    expect(formatCompact(2_500_000)).toBe('2.5M')
    expect(formatCompactMoney(84000, 'USD')).toBe('$84K')
    expect(formatCompactMoney(1_250_000, 'EUR')).toBe('€1.3M')
  })

  test('a percent rounds to a whole number, and a missing one is a dash', () => {
    expect(formatPercent(0.4)).toBe('40%')
    expect(formatPercent(0.6667)).toBe('67%')
    expect(formatPercent(null)).toBe(EM_DASH)
    expect(formatPercent(Number.NaN)).toBe(EM_DASH)
  })

  test('a missing value is an em dash', () => {
    expect(orDash('')).toBe(EM_DASH)
    expect(orDash(undefined)).toBe(EM_DASH)
    expect(orDash('Maya')).toBe('Maya')
  })
})

describe('dates', () => {
  test('a plain day keeps its own date in every time zone', () => {
    expect(parseDay('2026-11-03').getDate()).toBe(3)
    expect(formatDate('2026-11-03')).toBe('Nov 3, 2026')
    expect(formatShortDate('2026-11-03')).toBe('Nov 3')
    expect(formatMonth('2026-11')).toBe('Nov 2026')
  })

  test('an invalid or missing date is a dash, never "Invalid Date"', () => {
    expect(formatDate(null)).toBe(EM_DASH)
    expect(formatDate('not a date')).toBe(EM_DASH)
    expect(formatDateTime(undefined)).toBe(EM_DASH)
    expect(formatRelative('nope', NOW)).toBe(EM_DASH)
  })

  test('the full moment carries a time', () => {
    // The separator between date and time differs between ICU versions ("," or " at ").
    expect(formatDateTime(new Date(2026, 10, 3, 14, 30).toISOString())).toMatch(
      /^Nov 3, 2026.*2:30\sPM$/,
    )
  })

  test('relative time reads the past through the SDK and adds the future', () => {
    expect(formatRelative(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('5m ago')
    expect(formatRelative(new Date(NOW - 3 * 86_400_000).toISOString(), NOW)).toBe('3d ago')
    expect(formatRelative(new Date(NOW - 30 * 1000).toISOString(), NOW)).toBe('now')
    expect(formatRelative(new Date(NOW - 20 * 86_400_000).toISOString(), NOW)).toBe('Oct 14')
    expect(formatRelative(new Date(NOW + 3 * 86_400_000).toISOString(), NOW)).toBe('in 3d')
    expect(formatRelative(new Date(NOW + 30 * 86_400_000).toISOString(), NOW)).toBe('in 4w')
  })

  test('a close date is compared by calendar day', () => {
    expect(formatCloseDay('2026-11-03', NOW)).toBe('today')
    expect(formatCloseDay('2026-11-04', NOW)).toBe('tomorrow')
    expect(formatCloseDay('2026-11-08', NOW)).toBe('in 5d')
    expect(formatCloseDay('2026-11-02', NOW)).toBe('yesterday')
    expect(formatCloseDay('2026-10-30', NOW)).toBe('4d ago')
    expect(formatCloseDay('2026-09-01', NOW)).toBe('Sep 1')
    expect(formatCloseDay(undefined, NOW)).toBe(EM_DASH)
  })
})

describe('plurals', () => {
  test('one is singular, everything else is plural', () => {
    expect(plural(1, 'deal', 'deals')).toBe('deal')
    expect(plural(0, 'deal', 'deals')).toBe('deals')
    expect(countOf(1, 'deal')).toBe('1 deal')
    expect(countOf(14, 'deal')).toBe('14 deals')
    expect(countOf(2, 'company', 'companies')).toBe('2 companies')
    expect(countOf(1200, 'deal')).toBe('1,200 deals')
  })
})
