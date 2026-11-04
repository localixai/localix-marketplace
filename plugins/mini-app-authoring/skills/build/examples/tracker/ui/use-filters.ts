import { useMemo, useState } from 'react'
import { sortApplications, type Application, type Company } from '../shared/model'

export interface Filters {
  query: string
  status: string
  companyId: string
}
const NONE: Filters = { query: '', status: 'all', companyId: 'all' }

/**
 * The search box and the two filters, and the applications they leave: sorted, and matched on the
 * role, the note and the company's name. `filtering` tells an empty search result ("nothing matches
 * these filters", with a way out) from an empty tracker ("add your first one").
 */
export function useFilters(applications: readonly Application[], companies: readonly Company[]) {
  const [filters, setFilters] = useState<Filters>(NONE)
  const matching = useMemo(() => {
    const needle = filters.query.trim().toLowerCase()
    const names = new Map(companies.map((company) => [company.id, company.name.toLowerCase()]))
    return sortApplications(applications).filter(
      (application) =>
        (filters.status === 'all' || application.status === filters.status) &&
        (filters.companyId === 'all' || application.companyId === filters.companyId) &&
        (!needle ||
          `${application.role} ${application.note} ${names.get(application.companyId) ?? ''}`
            .toLowerCase()
            .includes(needle)),
    )
  }, [applications, companies, filters])
  return {
    filters,
    matching,
    filtering:
      filters.query.trim() !== '' || filters.status !== 'all' || filters.companyId !== 'all',
    set: (change: Partial<Filters>) => setFilters((current) => ({ ...current, ...change })),
    clear: () => setFilters(NONE),
  }
}
