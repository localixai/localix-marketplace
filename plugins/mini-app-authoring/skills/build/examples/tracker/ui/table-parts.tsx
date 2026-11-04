import { ArrowDown, ArrowUp, ChevronsUpDown, Trash2 } from 'lucide-react'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { Button } from '@localixai/kit/button'
import { Checkbox } from '@localixai/kit/checkbox'
import { Chip } from '@localixai/kit/chip'
import { Skeleton } from '@localixai/kit/skeleton'
import { TextAction } from '@localixai/kit/text-action'
import { WorkbenchToolbarSection } from '@localixai/kit/workbench-toolbar'
import type { Application } from '../shared/model'
import { EM_DASH, formatDate, formatMoney, formatShortDate, plural } from './format'
import { STATUS_LABEL, STATUS_TONE } from './status'

/** Parts of the table view: sortable headers, a row, the bulk bar and a loading row. */

export type SortKey = 'role' | 'company' | 'status' | 'appliedOn' | 'salary'
export interface Sort {
  key: SortKey
  dir: 'asc' | 'desc'
}

/** How each sort key reads in a sentence, for the table's caption. */
export const SORT_LABEL: Record<SortKey, string> = {
  role: 'role',
  company: 'company',
  status: 'status',
  appliedOn: 'day applied',
  salary: 'pay',
}

const HEAD = 'px-2 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-text-faint'

/**
 * A sortable column header. The `<th>` carries `aria-sort` (what a screen reader announces) and the
 * button inside it is the control (what a keyboard presses); the arrow only repeats the state.
 */
export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
  className,
}: {
  label: string
  sortKey: SortKey
  sort: Sort
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
  className?: string
}) {
  const current = sort.key === sortKey
  const Icon = !current ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={current ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(HEAD, align === 'right' && 'text-right', className)}
    >
      <Button
        variant="ghost"
        size="xs"
        onClick={() => onSort(sortKey)}
        className={cn('-mx-2 uppercase tracking-wide', align === 'right' && 'flex-row-reverse')}
      >
        {label}
        <Icon data-icon="inline-end" className={cn(!current && 'opacity-50')} aria-hidden />
      </Button>
    </th>
  )
}

export function SelectAllHeader({
  all,
  some,
  onToggle,
}: {
  all: boolean
  some: boolean
  onToggle: () => void
}) {
  return (
    <th scope="col" className={cn(HEAD, 'w-9')}>
      <Checkbox
        aria-label="Select all shown applications"
        checked={all}
        indeterminate={some && !all}
        onChange={onToggle}
      />
    </th>
  )
}

export function ApplicationTableRow({
  application,
  company,
  selected,
  onToggle,
  onEdit,
}: {
  application: Application
  company: string | null
  selected: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  return (
    // The whole row is a mouse target for convenience; the role button is the keyboard one.
    <tr
      onClick={onEdit}
      data-selected={selected || undefined}
      className={cn(
        'cursor-pointer border-b border-border-soft transition-colors hover:bg-surface-hover',
        selected && 'bg-foreground/[0.05]',
      )}
    >
      <td className="w-9 px-2 py-1.5" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          aria-label={`Select ${application.role}`}
          checked={selected}
          onChange={onToggle}
        />
      </td>
      <td className="w-full max-w-0 px-2 py-1.5">
        <TextAction
          onClick={onEdit}
          title={application.role}
          aria-label={`Edit ${application.role}`}
          className="block max-w-full truncate text-left font-medium text-foreground"
        >
          {application.role}
        </TextAction>
        <p className="truncate text-2xs text-text-faint">{company ?? EM_DASH}</p>
      </td>
      <td className="px-2 py-1.5">
        <Chip tone={STATUS_TONE[application.status]} size="dense">
          {STATUS_LABEL[application.status]}
        </Chip>
      </td>
      <td className="hidden whitespace-nowrap px-2 py-1.5 tabular-nums text-text-soft @2xl:table-cell">
        {application.appliedOn ? (
          <time dateTime={application.appliedOn} title={formatDate(application.appliedOn)}>
            {formatShortDate(application.appliedOn)}
          </time>
        ) : (
          EM_DASH
        )}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium tabular-nums text-foreground">
        {formatMoney(application.salary)}
      </td>
    </tr>
  )
}

/** The loading rows have the table's own columns, so nothing moves when the data arrives. */
export function SkeletonRows() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((row) => (
        <tr key={row} aria-hidden className="border-b border-border-soft">
          <td className="px-2 py-2.5">
            <Skeleton className="size-3.5" />
          </td>
          <td className="px-2 py-2.5">
            <Skeleton className="h-3 w-2/5" />
          </td>
          <td className="px-2 py-2.5">
            <Skeleton className="h-4 w-14" />
          </td>
          <td className="hidden px-2 py-2.5 @2xl:table-cell">
            <Skeleton className="h-3 w-12" />
          </td>
          <td className="px-2 py-2.5">
            <Skeleton className="ml-auto h-3 w-16" />
          </td>
        </tr>
      ))}
    </>
  )
}

/** Replaces the filters while rows are selected, so the toolbar never changes height. */
export function BulkBar({
  count,
  busy,
  onClear,
  onDelete,
}: {
  count: number
  busy: boolean
  onClear: () => void
  onDelete: () => void
}) {
  return (
    <>
      <WorkbenchToolbarSection className="min-w-0 flex-1">
        {/* Announced politely as the selection changes. */}
        <span role="status" className="text-xs font-medium tabular-nums text-foreground">
          {count} selected
        </span>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear selection
        </Button>
      </WorkbenchToolbarSection>
      <WorkbenchToolbarSection align="end">
        <Button variant="destructive" size="sm" disabled={busy} onClick={onDelete}>
          <Trash2 data-icon="inline-start" />
          Delete {count} {plural(count, 'application', 'applications')}
        </Button>
      </WorkbenchToolbarSection>
    </>
  )
}
