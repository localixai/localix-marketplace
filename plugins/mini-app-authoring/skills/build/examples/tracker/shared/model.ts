import { z } from 'zod'

/**
 * THE MODEL: what the tracker keeps, shared by the backend, the agent's tools and the screen. Two
 * collections that point at each other: a company, and the applications made to it. The backend
 * stores what these schemas allow, the screen reads the same shapes, and the pure rules at the end
 * of the file (`patchFor`, `sortApplications`) are the ones both sides call, so a change made from
 * the chat and a change made on the screen can never disagree.
 *
 * No storage, network or React in this file: it is tested in milliseconds (model.test.ts).
 */

/** The mini app's name: its routes are `/rpc/<APP>/…`. */
export const APP = 'example-tracker'
export const COMPANIES = 'companies'
export const APPLICATIONS = 'applications'

export const STATUSES = [
  'wishlist',
  'applied',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const
export type Status = (typeof STATUSES)[number]
/** The statuses an application is still alive in; the rest are over. */
export const LIVE_STATUSES: readonly Status[] = ['wishlist', 'applied', 'interview', 'offer']

/**
 * What a person or the agent sends to add or change a company.
 *
 * No `.default()` anywhere in an input schema: a partial update (`update(id, { note })`) re-applies
 * the default on the current release and resets the field. Defaults are filled where a record is
 * made, in the collection's `create` (backend/companies.ts).
 */
export const companyInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the company.').max(80, 'Keep the name under 80 characters.'),
  website: z.string().trim().max(200, 'Keep the address under 200 characters.').optional(),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional(),
})
export const companySchema = companyInputSchema.extend({
  id: z.string(),
  website: z.string(),
  note: z.string(),
  createdAt: z.string(),
})
export type Company = z.infer<typeof companySchema>
export type CompanyInput = z.input<typeof companyInputSchema>

/** One step in an application's life: the status it moved to, and when. */
export const historyEntrySchema = z.object({ status: z.enum(STATUSES), at: z.string() })
export type HistoryEntry = z.infer<typeof historyEntrySchema>

export const applicationInputSchema = z.object({
  companyId: z.string().min(1, 'Pick a company.'),
  role: z.string().trim().min(1, 'Name the role.').max(120, 'Keep the role under 120 characters.'),
  /** Filled with `wishlist` when omitted on create. */
  status: z.enum(STATUSES).optional(),
  /** Yearly pay in US dollars. `null` clears it on a change. */
  salary: z
    .number({ error: 'Enter a number.' })
    .positive('Enter an amount above 0.')
    .max(10_000_000, 'That amount is too large.')
    .nullish(),
  /** `YYYY-MM-DD`: the day it was sent. `null` clears it on a change. */
  appliedOn: z.iso.date('Use a valid date.').nullish(),
  note: z.string().trim().max(1000, 'Keep the note under 1000 characters.').optional(),
  /** Kept by `patchFor`, never typed by a person: the agent's tools do not offer it. */
  history: z.array(historyEntrySchema).optional(),
})
export const applicationSchema = applicationInputSchema.extend({
  id: z.string(),
  status: z.enum(STATUSES),
  note: z.string(),
  history: z.array(historyEntrySchema),
  createdAt: z.string(),
})
export type Application = z.infer<typeof applicationSchema>
export type ApplicationInput = z.input<typeof applicationInputSchema>

/** `YYYY-MM-DD` of a moment, in the local time zone: the day a person would call it. */
export function dayOf(moment: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`
}

/**
 * The change to store for `input` on `current`: the same fields, plus the history entry a move to a
 * new status adds. The screen and the tools both call this, so the timeline is the same whoever made
 * the change. Sending the status it already has adds nothing; moving to `applied` without a day
 * fills the day it was sent.
 */
export function patchFor(
  current: Application,
  input: Partial<ApplicationInput>,
  now: Date,
): Partial<ApplicationInput> {
  if (!input.status || input.status === current.status) return input
  return {
    ...input,
    history: [...current.history, { status: input.status, at: now.toISOString() }],
    appliedOn:
      input.appliedOn === undefined && input.status === 'applied' && !current.appliedOn
        ? dayOf(now)
        : input.appliedOn,
  }
}

/** Live applications first (furthest along first), then the rest; newest first within each. */
export function sortApplications(applications: readonly Application[]): Application[] {
  const rank = (application: Application) => STATUSES.indexOf(application.status)
  const live = (application: Application) => LIVE_STATUSES.includes(application.status)
  return [...applications].sort(
    (a, b) =>
      Number(live(b)) - Number(live(a)) ||
      (live(a) ? rank(b) - rank(a) : 0) ||
      b.createdAt.localeCompare(a.createdAt),
  )
}

/** The company's name for an application, or `null` when it was removed by some other route. */
export function companyName(
  companies: readonly Company[],
  application: Application,
): string | null {
  return companies.find((company) => company.id === application.companyId)?.name ?? null
}
