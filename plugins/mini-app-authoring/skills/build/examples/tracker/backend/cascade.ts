import type { Collection } from '@localixai/mini-app-sdk/backend'
import type { Application, Company } from '../shared/model'
import type { applicationsSpec } from './applications'
import type { companiesSpec } from './companies'

export type Companies = Collection<Company, (typeof companiesSpec)['input']['shape']>
export type Applications = Collection<Application, (typeof applicationsSpec)['input']['shape']>

/**
 * The cascade. A store has no foreign keys, so "removing a company removes its applications" is a
 * rule the app keeps itself, in ONE function that every door goes through: the route the screen
 * calls and the agent's tool. Applications go first: if the second step fails the company is still
 * there to retry, and no application is left pointing at a company that is gone.
 *
 * Returns the removed company and how many applications went with it, or `null` for an unknown id.
 */
export async function removeCompany(
  companies: Companies,
  applications: Applications,
  id: string,
): Promise<{ company: Company; removed: number } | null> {
  const company = await companies.get(id)
  if (!company) return null
  const owned = (await applications.list()).filter((application) => application.companyId === id)
  for (const application of owned) await applications.remove(application.id)
  await companies.remove(id)
  return { company, removed: owned.length }
}

/**
 * The company a name refers to, made when there is none. The agent speaks in names ("Acme"), the
 * collection in ids; matching ignores case and surrounding spaces so "acme " is not a second Acme.
 */
export async function companyByName(companies: Companies, name: string): Promise<Company> {
  const wanted = name.trim().toLowerCase()
  const found = (await companies.list()).find((company) => company.name.toLowerCase() === wanted)
  return found ?? companies.add({ name })
}
