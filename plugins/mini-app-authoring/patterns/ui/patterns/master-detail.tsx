import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { CircleCheck, CircleX, MessageSquarePlus } from 'lucide-react'
import type { MenuEntry } from '@localixai/mini-app-sdk/ui'
import { useScreenProblem } from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { useNow } from '@localixai/mini-app-sdk/ui/now'
import { WorkbenchSash } from '@localixai/kit/button'
import { usePaneResize } from '@localixai/kit/pane-resize'
import { SearchInput } from '@localixai/kit/search-input'
import { Skeleton } from '@localixai/kit/skeleton'
import { EmptyHint } from '@localixai/kit/empty-hint'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { APP, type Deal } from '../../shared/model'
import { useActivities, useDeals, type PatternProps } from '../data'
import { DealRow, DetailPane, NoSelection } from './master-detail-parts'

/**
 * MASTER-DETAIL — a list on the left, the selected item's detail on the right, a draggable sash
 * between them. Arrow keys walk the list (Home/End jump) and select as they go; each row has a
 * kebab and a right-click menu described once as `MenuEntries`. In a narrow pane (below the
 * `@2xl` container width) the two collapse into one at a time, with a back button.
 *
 * Use it when people scan many items and need one at a time in depth: an inbox, a CRM, a log.
 * Selection is kept by id, so if the item is deleted elsewhere the detail falls back to the empty
 * state instead of showing a copy that no longer exists.
 *
 * When copying, rename: `MasterDetail`, `useDeals`/`useActivities`, `DealRow`/`DetailPane` in
 * `master-detail-parts.tsx`, the menu entries, and the `storageKey` of the sash (so the width the
 * person chose is remembered per screen).
 */

export function MasterDetail({ active }: PatternProps) {
  const deals = useDeals(active)
  const activities = useActivities(active)
  const now = useNow(60_000, active)
  const problem = useScreenProblem({
    app: APP,
    subject: 'Deals',
    failure: deals.error,
    showingData: deals.items.length > 0,
  })
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusSignal, setFocusSignal] = useState(0)
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
    storageKey: 'ui-patterns.master-detail.list-width',
  })

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return deals.items.filter(
      (deal) =>
        !needle || `${deal.title} ${deal.company} ${deal.owner}`.toLowerCase().includes(needle),
    )
  }, [deals.items, query])
  // Selection is an id; the item is looked up each render, so a removed deal is gone, not stale.
  const selected = deals.items.find((deal) => deal.id === selectedId) ?? null
  const tabStopId = visible.some((deal) => deal.id === selectedId) ? selectedId : visible[0]?.id
  const dealActivities = useMemo(
    () =>
      activities.items
        .filter((activity) => activity.dealId === selectedId)
        .sort((a, b) => b.at.localeCompare(a.at)),
    [activities.items, selectedId],
  )

  const entries = (deal: Deal): MenuEntry[] => [
    {
      id: 'log',
      label: 'Log activity',
      icon: MessageSquarePlus,
      onSelect: () => {
        setSelectedId(deal.id)
        setFocusSignal((n) => n + 1)
      },
    },
    { separator: true },
    {
      id: 'won',
      label: 'Mark as won',
      icon: CircleCheck,
      disabled: deal.stage === 'won',
      onSelect: () => void deals.update(deal.id, { stage: 'won' }),
    },
    {
      id: 'lost',
      label: 'Mark as lost',
      icon: CircleX,
      danger: true,
      disabled: deal.stage === 'lost',
      onSelect: () => void deals.update(deal.id, { stage: 'lost' }),
    },
  ]

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(event.key) || visible.length === 0) return
    const current = visible.findIndex((deal) => deal.id === tabStopId)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? visible.length - 1
          : Math.min(
              visible.length - 1,
              Math.max(0, current + (event.key === 'ArrowDown' ? 1 : -1)),
            )
    event.preventDefault()
    const id = visible[next]!.id
    setSelectedId(id)
    // The row exists already, so focus can move now; the roving tabindex follows the selection.
    listRef.current?.querySelector<HTMLElement>(`[data-deal-id="${id}"]`)?.focus()
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      {problem && <ProblemLine {...problem} />}
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
          <div className="shrink-0 px-3 py-2">
            <SearchInput
              aria-label="Search deals"
              placeholder="Search deals"
              value={query}
              onValueChange={setQuery}
              className="w-full"
            />
          </div>
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- arrow keys bubble up from the row buttons, which are the focus stops */}
          <div
            ref={listRef}
            role="list"
            aria-label="Deals"
            onKeyDown={onListKeyDown}
            className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 scrollbar-thin"
          >
            {deals.loading ? (
              <ListSkeleton />
            ) : visible.length === 0 ? (
              <EmptyHint>{query ? `No deals match “${query}”.` : 'No deals yet.'}</EmptyHint>
            ) : (
              visible.map((deal) => (
                <DealRow
                  key={deal.id}
                  deal={deal}
                  now={now}
                  selected={deal.id === selectedId}
                  tabStop={deal.id === tabStopId}
                  entries={entries(deal)}
                  onSelect={() => setSelectedId(deal.id)}
                />
              ))
            )}
          </div>
        </div>
        <div className="relative hidden shrink-0 @2xl:block">
          <WorkbenchSash
            label="Resize the deal list"
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
              deal={selected}
              activities={dealActivities}
              now={now}
              sending={activities.sending}
              activityError={activities.error}
              focusSignal={focusSignal}
              onBack={() => setSelectedId(null)}
              onAddActivity={activities.add}
            />
          ) : (
            <NoSelection />
          )}
        </div>
      </div>
    </div>
  )
}

/** Rows shaped like rows, so the list does not jump when the deals arrive. */
function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2 px-1.5 py-1">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-center gap-2.5">
          <Skeleton className="size-4 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  )
}
