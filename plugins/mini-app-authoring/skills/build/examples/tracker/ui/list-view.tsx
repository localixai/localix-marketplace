import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { MousePointerClick, Pencil, Trash2 } from 'lucide-react'
import type { MenuEntry } from '@localixai/mini-app-sdk/ui'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { WorkbenchSash } from '@localixai/kit/button'
import { usePaneResize } from '@localixai/kit/pane-resize'
import { StateNotice } from '@localixai/kit/state-notice'
import {
  APP,
  STATUSES,
  companyName,
  type Application,
  type ApplicationInput,
  type Company,
  type Status,
} from '../shared/model'
import { DetailPane } from './detail-pane'
import { ApplicationRow } from './list-parts'
import { ListSkeleton } from './states'
import { STATUS_LABEL } from './status'

/**
 * MASTER-DETAIL: the applications on the left, the selected one's detail on the right, a
 * draggable sash between them. Arrow keys walk the list (Home/End jump) and select as they go.
 * Below the `@2xl` container width the two collapse into one at a time, with a back button.
 *
 * Selection is an id and the application is looked up each render, so one deleted elsewhere falls
 * back to "Select an application" instead of showing a copy that no longer exists.
 */
export function ListView({
  applications,
  companies,
  all,
  loading,
  now,
  selectedId,
  onSelect,
  onEdit,
  onChange,
  onDelete,
  onRemoveCompany,
}: {
  /** What the filters leave, in display order. */
  applications: readonly Application[]
  companies: readonly Company[]
  /** Every application, to count a company's. */
  all: readonly Application[]
  loading: boolean
  now: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onEdit: (application: Application) => void
  onChange: (application: Application, change: Partial<ApplicationInput>) => void
  onDelete: (application: Application) => void
  onRemoveCompany: (company: Company) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const list = usePaneResize({
    axis: 'x',
    initial: 340,
    min: 260,
    max: 560,
    containerRef,
    // The detail pane and the sash must keep room, whatever width was saved.
    reserve: 340,
    // Remembered per screen: the width the person chose comes back next time.
    storageKey: `${APP}.list-width`,
  })
  const selected = all.find((application) => application.id === selectedId) ?? null
  const tabStopId = applications.some((a) => a.id === selectedId) ? selectedId : applications[0]?.id

  const entries = (application: Application): MenuEntry[] => [
    { id: 'edit', label: 'Edit', icon: Pencil, onSelect: () => onEdit(application) },
    { separator: true },
    ...STATUSES.filter((status) => status !== application.status).map(
      (status: Status): MenuEntry => ({
        id: `move-${status}`,
        label: `Move to ${STATUS_LABEL[status]}`,
        onSelect: () => onChange(application, { status }),
      }),
    ),
    { separator: true },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      danger: true,
      onSelect: () => onDelete(application),
    },
  ]

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key) || applications.length === 0) return
    const current = applications.findIndex((a) => a.id === tabStopId)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? applications.length - 1
          : Math.min(
              applications.length - 1,
              Math.max(0, current + (event.key === 'ArrowDown' ? 1 : -1)),
            )
    event.preventDefault()
    const id = applications[next]!.id
    onSelect(id)
    // The row exists already, so focus can move now; the roving tabindex follows the selection.
    listRef.current?.querySelector<HTMLElement>(`[data-application-id="${id}"]`)?.focus()
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1"
      style={{ '--list-width': `${list.size}px` } as CSSProperties}
    >
      <div
        className={cn(
          '@container min-h-0 w-full flex-col @2xl:flex @2xl:w-(--list-width) @2xl:shrink-0',
          selected ? 'hidden' : 'flex',
        )}
      >
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow keys bubble up from the row buttons, which are the focus stops */}
        <div
          ref={listRef}
          role="list"
          aria-label="Applications"
          onKeyDown={onListKeyDown}
          className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2 scrollbar-thin"
        >
          {loading ? (
            <ListSkeleton />
          ) : (
            applications.map((application) => (
              <ApplicationRow
                key={application.id}
                application={application}
                company={companyName(companies, application)}
                now={now}
                selected={application.id === selectedId}
                tabStop={application.id === tabStopId}
                entries={entries(application)}
                onSelect={() => onSelect(application.id)}
              />
            ))
          )}
        </div>
      </div>
      <div className="relative hidden shrink-0 @2xl:block">
        <WorkbenchSash
          label="Resize the application list"
          orientation="vertical"
          resetLabel="restore the default width"
          className="relative z-(--z-controls) -mx-[calc(var(--sash-hit-area)/2)] h-full"
          valueNow={list.size}
          valueMin={list.min}
          valueMax={list.limit}
          valueText={`${Math.round(list.size)} pixels`}
          active={list.resizing}
          onPointerDown={list.onResizeStart}
          onKeyDown={list.onResizeKeyDown}
          onDoubleClick={list.reset}
        />
      </div>
      <div
        className={cn(
          '@container min-w-0 flex-1 flex-col border-l border-border-soft @2xl:flex @2xl:border-l-0',
          selected ? 'flex' : 'hidden',
        )}
      >
        {selected ? (
          <DetailPane
            application={selected}
            company={companies.find((company) => company.id === selected.companyId) ?? null}
            siblings={all.filter((a) => a.companyId === selected.companyId).length}
            now={now}
            onBack={() => onSelect(null)}
            onEdit={() => onEdit(selected)}
            onRemoveCompany={() => {
              const company = companies.find((each) => each.id === selected.companyId)
              if (company) onRemoveCompany(company)
            }}
          />
        ) : (
          <StateNotice
            icon={MousePointerClick}
            title="Select an application"
            body="Its details and its timeline appear here."
          />
        )}
      </div>
    </div>
  )
}
