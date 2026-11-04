import { defineCollection } from '@localixai/mini-app-sdk/backend'
import { APPLICATIONS, applicationInputSchema, applicationSchema, dayOf } from '../shared/model'

/**
 * The applications collection. Each points at a company by `companyId` (an id survives a rename;
 * a name does not). A new application starts its own history with the status it begins in, so the
 * timeline on the screen is never empty.
 */
export const applicationsSpec = defineCollection({
  name: APPLICATIONS,
  item: applicationSchema,
  input: applicationInputSchema,
  create: (input, { id, now }) => {
    const status = input.status ?? 'wishlist'
    return {
      id,
      companyId: input.companyId,
      role: input.role,
      status,
      salary: input.salary ?? null,
      // Created as "applied" without a day: it was sent today.
      appliedOn: input.appliedOn ?? (status === 'applied' ? dayOf(now) : null),
      note: input.note ?? '',
      history: input.history ?? [{ status, at: now.toISOString() }],
      createdAt: now.toISOString(),
    }
  },
  scope: 'app',
  limit: 20_000,
  search: (application) => [application.role, application.note].filter(Boolean).join(' — '),
})
