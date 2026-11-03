import { describe, expect, test } from 'bun:test'
import { dealInputSchema, lastMonths, summarize, toUsd, type Deal } from './model'

const deal = (over: Partial<Deal>): Deal => ({
  id: 'd',
  title: 'Deal',
  company: 'Acme',
  owner: 'Maya Chen',
  amount: 1000,
  currency: 'USD',
  stage: 'lead',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})
const NOW = new Date(2026, 10, 15)

describe('summarize', () => {
  test('values every currency in USD and counts only open deals in the pipeline', () => {
    const summary = summarize(
      [
        deal({ id: 'a', amount: 1000, currency: 'EUR', stage: 'lead' }),
        deal({ id: 'b', amount: 2000, stage: 'proposal', closeDate: '2026-11-28' }),
        deal({ id: 'c', amount: 5000, stage: 'won', closeDate: '2026-10-02' }),
        deal({ id: 'd', amount: 1000, stage: 'lost', closeDate: '2026-09-02' }),
      ],
      NOW,
    )
    expect(summary.pipelineValue).toBeCloseTo(toUsd(1000, 'EUR') + 2000)
    expect(summary.openCount).toBe(2)
    expect(summary.winRate).toBe(0.5)
    expect(summary.closingThisMonth).toEqual({ count: 1, value: 2000 })
    expect(summary.wonByMonth.find((month) => month.month === '2026-10')?.value).toBe(5000)
    expect(summary.wonThisQuarter).toBe(5000)
  })

  test('has no win rate until something is decided, and no average without deals', () => {
    const summary = summarize([], NOW)
    expect(summary.winRate).toBeNull()
    expect(summary.averageDeal).toBe(0)
    expect(summary.byStage).toHaveLength(5)
  })

  test('lists the last six months across a year boundary', () => {
    expect(lastMonths(new Date(2026, 1, 10), 6)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })
})

describe('dealInputSchema', () => {
  test('carries no default, so a partial update cannot reset a field', () => {
    const parsed = dealInputSchema.partial().parse({ title: 'Renamed' })
    expect(parsed).toEqual({ title: 'Renamed' })
  })

  test('says what is wrong in a sentence per field', () => {
    const result = dealInputSchema.safeParse({
      title: ' ',
      company: '',
      owner: '',
      amount: Number.NaN,
    })
    const messages = result.error?.issues.map((issue) => issue.message)
    expect(messages).toContain('Name the deal.')
    expect(messages).toContain('Enter an amount.')
  })
})
