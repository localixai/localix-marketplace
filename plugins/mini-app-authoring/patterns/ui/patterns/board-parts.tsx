import type { DragEvent, KeyboardEvent } from 'react'
import { ArrowRight, Building2, CalendarClock, MoreHorizontal, UserRound } from 'lucide-react'
import type { MenuEntry } from '@localixai/mini-app-sdk/ui'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import {
  DROP_TARGET_SLOT,
  DROP_TARGET_SURFACE_ACTIVE,
  DROP_TARGET_TRANSITION,
} from '@localixai/kit/drop-target'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@localixai/kit/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@localixai/kit/dropdown-menu'
import { IconButton } from '@localixai/kit/icon-button'
import { MenuEntries } from '@localixai/kit/menu-entries'
import { SectionLabel } from '@localixai/kit/section-label'
import { Skeleton } from '@localixai/kit/skeleton'
import { StatusDot } from '@localixai/kit/status-dot'
import { STAGES, toUsd, type Deal, type Stage } from '../../shared/model'
import { formatCloseDay, formatCompactMoney, formatDate, formatMoney } from '../format'
import { STAGE_DOT, STAGE_LABEL } from '../stage'

/**
 * Parts of the board pattern: the card, the column and the menu that moves a card without a
 * mouse. Split from `board.tsx` to keep each file readable; copy them together.
 */

/** "Move to …" for every other stage. The same entries serve the kebab and the right-click menu. */
export function moveEntries(deal: Deal, move: (stage: Stage) => void): MenuEntry[] {
  return STAGES.filter((stage) => stage !== deal.stage).map((stage) => ({
    id: `move-${stage}`,
    label: `Move to ${STAGE_LABEL[stage]}`,
    icon: ArrowRight,
    onSelect: () => move(stage),
  }))
}

/** The stage next to this one, for Alt+Arrow; `null` at either end. */
const neighbour = (stage: Stage, step: -1 | 1): Stage | null =>
  STAGES[STAGES.indexOf(stage) + step] ?? null

export function DealCard({
  deal,
  now,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  deal: Deal
  now: number
  dragging: boolean
  onDragStart: (event: DragEvent<HTMLElement>, deal: Deal) => void
  onDragEnd: () => void
  onMove: (deal: Deal, stage: Stage) => void
}) {
  const entries = moveEntries(deal, (stage) => onMove(deal, stage))
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Alt+Left/Right moves the focused card one column; the menu offers every column.
    if (!event.altKey || event.target !== event.currentTarget) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const target = neighbour(deal.stage, event.key === 'ArrowLeft' ? -1 : 1)
    if (target) onMove(deal, target)
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a draggable card: the pointer path is drag, the keyboard path is Alt+Arrow and the menu */}
        <article
          draggable
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the card is the focus stop that Alt+Arrow acts on
          tabIndex={0}
          aria-label={`${deal.title}, ${deal.company}, ${formatMoney(deal.amount, deal.currency)}`}
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
          onDragStart={(event) => onDragStart(event, deal)}
          onDragEnd={onDragEnd}
          onKeyDown={onKeyDown}
          className={cn(
            'group relative cursor-grab select-none rounded-md border border-border bg-card p-2 outline-none transition-[opacity,border-color,box-shadow] focus-ring',
            'hover:border-border-strong hover:shadow-(--shadow-raised) active:cursor-grabbing',
            dragging && 'opacity-40',
          )}
        >
          <div className="flex items-start gap-1">
            <p
              className="line-clamp-2 min-w-0 flex-1 text-xs font-medium text-foreground"
              title={deal.title}
            >
              {deal.title}
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  size="xs"
                  aria-label={`Actions for ${deal.title}`}
                  tooltip="Move to…"
                  draggable={false}
                  // Revealed on hover or focus; always reachable by keyboard and on touch.
                  className="lx-hover-actions -mr-1 -mt-0.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreHorizontal className="size-3" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <MenuEntries entries={entries} family="dropdown" />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* One fact a line: a column is ~140px in a narrow pane, and "Ironbrid… · Liam…" on one
              line named neither. Each line still truncates, with the whole value in `title`. */}
          <div className="mt-1 flex min-w-0 flex-col gap-0.5 text-2xs text-text-faint">
            <span className="flex min-w-0 items-center gap-1" title={deal.company}>
              <Building2 className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{deal.company}</span>
            </span>
            <span className="flex min-w-0 items-center gap-1" title={deal.owner}>
              <UserRound className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{deal.owner}</span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tabular-nums text-foreground">
              {formatMoney(deal.amount, deal.currency)}
            </span>
            {deal.closeDate && (
              <time
                dateTime={deal.closeDate}
                title={`Closes ${formatDate(deal.closeDate)}`}
                className="flex shrink-0 items-center gap-1 text-2xs tabular-nums text-text-faint"
              >
                <CalendarClock className="size-3" aria-hidden />
                {formatCloseDay(deal.closeDate, now)}
              </time>
            )}
          </div>
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <MenuEntries entries={entries} family="context" />
      </ContextMenuContent>
    </ContextMenu>
  )
}

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

export function BoardColumn({
  stage,
  deals,
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
  deals: Deal[]
  now: number
  loading: boolean
  failed: boolean
  dragId: string | null
  isOver: boolean
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onDragStart: (event: DragEvent<HTMLElement>, deal: Deal) => void
  onDragEnd: () => void
  onMove: (deal: Deal, stage: Stage) => void
}) {
  const total = deals.reduce((sum, deal) => sum + toUsd(deal.amount, deal.currency), 0)
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a drop region; the keyboard path to the same result is each card's menu
    <section
      aria-label={`${STAGE_LABEL[stage]}, ${deals.length} ${deals.length === 1 ? 'deal' : 'deals'}`}
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
          <span className="font-normal tabular-nums text-text-faint">{deals.length}</span>
        </SectionLabel>
        <span
          className="text-2xs tabular-nums text-text-faint"
          title={`${STAGE_LABEL[stage]} total, converted to USD`}
        >
          {formatCompactMoney(total)}
        </span>
      </header>
      <div className="flex min-h-16 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-1.5 scrollbar-thin">
        {loading ? (
          <ColumnSkeleton />
        ) : (
          deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} now={now} dragging={dragId === deal.id} {...card} />
          ))
        )}
        {!loading && deals.length === 0 && (
          <div
            className={cn(
              'm-auto rounded-md border border-dashed px-3 py-2 text-2xs',
              DROP_TARGET_TRANSITION,
              dragId !== null && isOver ? DROP_TARGET_SLOT : 'border-border-soft text-text-faint',
            )}
          >
            {dragId !== null ? 'Drop here' : failed ? 'Not loaded' : 'No deals'}
          </div>
        )}
      </div>
    </section>
  )
}
