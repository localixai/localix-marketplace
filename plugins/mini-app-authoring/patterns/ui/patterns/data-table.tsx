import { useMemo, useState } from 'react'
import { SearchX } from 'lucide-react'
import { useScreenProblem } from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { useNow } from '@localixai/mini-app-sdk/ui/now'
import { Button } from '@localixai/kit/button'
import { ConfirmDialog } from '@localixai/kit/confirm-dialog'
import { SearchInput } from '@localixai/kit/search-input'
import { StateNotice } from '@localixai/kit/state-notice'
import { WorkbenchToolbar, WorkbenchToolbarSection } from '@localixai/kit/workbench-toolbar'
import { APP, STAGES, toUsd, type Deal, type DealInput } from '../../shared/model'
import { useDeals, type PatternProps } from '../data'
import { countOf } from '../format'
import {
  BulkBar,
  DealTableRow,
  SORT_LABEL,
  SelectAllHeader,
  SkeletonRows,
  SortHeader,
  type Sort,
  type SortKey,
} from './data-table-parts'
import { DealFormDialog } from './form-dialog-parts'

/**
 * DATA TABLE — a real `<table>` for many rows: select rows (with an indeterminate select-all),
 * sort by any column, act on the selection, open a row to edit it, and page through the rest.
 * Money is right-aligned in `tabular-nums` so digits line up; columns drop out as the pane
 * narrows (`@2xl`, `@3xl`); the header stays while the body scrolls.
 *
 * Use it for tens to a few thousand rows that people compare, sort and act on in bulk. For very
 * large, read-mostly, spreadsheet-like data (virtualised rows, column resizing, cell editing, keys
 * like a grid), use `TableGrid` from `@localixai/mini-app-sdk/ui/components` instead: it is the
 * host's own grid, sortable and loading more at the end, and takes columns and rows as data. This
 * pattern is the choice when rows need their own controls (checkboxes, buttons, menus).
 *
 * Two decisions worth copying: the list is capped (`PAGE_SIZE`, then "Show more"), because
 * rendering every row of a long table is the slowest thing a screen can do; and delete sits behind
 * a `ConfirmDialog` that says how many rows it will remove.
 *
 * When copying, rename: `DataTable`, `useDeals`, the columns in `data-table-parts.tsx`, the sort
 * comparators, and the delete wording. Edit opens `DealFormDialog` (form-dialog-parts.tsx).
 */

const PAGE_SIZE = 10
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** How each column orders rows. A missing close date always sorts last, in either direction. */
const COMPARE: Record<SortKey, (a: Deal, b: Deal) => number> = {
  title: (a, b) => collator.compare(a.title, b.title),
  owner: (a, b) => collator.compare(a.owner, b.owner),
  stage: (a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage),
  closeDate: (a, b) => (a.closeDate ?? '').localeCompare(b.closeDate ?? ''),
  // Compare in one currency: 90,000 GBP is not smaller than 95,000 USD.
  amount: (a, b) => toUsd(a.amount, a.currency) - toUsd(b.amount, b.currency),
}

function sortDeals(deals: Deal[], { key, dir }: Sort): Deal[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...deals].sort((a, b) => {
    if (key === 'closeDate' && (!a.closeDate || !b.closeDate)) {
      return a.closeDate === b.closeDate ? 0 : a.closeDate ? -1 : 1
    }
    return sign * COMPARE[key](a, b)
  })
}

