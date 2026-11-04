import { useMemo } from 'react'
import { Building2, Plus } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { SearchInput } from '@localixai/kit/search-input'
import { Select, type SelectOption } from '@localixai/kit/select'
import { WorkbenchToolbar, WorkbenchToolbarSection } from '@localixai/kit/workbench-toolbar'
import type { Company } from '../shared/model'
import type { Filters } from './use-filters'
import { STATUS_OPTIONS } from './status'

/**
 * The toolbar under the header: search and filters on the left, the two creating actions on the
 * right. It wraps instead of overflowing when the pane is narrow.
 */
export function Toolbar({
  filters,
  companies,
  onChange,
  onNewApplication,
  onNewCompany,
}: {
  filters: Filters
  companies: readonly Company[]
  onChange: (change: Partial<Filters>) => void
  onNewApplication: () => void
  onNewCompany: () => void
}) {
  const companyOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: 'All companies' },
      ...companies.map((company) => ({ value: company.id, label: company.name })),
    ],
    [companies],
  )
  return (
    <WorkbenchToolbar aria-label="Application filters" wrap>
      <WorkbenchToolbarSection className="min-w-0 flex-1" wrap>
        <SearchInput
          aria-label="Search applications"
          placeholder="Search roles or companies"
          value={filters.query}
          onValueChange={(query) => onChange({ query })}
          className="w-full min-w-40 max-w-64"
        />
        <Select
          aria-label="Filter by status"
          size="md"
          value={filters.status}
          options={[{ value: 'all', label: 'All statuses' }, ...STATUS_OPTIONS]}
          onValueChange={(status) => onChange({ status })}
        />
        <Select
          aria-label="Filter by company"
          size="md"
          value={filters.companyId}
          options={companyOptions}
          onValueChange={(companyId) => onChange({ companyId })}
        />
      </WorkbenchToolbarSection>
      <WorkbenchToolbarSection align="end">
        <Button size="sm" variant="field" onClick={onNewCompany}>
          <Building2 data-icon="inline-start" />
          New company
        </Button>
        <Button size="sm" recommended onClick={onNewApplication}>
          <Plus data-icon="inline-start" />
          New application
        </Button>
      </WorkbenchToolbarSection>
    </WorkbenchToolbar>
  )
}
