import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Library, SearchX } from 'lucide-react'
import { toast } from '@localixai/mini-app-sdk/ui'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { Button, WorkbenchSash } from '@localixai/kit/button'
import { Checkbox } from '@localixai/kit/checkbox'
import { usePaneResize } from '@localixai/kit/pane-resize'
import { Skeleton } from '@localixai/kit/skeleton'
import { StateNotice } from '@localixai/kit/state-notice'
import { countOf } from '../../shared/format'
import type { DeckSummary } from '../../shared/payloads'
import { call, useAction } from '../data'
import { isFiltering } from '../nav'
import { useReportContext } from '../screen-context'
import { BulkBar, type BulkAsk } from './BulkBar'
import { BulkDialogs, type BulkBody } from './BulkDialogs'
import { bulkRequest, type BulkTarget } from './bulkRequest'
import { CardRow } from './CardRow'
import { DetailPane } from './DetailPane'
import { Toolbar } from './Toolbar'
import type { CardsState } from './useCardsState'
import { useLibrary } from './useLibrary'

/** The list's width in px until the person drags the sash; until then it is 45% of the pane. */
const DEFAULT_LIST = 400

export function RowsSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3" aria-hidden>
      {Array.from({ length: 7 }, (_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  )
}

/**
 * Cards: a searchable, filterable list with multi-select and bulk actions on the left, the editor
 * and the card's history on the right (one at a time below `@2xl`). The list is read page by page.
 */
export function CardsTab({
  state,
  decks,
  suggest,
  now,
  active,
  onImport,
}: {
  state: CardsState
  decks: readonly DeckSummary[]
  suggest: boolean
  now: number
  active: boolean
  onImport: () => void
}) {
  const { filters, openId, creating } = state
  const library = useLibrary(filters, active)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  // Every card the list matches is selected, not only those loaded: the server resolves them.
  const [all, setAll] = useState(false)
  const [draftsInAll, setDraftsInAll] = useState(false)
  const [ask, setAsk] = useState<BulkAsk | null>(null)
  const action = useAction()
  const containerRef = useRef<HTMLDivElement>(null)
  const pane = usePaneResize({
    axis: 'x',
    initial: DEFAULT_LIST,
    min: 300,
    max: 900,
    containerRef,
    reserve: 340,
  })
  const [moved, setMoved] = useState(false)
  const detailOpen = openId !== null || creating
  // Selection is ids, kept only for cards still in the list: a deleted card cannot stay selected.
  const selected = useMemo(
    () => (all ? library.rows : library.rows.filter((row) => picked.has(row.note.id))),
    [library.rows, picked, all],
  )
  const count = all ? library.total : selected.length
  const clearSelection = useCallback(() => {
    setPicked(new Set())
    setAll(false)
  }, [])
  // A different list is a different selection.
  useEffect(clearSelection, [filters, clearSelection])
  // "All" over a list that may hold drafts: the server says whether it does.
  const matchQuery = library.query
  useEffect(() => {
    setDraftsInAll(false)
    if (!all) return
    let live = true
    call('library', { query: { ...matchQuery, status: 'draft', limit: 1 } })
      .then((page) => live && setDraftsInAll(page.total > 0))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [all, JSON.stringify(matchQuery), library.total])
  const filtering = isFiltering(filters)

  useReportContext(
    [
      'Cards tab.',
      filters.q.trim() ? `Search "${filters.q.trim()}" by ${library.by ?? filters.mode}.` : '',
      filtering
        ? `Filters: deck ${decks.find((d) => d.id === filters.deck)?.name ?? filters.deck}, state ${filters.state}, type ${filters.kind}${filters.tag ? `, tag ${filters.tag}` : ''}.`
        : 'No filters.',
      all ? `${countOf(library.total, 'card')} match. All ${countOf(library.total, 'matching card')} selected.` : `${countOf(library.total, 'card')} match; ${selected.length} selected.`,
    ]
      .filter(Boolean)
      .join(' '),
  )

  const toggle = useCallback(
    (id: string) =>
      setPicked((current) => {
        // Unticking one card in "all" mode keeps the loaded cards, minus that one, as plain ids.
        const next = all ? new Set(library.rows.map((row) => row.note.id)) : new Set(current)
        if (!next.delete(id)) next.add(id)
        setAll(false)
        return next
      }),
    [all, library.rows],
  )
  const allPicked = library.rows.length > 0 && selected.length === library.rows.length
  const toggleAll = () => (allPicked ? clearSelection() : (setAll(false), setPicked(new Set(library.rows.map((row) => row.note.id)))))

  async function run(body: BulkBody) {
    const target: BulkTarget = all
      ? { all: true, match: library.query, expect: library.total }
      : { all: false, ids: selected.map((row) => row.note.id) }
    const result = await action.run(() => call('bulk', { body: bulkRequest(target, body) }))
    setAsk(null)
    if (result) {
      toast.success(result.message)
      clearSelection()
    } else library.refresh()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault()
      state.newCard()
    } else if (event.key === 'Escape' && count > 0) {
      event.preventDefault()
      clearSelection()
    }
  }

  let list
  if (library.error && library.rows.length === 0) {
    list = (
      <StateNotice
        role="alert"
        icon={Library}
        title="Cards could not be loaded"
        body={library.error}
        actions={<Button onClick={library.refresh}>Try again</Button>}
      />
    )
  } else if (library.loading) list = <RowsSkeleton />
  else if (library.total === 0 && !filtering) {
    list = (
      <StateNotice
        icon={Library}
        title="No cards yet"
        body="Paste text or attach a file in the chat — the agent makes cards. Or add one yourself."
        actions={
          <>
            <Button variant="mono" onClick={state.newCard}>Add a card</Button>
            <Button variant="field" onClick={onImport}>Import</Button>
          </>
        }
      />
    )
  } else if (library.total === 0) {
    list = (
      <StateNotice
        icon={SearchX}
        title="No cards match"
        body="Nothing fits these filters."
        actions={<Button onClick={state.clear}>Clear filters</Button>}
      />
    )
  } else {
    list = (
      <>
        <div className="flex items-center gap-2 border-b border-border-faint px-3 py-1.5 text-xs text-text-faint">
          <Checkbox aria-label="Select all shown cards" checked={allPicked} indeterminate={count > 0 && !allPicked} onChange={toggleAll} />
          <span className="tabular-nums">
            {countOf(library.total, 'card')}
            {library.by === 'meaning' && ' · matched by meaning'}
            {library.by === 'text' && filters.mode === 'meaning' && ' · meaning search is not ready, matched by words'}
          </span>
        </div>
        <div role="list" aria-label="Cards" className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1 scrollbar-thin">
          {library.rows.map((row) => (
            <CardRow
              key={row.note.id}
              row={row}
              now={now}
              selected={all || picked.has(row.note.id)}
              open={row.note.id === openId}
              onToggle={toggle}
              onOpen={state.openNote}
            />
          ))}
          {library.hasMore && (
            <div className="flex justify-center p-3">
              <Button variant="field" size="sm" onClick={library.showMore}>
                Show more
              </Button>
            </div>
          )}
        </div>
      </>
    )
  }

  // Side by side only when there is room (from @3xl); below that an open card replaces the list.
  const sized = moved ? `${pane.size}px` : '45%'
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- N starts a new card; the button beside it does the same
    <div ref={containerRef} className="@container flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown} style={{ '--cards-width': sized } as CSSProperties}>
      <div className={detailOpen ? 'hidden @3xl:block' : 'block'}>
        <Toolbar filters={filters} decks={decks} onChange={state.patch} onClear={state.clear} onNew={state.newCard} />
        {count > 0 && (
          <BulkBar
            count={count}
            total={library.total}
            all={all}
            loaded={library.rows.length}
            hasDrafts={all ? draftsInAll : selected.some((row) => row.note.status === 'draft')}
            busy={action.busy}
            onClear={clearSelection}
            onSelectAll={() => setAll(true)}
            onAsk={setAsk}
            onRun={(act) => void run({ action: act })}
          />
        )}
        {library.error && library.rows.length > 0 && (
          <p role="alert" className="px-3 py-1 text-xs text-status-error">{library.error}</p>
        )}
        {action.error && <p role="alert" className="px-3 py-1 text-xs text-status-error">{action.error}</p>}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={cn('min-h-0 min-w-0 flex-col', detailOpen ? 'hidden @3xl:flex @3xl:w-(--cards-width) @3xl:shrink-0' : 'flex flex-1')}>
          {list}
        </div>
        {detailOpen && (
          <>
            <div className="relative hidden shrink-0 @3xl:block">
              <WorkbenchSash
                label="Resize the card list"
                orientation="vertical"
                resetLabel="restore the default width"
                className="relative z-(--z-controls) -mx-[calc(var(--sash-hit-area)/2)] h-full"
                valueNow={pane.size}
                valueMin={pane.min}
                valueMax={pane.limit}
                valueText={`${Math.round(pane.size)} pixels`}
                active={pane.resizing}
                onPointerDown={(event) => (setMoved(true), pane.onResizeStart(event))}
                onKeyDown={(event) => (setMoved(true), pane.onResizeKeyDown(event))}
                onDoubleClick={() => (setMoved(false), pane.reset())}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col border-l border-border-soft @3xl:border-l-0">
              <DetailPane
                key={openId ?? 'new'}
                noteId={openId}
                decks={decks}
                initial={creating && filters.deck !== 'all' ? { deck: filters.deck } : undefined}
                suggest={suggest}
                now={now}
                onBack={state.close}
                onSaved={(note, created) => created && state.openNote(note.id)}
                onOpenNote={state.openNote}
                onGone={state.close}
              />
            </div>
          </>
        )}
      </div>
      <BulkDialogs ask={ask} count={count} decks={decks} busy={action.busy} onClose={() => setAsk(null)} onSubmit={(body) => void run(body)} />
    </div>
  )
}
