import {
  openJsonStore,
  type Collection,
  type MiniAppContext,
} from '@localixai/mini-app-sdk/backend'
import { z } from 'zod'
import type { Activity, ActivityInput, Currency, Deal, DealInput, Stage } from '../shared/model'
import type { activitiesSpec, dealsSpec } from './collections'

type Deals = Collection<Deal, (typeof dealsSpec)['input']['shape']>
type Activities = Collection<Activity, (typeof activitiesSpec)['input']['shape']>

const DAY = 86_400_000
const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

interface Seed {
  title: string
  company: string
  owner: string
  amount: number
  currency: Currency
  stage: Stage
  /** Days from today the deal closes (or closed); `'eom'` is the last day of this month. */
  close: number | 'eom'
  /** Days ago the deal was created. */
  age: number
  note?: string
  /** Activities, as days ago, kind and note. */
  log: [number, ActivityInput['kind'], string][]
}

const DEMO: Seed[] = [
  {
    title: 'Fleet tracking rollout',
    company: 'Brightwave Logistics',
    owner: 'Maya Chen',
    amount: 84000,
    currency: 'USD',
    stage: 'proposal',
    close: 'eom',
    age: 52,
    note: 'Wants a pilot on 40 trucks before signing.',
    log: [
      [2, 'meeting', 'Walked through the pilot plan with their ops lead.'],
      [9, 'email', 'Sent the revised proposal with phased pricing.'],
      [30, 'call', 'Discovery call: dispatch software is the pain point.'],
    ],
  },
  {
    title: 'Cold-chain monitoring',
    company: 'Cedar & Pine Foods',
    owner: 'Daniel Okoye',
    amount: 41500,
    currency: 'EUR',
    stage: 'qualified',
    close: 24,
    age: 21,
    log: [
      [4, 'call', 'Confirmed budget owner and timeline.'],
      [15, 'email', 'Shared two reference customers.'],
    ],
  },
  {
    title: 'Clinic scheduling suite',
    company: 'Halcyon Health',
    owner: 'Sofia Rossi',
    amount: 127000,
    currency: 'USD',
    stage: 'proposal',
    close: 18,
    age: 64,
    note: 'Legal review is the open item.',
    log: [
      [1, 'note', 'Legal asked for a data-residency clause.'],
      [6, 'meeting', 'Security review with their CISO.'],
      [20, 'email', 'Sent the security questionnaire.'],
    ],
  },
  {
    title: 'Treasury reporting',
    company: 'Ironbridge Capital',
    owner: 'Liam Becker',
    amount: 96000,
    currency: 'GBP',
    stage: 'lead',
    close: 60,
    age: 6,
    log: [[3, 'email', 'Intro thread with their head of finance.']],
  },
  {
    title: 'Editing suite licences',
    company: 'Lumen Studios',
    owner: 'Maya Chen',
    amount: 18400,
    currency: 'USD',
    stage: 'lead',
    close: 45,
    age: 9,
    log: [],
  },
  {
    title: 'Route optimisation',
    company: 'Meridian Freight',
    owner: 'Daniel Okoye',
    amount: 58000,
    currency: 'EUR',
    stage: 'qualified',
    close: 'eom',
    age: 33,
    log: [
      [5, 'meeting', 'Demo for three planners; asked about API access.'],
      [18, 'call', 'Qualified: 120 vehicles across two depots.'],
    ],
  },
  {
    title: 'Grid analytics pilot',
    company: 'Nordlys Energy',
    owner: 'Sofia Rossi',
    amount: 210000,
    currency: 'EUR',
    stage: 'proposal',
    close: 35,
    age: 71,
    note: 'Board approves the budget next month.',
    log: [
      [7, 'email', 'Sent the pilot scope and success criteria.'],
      [26, 'meeting', 'Workshop with their engineering team.'],
    ],
  },
  {
    title: 'Patient reminders',
    company: 'Orbit Dental Group',
    owner: 'Liam Becker',
    amount: 23500,
    currency: 'GBP',
    stage: 'lead',
    close: 38,
    age: 4,
    log: [[1, 'call', 'Short intro call; sending a one-pager.']],
  },
  {
    title: 'District roll-call app',
    company: 'Pinecrest Schools',
    owner: 'Maya Chen',
    amount: 36000,
    currency: 'USD',
    stage: 'qualified',
    close: 29,
    age: 27,
    log: [[8, 'note', 'Procurement needs three quotes.']],
  },
  {
    title: 'Platform renewal',
    company: 'Quartz Analytics',
    owner: 'Daniel Okoye',
    amount: 72000,
    currency: 'USD',
    stage: 'won',
    close: -12,
    age: 80,
    log: [
      [12, 'call', 'Signed. Kick-off scheduled for next week.'],
      [25, 'email', 'Final contract sent.'],
    ],
  },
  {
    title: 'Store kiosks',
    company: 'Redwood Outfitters',
    owner: 'Sofia Rossi',
    amount: 54000,
    currency: 'GBP',
    stage: 'won',
    close: -45,
    age: 110,
    log: [[45, 'meeting', 'Closing call with the retail director.']],
  },
  {
    title: 'Booking engine',
    company: 'Solstice Hotels',
    owner: 'Liam Becker',
    amount: 138000,
    currency: 'EUR',
    stage: 'won',
    close: -80,
    age: 140,
    log: [[80, 'email', 'Order form returned, countersigned.']],
  },
  {
    title: 'Harbour sensors',
    company: 'Tidewater Marine',
    owner: 'Maya Chen',
    amount: 31000,
    currency: 'USD',
    stage: 'won',
    close: -105,
    age: 150,
    log: [],
  },
  {
    title: 'Warehouse robotics',
    company: 'Vantage Robotics',
    owner: 'Daniel Okoye',
    amount: 89000,
    currency: 'USD',
    stage: 'lost',
    close: -20,
    age: 95,
    note: 'Went with an in-house build.',
    log: [[20, 'call', 'They chose to build in-house; keep in touch for Q3.']],
  },
]

/**
 * The first start fills the app with a realistic demo set, once. The claim goes through the same
 * serialized store the collections use, so two `register(ctx)` calls at once cannot both seed, and
 * deleting every deal later does not bring the demo back.
 */
export async function seedOnFirstStart(
  ctx: MiniAppContext,
  deals: Deals,
  activities: Activities,
  now = new Date(),
): Promise<boolean> {
  const marker = openJsonStore({
    dir: ctx.dataDir,
    file: 'seed.json',
    schema: z.object({ seeded: z.boolean() }),
    initial: { seeded: false },
  })
  let claimed = false
  await marker.update((state) => {
    claimed = !state.seeded
    return { seeded: true }
  })
  if (!claimed) return false
  if ((await deals.list()).length > 0) return false

  const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  for (const seed of DEMO) {
    const deal = await deals.add({
      title: seed.title,
      company: seed.company,
      owner: seed.owner,
      amount: seed.amount,
      currency: seed.currency,
      stage: seed.stage,
      closeDate: isoDay(seed.close === 'eom' ? eom : new Date(now.getTime() + seed.close * DAY)),
      ...(seed.note ? { note: seed.note } : {}),
      createdAt: new Date(now.getTime() - seed.age * DAY).toISOString(),
    } satisfies DealInput)
    for (const [ago, kind, note] of seed.log) {
      await activities.add({
        dealId: deal.id,
        kind,
        note,
        at: new Date(now.getTime() - ago * DAY - 3_600_000).toISOString(),
      })
    }
  }
  return true
}
