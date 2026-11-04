import { defineCollection } from '@localixai/mini-app-sdk/backend'
import { COMPANIES, companyInputSchema, companySchema } from '../shared/model'

/**
 * The companies collection. `createMiniApp` turns it into the store under the app's data folder,
 * the routes `/rpc/<app>/companies` (list, add, change, remove: each answering with the new list),
 * the feed that updates an open screen the moment the agent writes, and the index that finds a
 * company by meaning.
 */
export const companiesSpec = defineCollection({
  name: COMPANIES,
  item: companySchema,
  input: companyInputSchema,
  // Defaults live here, not in the input schema: a change keeps every field it does not send.
  create: (input, { id, now }) => ({
    id,
    name: input.name,
    website: input.website ?? '',
    note: input.note ?? '',
    createdAt: now.toISOString(),
  }),
  scope: 'app',
  limit: 2000,
  search: (company) => [company.name, company.note].filter(Boolean).join(' — '),
})
