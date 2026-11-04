import type { DragEvent } from 'react'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import {
  DROP_TARGET_SLOT,
  DROP_TARGET_SURFACE_ACTIVE,
  DROP_TARGET_TRANSITION,
} from '@localixai/kit/drop-target'
import { SectionLabel } from '@localixai/kit/section-label'
import { Skeleton } from '@localixai/kit/skeleton'
import { StatusDot } from '@localixai/kit/status-dot'
import { STAGE_LABEL, columnTotals, type Card, type Stage } from '../shared/model'
import { CardView } from './board-card'
import { countOf, formatPoints } from './format'
import { STAGE_DOT } from './stage'

/** Card-shaped placeholders at the card's own heights, so the column does not jump on load. */
function ColumnSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      {['h-[4.5rem]', 'h-16', 'h-[4.5rem]'].map((height, index) => (
        <Skeleton key={index} className={cn('rounded-md', height)} />
      ))}
    </div>
  )
}

/**
 * One stage: a header with its name, count and points, and the cards. Columns share the width and
 * keep a floor (`min-w-44 flex-1`): they fill a wide pane, and the board scrolls sideways only when
 * the pane is too narrow for four of them. `DROP_TARGET_*` is the kit's look of a destination.
 */
export function BoardColumn({
  stage,
  cards,
  now,
  loading,
  failed,
  dragId,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  ...card
}: {
  stage: Stage
  cards: Card[]
  now: number
  loading: boolean
  failed: boolean
  dragId: string | null
  isOver: boolean
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onDragStart: (event: DragEvent<HTMLElement>, card: Card) => void
  onDragEnd: () => void
  onMove: (card: Card, stage: Stage) => void
}) {
  const { count, points } = columnTotals(cards)
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a drop region; the keyboard path to the same result is each card's menu
    <section
      aria-label={`${STAGE_LABEL[stage]}, ${countOf(count, 'card')}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'flex min-h-0 min-w-44 flex-1 shrink-0 flex-col rounded-lg border bg-foreground/[0.03]',
        DROP_TARGET_TRANSITION,
        isOver ? DROP_TARGET_SURFACE_ACTIVE : 'border-border-soft',
      )}
    >
      <header className="flex items-center justify-between gap-2 px-2 py-1.5">
        <SectionLabel as="h3" weight="semibold" className="flex items-center gap-1.5">
          <StatusDot className={STAGE_DOT[stage]} />
          {STAGE_LABEL[stage]}
          <span className="font-normal tabular-nums text-text-faint">{count}</span>
        </SectionLabel>
        <span
          className="text-2xs tabular-nums text-text-faint"
          title={`${STAGE_LABEL[stage]}: ${formatPoints(points)}`}
        >
          {formatPoints(points)}
        </span>
      </header>
      <div className="flex min-h-16 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-1.5 scrollbar-thin">
        {loading ? (
          <ColumnSkeleton />
        ) : (
          cards.map((each) => (
            <CardView key={each.id} card={each} now={now} dragging={dragId === each.id} {...card} />
          ))
        )}
        {!loading && cards.length === 0 && (
          <div
            className={cn(
              'm-auto rounded-md border border-dashed px-3 py-2 text-2xs',
              DROP_TARGET_TRANSITION,
              dragId !== null && isOver ? DROP_TARGET_SLOT : 'border-border-soft text-text-faint',
            )}
          >
            {dragId !== null ? 'Drop here' : failed ? 'Not loaded' : 'No cards'}
          </div>
        )}
      </div>
    </section>
  )
}
