import type { Activity, Deal } from '../../shared/model'

/** Deterministic deals and activities for the pattern tests: dates are relative to today. */
export const DAY = 86_400_000
export const isoDay = (offsetDays: number, from = Date.now()): string => {
  const date = new Date(from + offsetDays * DAY)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function deal(over: Partial<Deal> & Pick<Deal, 'id'>): Deal {
  return {
    title: `Deal ${over.id}`,
    company: 'Acme Test',
    owner: 'Maya Chen',
    amount: 10000,
    currency: 'USD',
    stage: 'lead',
    createdAt: new Date(Date.now() - 20 * DAY).toISOString(),
    ...over,
  }
}

/** Six deals over four stages, in three currencies. */
export function fixtureDeals(): Deal[] {
  return [
    deal({
      id: 'd1',
      title: 'Fleet tracking',
      company: 'Brightwave',
      amount: 84000,
      stage: 'proposal',
      closeDate: isoDay(5),
    }),
    deal({
      id: 'd2',
      title: 'Cold-chain monitoring',
      company: 'Cedar & Pine',
      owner: 'Daniel Okoye',
      amount: 41500,
      currency: 'EUR',
      stage: 'qualified',
      closeDate: isoDay(24),
    }),
    deal({
      id: 'd3',
      title: 'Clinic scheduling',
      company: 'Halcyon Health',
      owner: 'Sofia Rossi',
      amount: 127000,
      stage: 'proposal',
      closeDate: isoDay(18),
      note: 'Legal review is open.',
    }),
    deal({
      id: 'd4',
      title: 'Treasury reporting',
      company: 'Ironbridge',
      owner: 'Liam Becker',
      amount: 96000,
      currency: 'GBP',
      stage: 'lead',
    }),
    deal({
      id: 'd5',
      title: 'Platform renewal',
      company: 'Quartz',
      owner: 'Daniel Okoye',
      amount: 72000,
      stage: 'won',
      closeDate: isoDay(-12),
    }),
    deal({
      id: 'd6',
      title: 'Warehouse robotics',
      company: 'Vantage',
      amount: 89000,
      stage: 'lost',
      closeDate: isoDay(-20),
    }),
  ]
}

export function fixtureActivities(): Activity[] {
  const at = (days: number) => new Date(Date.now() - days * DAY).toISOString()
  return [
    { id: 'a1', dealId: 'd1', kind: 'meeting', note: 'Walked through the pilot plan.', at: at(2) },
    { id: 'a2', dealId: 'd1', kind: 'email', note: 'Sent the revised proposal.', at: at(9) },
    {
      id: 'a3',
      dealId: 'd3',
      kind: 'call',
      note: 'Legal asked for a residency clause.',
      at: at(1),
    },
  ]
}
