import { describe, expect, test } from 'bun:test'
import { applicationInputSchema, patchFor, sortApplications, type Application } from './model'
import { describeForAgent, staleApplications } from './report'

const application = (over: Partial<Application> & Pick<Application, 'id'>): Application => ({
  companyId: 'c1',
  role: `Role ${over.id}`,
  status: 'wishlist',
  salary: null,
  appliedOn: null,
  note: '',
  history: [{ status: 'wishlist', at: '2026-10-01T09:00:00.000Z' }],
  createdAt: '2026-10-01T09:00:00.000Z',
  ...over,
})
const NOW = new Date(2026, 10, 3, 15, 0, 0)

describe('the model', () => {
  test('live applications come first, furthest along first, then the ones that are over', () => {
    const rows = [
      application({ id: 'rejected', status: 'rejected' }),
      application({ id: 'wish', status: 'wishlist' }),
      application({ id: 'interview', status: 'interview' }),
      application({ id: 'applied-new', status: 'applied', createdAt: '2026-10-05T09:00:00.000Z' }),
      application({ id: 'applied-old', status: 'applied' }),
    ]
    expect(sortApplications(rows).map((each) => each.id)).toEqual([
      'interview',
      'applied-new',
      'applied-old',
      'wish',
      'rejected',
    ])
  })

  test('a move to a new status adds a timeline entry; the same status adds nothing', () => {
    const current = application({ id: 'a' })
    const moved = patchFor(current, { status: 'interview' }, NOW)
    expect(moved.history).toEqual([
      ...current.history,
      { status: 'interview', at: NOW.toISOString() },
    ])
    expect(patchFor(current, { status: 'wishlist', note: 'x' }, NOW)).toEqual({
      status: 'wishlist',
      note: 'x',
    })
    expect(patchFor(current, { note: 'x' }, NOW)).toEqual({ note: 'x' })
  })

  test('moving to applied fills the day it was sent, unless the person gave one', () => {
    const current = application({ id: 'a' })
    expect(patchFor(current, { status: 'applied' }, NOW).appliedOn).toBe('2026-11-03')
    expect(patchFor(current, { status: 'applied', appliedOn: '2026-10-30' }, NOW).appliedOn).toBe(
      '2026-10-30',
    )
    expect(patchFor(current, { status: 'applied', appliedOn: null }, NOW).appliedOn).toBeNull()
  })

  test('the input schema says what is wrong in a sentence, and keeps no defaults', () => {
    const bad = applicationInputSchema.safeParse({ companyId: '', role: ' ', salary: -5 })
    expect(bad.success ? [] : bad.error.issues.map((issue) => issue.message)).toEqual([
      'Pick a company.',
      'Name the role.',
      'Enter an amount above 0.',
    ])
    // A partial change must stay partial: nothing is filled in behind its back.
    expect(applicationInputSchema.partial().parse({ note: 'x' })).toEqual({ note: 'x' })
  })

  test('applications waiting more than 14 days for an answer are named', () => {
    const rows = [
      application({
        id: 'old',
        status: 'applied',
        history: [{ status: 'applied', at: '2026-10-10T09:00:00.000Z' }],
      }),
      application({
        id: 'fresh',
        status: 'applied',
        history: [{ status: 'applied', at: '2026-10-30T09:00:00.000Z' }],
      }),
      application({
        id: 'wish',
        history: [{ status: 'wishlist', at: '2026-09-01T09:00:00.000Z' }],
      }),
    ]
    expect(staleApplications(rows, NOW).map((each) => each.id)).toEqual(['old'])
    expect(describeForAgent([], [], NOW)).toBe('Nothing is tracked yet.')
  })
})
