import { z } from 'zod'

/**
 * THE MODEL — a small sales pipeline that every pattern in the gallery shares. It is the contract
 * between the backend, the screen and the tests: the collections store what these schemas allow,
 * every pattern reads the same shapes, and the dashboard numbers come from `summarize` below.
 *
 * When you copy a pattern, copy the shape of this file too: input schema (what a person sends),
 * stored schema (input plus what the server fills in), and pure rules that need no storage, no
 * network and no React.
 */

/** The mini app's name: its routes are `/rpc/<APP>/…`. */
export const APP = 'ui-patterns'
export const DEALS = 'deals'
export const ACTIVITIES = 'activities'

export const STAGES = ['lead', 'qualified', 'proposal', 'won', 'lost'] as const
export type Stage = (typeof STAGES)[number]
/** The stages a deal is still being worked in. */
export const OPEN_STAGES: readonly Stage[] = ['lead', 'qualified', 'proposal']

export const CURRENCIES = ['USD', 'EUR', 'GBP'] as const
export type Currency = (typeof CURRENCIES)[number]

export const ACTIVITY_KINDS = ['call', 'email', 'meeting', 'note'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

/** The demo sales team: what the owner filter and the owner field offer. */
export const OWNERS = ['Maya Chen', 'Daniel Okoye', 'Sofia Rossi', 'Liam Becker'] as const

/**
 * Illustrative rates to USD, so the dashboard can add deals in different currencies. A real app
 * would read them from a setting or a rates provider; the point here is that a sum across
 * currencies is never a plain sum.
 */
export const USD_PER_UNIT: Record<Currency, number> = { USD: 1, EUR: 1.08, GBP: 1.27 }
export const toUsd = (amount: number, currency: Currency): number => amount * USD_PER_UNIT[currency]

/**
 * What a person or the agent sends to create or change a deal.
 *
 * No field here has `.default()`: a partial update (`update(id, { stage })`) would apply it again
 * on the Localix release this targets and reset the field. Defaults are filled in the collection's
 * `create` path instead (see `backend/collections.ts`).
 */
export const dealInputSchema = z.object({
  title: z.string().trim().min(1, 'Name the deal.').max(120, 'Keep the name under 120 characters.'),
  company: z.string().trim().min(1, 'Add the company.').max(80),
  owner: z.string().trim().min(1, 'Pick an owner.').max(60),
  amount: z
    .number({ error: 'Enter an amount.' })
    .positive('Enter an amount above 0.')
    .max(1_000_000_000, 'That amount is too large.'),
  /** Filled with `USD` when omitted on create. */
  currency: z.enum(CURRENCIES).optional(),
  /** Filled with `lead` when omitted on create. */
  stage: z.enum(STAGES).optional(),
  /** `YYYY-MM-DD`: when it is expected to close, or when it did. `null` clears it on a change. */
  closeDate: z.iso.date('Use a valid date.').nullish(),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional(),
  /** Only for importing history; now when omitted. */
  createdAt: z.iso.datetime({ offset: true }).optional(),
})

/** One stored deal: the input with the fields the server always fills. */
export const dealSchema = dealInputSchema.extend({
  id: z.string(),
  currency: z.enum(CURRENCIES),
  stage: z.enum(STAGES),
  createdAt: z.string(),
})
export type Deal = z.infer<typeof dealSchema>
export type DealInput = z.input<typeof dealInputSchema>

export const activityInputSchema = z.object({
  dealId: z.string().min(1),
  kind: z.enum(ACTIVITY_KINDS),
  note: z.string().trim().min(1, 'Write what happened.').max(500),
  /** When it happened; now when omitted. */
  at: z.iso.datetime({ offset: true }).optional(),
})
export const activitySchema = activityInputSchema.extend({ id: z.string(), at: z.string() })
export type Activity = z.infer<typeof activitySchema>
export type ActivityInput = z.input<typeof activityInputSchema>

/** Targets the dashboard measures against. Illustrative; a real app would keep them in settings. */
export const TARGETS = { wonQuarterUsd: 350_000, openPipelineUsd: 600_000, winRate: 0.4 } as const

/** Every number the dashboard shows, as the `/summary` route answers it. */
export const summarySchema = z.object({
  pipelineValue: z.number(),
  openCount: z.number(),
  wonCount: z.number(),
  lostCount: z.number(),
  winRate: z.number().nullable(),
  averageDeal: z.number(),
  closingThisMonth: z.object({ count: z.number(), value: z.number() }),
  byStage: z.array(z.object({ stage: z.enum(STAGES), count: z.number(), value: z.number() })),
  wonByMonth: z.array(z.object({ month: z.string(), value: z.number(), count: z.number() })),
  wonThisQuarter: z.number(),
})
export type Summary = z.infer<typeof summarySchema>
export type StageTotal = Summary['byStage'][number]

const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

/** The months from `count - 1` months ago up to `now`'s month, as `YYYY-MM`. */
export function lastMonths(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    monthKey(new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1)),
  )
}

/** Every dashboard number, computed in one place so the screen and any tool agree. */
export function summarize(deals: readonly Deal[], now: Date): Summary {
  const byStage = STAGES.map((stage): StageTotal => {
    const inStage = deals.filter((deal) => deal.stage === stage)
    return {
      stage,
      count: inStage.length,
      value: inStage.reduce((sum, deal) => sum + toUsd(deal.amount, deal.currency), 0),
    }
  })
  const stage = (name: Stage) => byStage.find((total) => total.stage === name)!
  const open = byStage.filter((total) => OPEN_STAGES.includes(total.stage))
  const decided = stage('won').count + stage('lost').count
  const thisMonth = monthKey(now)
  const closing = deals.filter(
    (deal) =>
      OPEN_STAGES.includes(deal.stage) && deal.closeDate && deal.closeDate.startsWith(thisMonth),
  )
  const wonIn = (months: readonly string[]) =>
    deals.filter(
      (deal) =>
        deal.stage === 'won' && deal.closeDate && months.includes(deal.closeDate.slice(0, 7)),
    )
  const valueOf = (list: readonly Deal[]) =>
    list.reduce((sum, deal) => sum + toUsd(deal.amount, deal.currency), 0)
  const quarterStart = Math.floor(now.getMonth() / 3) * 3
  const quarter = [0, 1, 2].map((i) => monthKey(new Date(now.getFullYear(), quarterStart + i, 1)))
  const total = deals.reduce((sum, deal) => sum + toUsd(deal.amount, deal.currency), 0)
  return {
    pipelineValue: open.reduce((sum, row) => sum + row.value, 0),
    openCount: open.reduce((sum, row) => sum + row.count, 0),
    wonCount: stage('won').count,
    lostCount: stage('lost').count,
    winRate: decided === 0 ? null : stage('won').count / decided,
    averageDeal: deals.length === 0 ? 0 : total / deals.length,
    closingThisMonth: {
      count: closing.length,
      value: closing.reduce((sum, deal) => sum + toUsd(deal.amount, deal.currency), 0),
    },
    byStage,
    wonByMonth: lastMonths(now, 6).map((month) => {
      const won = wonIn([month])
      return { month, value: valueOf(won), count: won.length }
    }),
    wonThisQuarter: valueOf(wonIn(quarter)),
  }
}
