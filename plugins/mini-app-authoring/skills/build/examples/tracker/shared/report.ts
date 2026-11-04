import {
  LIVE_STATUSES,
  STATUSES,
  sortApplications,
  type Application,
  type Company,
  type Status,
} from './model'

/**
 * What the agent is told, and what the report tool answers: plain sentences computed from the two
 * lists. Pure, so the screen's header and the tools could call the same functions.
 */

/** "1 application", "3 applications": a count read as words. */
export const countOf = (count: number, one: string, other = `${one}s`): string =>
  `${count} ${count === 1 ? one : other}`

export const STATUS_WORD: Record<Status, string> = {
  wishlist: 'on the wishlist',
  applied: 'applied',
  interview: 'in interview',
  offer: 'with an offer',
  rejected: 'rejected',
  withdrawn: 'withdrawn',
}

/** The count of applications per status, in life order, leaving out statuses with none. */
export function countByStatus(
  applications: readonly Application[],
): { status: Status; count: number }[] {
  return STATUSES.map((status) => ({
    status,
    count: applications.filter((application) => application.status === status).length,
  })).filter((row) => row.count > 0)
}

/**
 * Applications sent more than `days` ago that nothing has happened to since: the ones worth a
 * follow-up. Compares days, not moments, so "14 days" means the same at any hour.
 */
export function staleApplications(
  applications: readonly Application[],
  now: Date,
  days = 14,
): Application[] {
  const cutoff = now.getTime() - days * 86_400_000
  return applications.filter((application) => {
    if (application.status !== 'applied') return false
    const last = application.history.at(-1)?.at ?? application.createdAt
    return new Date(last).getTime() <= cutoff
  })
}

/** One application as a line the agent can act on: what, where, how far along, and its id. */
export function describeApplication(
  application: Application,
  companies: readonly Company[],
): string {
  const company =
    companies.find((each) => each.id === application.companyId)?.name ?? 'unknown company'
  const pay = application.salary ? `, $${application.salary.toLocaleString('en-US')}` : ''
  return `- ${application.role} at ${company} [${application.status}${pay}] (id ${application.id})`
}

/** The whole picture, for the screen's published context and the agent's tool answers. */
export function describeForAgent(
  companies: readonly Company[],
  applications: readonly Application[],
  now: Date,
): string {
  if (!applications.length) {
    return companies.length
      ? `${countOf(companies.length, 'company', 'companies')}, no applications yet.`
      : 'Nothing is tracked yet.'
  }
  const live = applications.filter((application) => LIVE_STATUSES.includes(application.status))
  const stale = staleApplications(applications, now)
  return [
    `${countOf(applications.length, 'application')} at ${countOf(companies.length, 'company', 'companies')}, ${live.length} still live.`,
    countByStatus(applications)
      .map((row) => `${row.count} ${STATUS_WORD[row.status]}`)
      .join(', ') + '.',
    stale.length
      ? `${countOf(stale.length, 'application')} waiting more than 14 days for an answer.`
      : '',
    ...sortApplications(applications).map((application) =>
      describeApplication(application, companies),
    ),
  ]
    .filter(Boolean)
    .join('\n')
}