export function DataTable({ active }: PatternProps) {
  const deals = useDeals(active)
  const now = useNow(60_000, active)
  const problem = useScreenProblem({
    app: APP,
    subject: 'Deals',
    failure: deals.error,
    showingData: deals.items.length > 0,
  })
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'amount', dir: 'desc' })
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const sorted = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matching = deals.items.filter(
      (deal) =>
        !needle || `${deal.title} ${deal.company} ${deal.owner}`.toLowerCase().includes(needle),
    )
    return sortDeals(matching, sort)
  }, [deals.items, query, sort])
  const shown = sorted.slice(0, limit)
  // Only ids that still exist count: a deal deleted elsewhere cannot stay "selected".
  const selectedIds = deals.items.filter((deal) => picked.has(deal.id)).map((deal) => deal.id)
  const shownSelected = shown.filter((deal) => picked.has(deal.id)).length
  const editing = deals.items.find((deal) => deal.id === editId) ?? null

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const toggleAll = () =>
    setPicked((current) => {
      const next = new Set(current)
      const all = shown.every((deal) => next.has(deal.id))
      for (const deal of shown) {
        if (all) next.delete(deal.id)
        else next.add(deal.id)
      }
      return next
    })
  const onSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'amount' ? 'desc' : 'asc' },
    )

  async function deleteSelected() {
    setConfirming(false)
    const remaining = new Set(selectedIds)
    // One request per row, in order; stop at the first refusal and keep those rows selected.
    for (const id of selectedIds) {
      if (!(await deals.remove(id))) break
      remaining.delete(id)
    }
    setPicked(remaining)
  }
  async function save(input: DealInput): Promise<boolean> {
    const result = editing ? await deals.update(editing.id, input) : null
    if (result) setEditId(null)
    return result !== null
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <WorkbenchToolbar aria-label={selectedIds.length ? 'Bulk actions' : 'Table filters'}>
        {selectedIds.length > 0 ? (
          <BulkBar
            count={selectedIds.length}
            busy={deals.sending}
            onClear={() => setPicked(new Set())}
            onDelete={() => setConfirming(true)}
          />
        ) : (
          <>
            <WorkbenchToolbarSection className="min-w-0 flex-1">
              <SearchInput
                aria-label="Search the table"
                placeholder="Search deals, companies or owners"
                value={query}
                onValueChange={(value) => {
                  setQuery(value)
                  setLimit(PAGE_SIZE)
                }}
                className="w-full min-w-40 max-w-72"
              />
            </WorkbenchToolbarSection>
            <WorkbenchToolbarSection align="end">
              <span className="text-2xs tabular-nums text-text-faint">
                {countOf(sorted.length, 'deal')}
              </span>
            </WorkbenchToolbarSection>
          </>
        )}
      </WorkbenchToolbar>
      {problem && <ProblemLine {...problem} />}
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <table className="w-full border-collapse text-xs">
          <caption className="sr-only">
            Deals, sorted by {SORT_LABEL[sort.key]},{' '}
            {sort.dir === 'asc' ? 'ascending' : 'descending'}
          </caption>
          <thead className="sticky top-0 z-(--z-raised) bg-background">
            <tr className="border-b border-border">
              <SelectAllHeader
                all={shown.length > 0 && shownSelected === shown.length}
                some={shownSelected > 0}
                onToggle={toggleAll}
              />
              <SortHeader label="Deal" sortKey="title" sort={sort} onSort={onSort} />
              <SortHeader label="Stage" sortKey="stage" sort={sort} onSort={onSort} />
              <SortHeader
                label="Owner"
                sortKey="owner"
                sort={sort}
                onSort={onSort}
                className="hidden @3xl:table-cell"
              />
              <SortHeader
                label="Closes"
                sortKey="closeDate"
                sort={sort}
                onSort={onSort}
                className="hidden @2xl:table-cell"
              />
              <SortHeader
                label="Amount"
                sortKey="amount"
                sort={sort}
                onSort={onSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {deals.loading ? (
              <SkeletonRows />
            ) : (
              shown.map((deal) => (
                <DealTableRow
                  key={deal.id}
                  deal={deal}
                  now={now}
                  selected={picked.has(deal.id)}
                  onToggle={() => toggle(deal.id)}
                  onEdit={() => setEditId(deal.id)}
                />
              ))
            )}
          </tbody>
        </table>
        {!deals.loading && sorted.length === 0 && (
          <StateNotice
            icon={SearchX}
            title={query ? 'No deals match' : 'No deals yet'}
            body={query ? `Nothing matches “${query}”.` : 'Deals you add appear here.'}
            actions={
              query ? (
                <Button variant="field" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              ) : undefined
            }
          />
        )}
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
      <ConfirmDialog
        open={confirming}
        variant="destructive"
        title={`Delete ${countOf(selectedIds.length, 'deal')}?`}
        description="They are removed from the pipeline for everyone. This cannot be undone."
        confirmLabel="Delete"
        onClose={() => setConfirming(false)}
        onConfirm={() => void deleteSelected()}
      />
      <DealFormDialog
        open={editing !== null}
        deal={editing}
        pending={deals.sending}
        serverError={deals.error}
        onOpenChange={(open) => !open && setEditId(null)}
        onSubmit={save}
      />
    </div>
  )
}
