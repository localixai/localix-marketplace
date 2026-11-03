import { useMemo, useState, type DragEvent } from 'react'
import { useScreenProblem } from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { useNow } from '@localixai/mini-app-sdk/ui/now'
import { SearchInput } from '@localixai/kit/search-input'
import { Select, type SelectOption } from '@localixai/kit/select'
import { WorkbenchToolbar, WorkbenchToolbarSection } from '@localixai/kit/workbench-toolbar'
import { APP, OWNERS, STAGES, type Deal, type Stage } from '../../shared/model'
import { useDeals, type PatternProps } from '../data'
import { countOf } from '../format'
import { STAGE_LABEL } from '../stage'
import { BoardColumn } from './board-parts'

/**
 * BOARD — a kanban by stage. Columns share the width and keep a floor (`min-w-44 flex-1`), so the
 * board fills a wide pane and scrolls sideways only when the pane is narrow. A card moves three
 * ways, and none of them depends on a mouse: drag it to a column, press Alt+Left or Alt+Right on
 * it, or choose "Move to …" from its menu (the button on hover or focus, or a right-click).
 *
 * Use it for items that pass through a few named stages and where the stage is the thing a person
 * changes: a pipeline, a task flow, a review queue. For many stages or hundreds of items per stage
 * prefer a table with a stage filter.
 *
 * When copying, rename: `Board`, `useDeals`, `STAGES`/`STAGE_LABEL` (your columns), the card in
 * `board-parts.tsx` (your item), and the field `stage` that `update` changes. The drag state is
 * plain React state: HTML5 drag and drop needs no library, and the kit only supplies the
 * `DROP_TARGET_*` look of a destination.
 */

const OWNER_FILTER: SelectOption[] = [
  { value: 'all', label: 'All owners' },
  ...OWNERS.map((owner) => ({ value: owner, label: owner })),
]

export function Board({ active }: PatternProps) {
  const deals = useDeals(active)
  const now = useNow(60_000, active)
  const problem = useScreenProblem({
    app: APP,
    subject: 'Deals',
    failure: deals.error,
    showingData: deals.items.length > 0,
  })
  const [query, setQuery] = useState('')
  const [owner, setOwner] = useState('all')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<Stage | null>(null)
  // A polite announcement for assistive technology: the result of a move is otherwise silent.
  const [announcement, setAnnouncement] = useState('')

  const byStage = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const visible = deals.items.filter(
      (deal) =>
        (owner === 'all' || deal.owner === owner) &&
        (!needle || `${deal.title} ${deal.company}`.toLowerCase().includes(needle)),
    )
    return new Map(STAGES.map((stage) => [stage, visible.filter((deal) => deal.stage === stage)]))
  }, [deals.items, query, owner])
  const visibleCount = [...byStage.values()].reduce((sum, list) => sum + list.length, 0)

  async function move(deal: Deal, stage: Stage) {
    if (deal.stage === stage) return
    // The one write: the answer replaces the list, so the card appears in its new column at once.
    const result = await deals.update(deal.id, { stage })
    setAnnouncement(
      result
        ? `Moved ${deal.title} to ${STAGE_LABEL[stage]}.`
        : `Could not move ${deal.title} to ${STAGE_LABEL[stage]}.`,
    )
  }

  const onDragStart = (event: DragEvent<HTMLElement>, deal: Deal) => {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      // Firefox starts no drag without data.
      event.dataTransfer.setData('text/plain', deal.id)
    }
    setDragId(deal.id)
  }
  const endDrag = () => {
    setDragId(null)
    setOverStage(null)
  }
  const dragging = deals.items.find((deal) => deal.id === dragId)

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <WorkbenchToolbar aria-label="Board filters" wrap>
        <WorkbenchToolbarSection className="min-w-0 flex-1" wrap>
          <SearchInput
            aria-label="Search the board"
            placeholder="Search deals or companies"
            value={query}
            onValueChange={setQuery}
            className="w-full min-w-40 max-w-64"
          />
          <Select
            aria-label="Filter by owner"
            size="md"
            value={owner}
            options={OWNER_FILTER}
            onValueChange={setOwner}
          />
        </WorkbenchToolbarSection>
        <WorkbenchToolbarSection align="end">
          <span className="hidden text-2xs text-text-faint @2xl:inline">
            Drag a card, press Alt+Arrow, or use its menu
          </span>
          <span className="text-2xs tabular-nums text-text-faint">
            {countOf(visibleCount, 'deal')}
          </span>
        </WorkbenchToolbarSection>
      </WorkbenchToolbar>
      {problem && <ProblemLine {...problem} />}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div
        role="region"
        aria-label="Pipeline board"
        className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-3 scrollbar-thin"
      >
        {STAGES.map((stage) => (
          <BoardColumn
            key={stage}
            stage={stage}
            deals={byStage.get(stage) ?? []}
            now={now}
            loading={deals.loading}
            failed={deals.error !== null}
            dragId={dragId}
            isOver={overStage === stage && dragging?.stage !== stage}
            onDragOver={(event) => {
              if (!dragId) return
              // Preventing the default is what makes the column a valid drop target.
              event.preventDefault()
              if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
              setOverStage(stage)
            }}
            onDragLeave={(event) => {
              // Moving between a column's children also fires leave; only leaving the column counts.
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setOverStage((current) => (current === stage ? null : current))
              }
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (dragging) void move(dragging, stage)
              endDrag()
            }}
            onDragStart={onDragStart}
            onDragEnd={endDrag}
            onMove={(deal, target) => void move(deal, target)}
          />
        ))}
      </div>
    </div>
  )
}
