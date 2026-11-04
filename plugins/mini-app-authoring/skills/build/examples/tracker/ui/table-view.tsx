import { useMemo, useState } from 'react'
import { Button } from '@localixai/kit/button'
import { WorkbenchToolbar } from '@localixai/kit/workbench-toolbar'
import { STATUSES, companyName, type Application, type Company } from '../shared/model'
import {
  ApplicationTableRow,
  BulkBar,
  SORT_LABEL,
  SelectAllHeader,
  SkeletonRows,
  SortHeader,
  type Sort,
  type SortKey,
} from './table-parts'

/**
 * DATA TABLE: a real `<table>` for many rows. Select rows (with an indeterminate select-all), sort
 * by any column, delete the selection, open a row to edit it, and page through the rest. Pay is
 * right-aligned in `tabular-nums` so digits line up; a column drops out as the pane narrows; the
 * header stays while the body scrolls.
 *
 * Two decisions worth copying: the list is capped (`PAGE_SIZE`, then "Show more"), because
 * rendering every row of a long table is the slowest thing a screen can do; and the selection is
 * ids, filtered each render to the ones that still exist, so a row deleted elsewhere cannot stay
 * "selected". Deleting asks the parent (`onDelete`), which owns the confirm dialog.
 *
 * For very large, read-mostly data (virtualised rows, column resizing) use `TableGrid` from
 * `@localixai/mini-app-sdk/ui/components` instead. This table is the choice when rows carry their
 * own controls (checkboxes, buttons).
 */

const PAGE_SIZE = 10
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** Rows with no value for a column always sort last, in either direction. */
function sortRows(
  rows: readonly Application[],
  companies: readonly Company[],
  { key, dir }: Sort,
): Application[] {
  const sign = dir === 'asc' ? 1 : -1
  const company = (a: Application) => companyName(companies, a) ?? ''
  const value = (a: Application): string | number | null =>
    ({
      role: a.role,
      company: company(a) || null,
      status: STATUSES.indexOf(a.status),
      appliedOn: a.appliedOn ?? null,
      salary: a.salary ?? null,
    })[key]
  return [...rows].sort((a, b) => {
    const [x, y] = [value(a), value(b)]
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
    return sign * (typeof x === 'number' ? x - (y as number) : collator.compare(x, y as string))
  })
}

export function TableView({
  applications,
  companies,
  loading,
  busy,
  onEdit,
  onDelete,
}: {
  applications: readonly Application[]
  companies: readonly Company[]
  loading: boolean
  /** A write is in flight: the bulk delete cannot be pressed twice. */
  busy: boolean
  onEdit: (application: Application) => void
  onDelete: (ids: string[]) => void
}) {
  const [sort, setSort] = useState<Sort>({ key: 'appliedOn', dir: 'desc' })
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())

  const sorted = useMemo(
    () => sortRows(applications, companies, sort),
    [applications, companies, sort],
  )
  const shown = sorted.slice(0, limit)
  const selectedIds = applications.filter((a) => picked.has(a.id)).map((a) => a.id)
  const shownSelected = shown.filter((a) => picked.has(a.id)).length

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const toggleAll = () =>
    setPicked((current) => {
      const next = new Set(current)
      const all = shown.every((a) => next.has(a.id))
      for (const a of shown) {
        if (all) next.delete(a.id)
        else next.add(a.id)
      }
      return next
    })
  const onSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'salary' || key === 'appliedOn' ? 'desc' : 'asc' },
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedIds.length > 0 && (
        <WorkbenchToolbar aria-label="Bulk actions">
          <BulkBar
            count={selectedIds.length}
            busy={busy}
            onClear={() => setPicked(new Set())}
            onDelete={() => onDelete(selectedIds)}
          />
        </WorkbenchToolbar>
      )}
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">
            Applications, sorted by {SORT_LABEL[sort.key]},{' '}
            {sort.dir === 'asc' ? 'ascending' : 'descending'}
          </caption>
          <thead className="sticky top-0 z-(--z-raised) bg-background">
            <tr className="border-b border-border">
              <SelectAllHeader
                all={shown.length > 0 && shownSelected === shown.length}
                some={shownSelected > 0}
                onToggle={toggleAll}
              />
              <SortHeader label="Role" sortKey="role" sort={sort} onSort={onSort} />
              <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
              <SortHeader
                label="Applied"
                sortKey="appliedOn"
                sort={sort}
                onSort={onSort}
                className="hidden @2xl:table-cell"
              />
              <SortHeader label="Pay" sortKey="salary" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : (
              shown.map((application) => (
                <ApplicationTableRow
                  key={application.id}
                  application={application}
                  company={companyName(companies, application)}
                  selected={picked.has(application.id)}
                  onToggle={() => toggle(application.id)}
                  onEdit={() => onEdit(application)}
                />
              ))
            )}
          </tbody>
        </table>
        {sorted.length > shown.length && (
          <div className="flex items-center justify-center gap-3 border-t border-border-soft px-3 py-2">
            <span className="text-2xs tabular-nums text-text-faint">
              Showing {shown.length} of {sorted.length}
            </span>
            <Button variant="field" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              Show more
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
