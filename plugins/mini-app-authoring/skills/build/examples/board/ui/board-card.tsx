import type { DragEvent, KeyboardEvent } from 'react'
import { ArrowRight, CalendarClock, MoreHorizontal, UserRound } from 'lucide-react'
import type { MenuEntry } from '@localixai/mini-app-sdk/ui'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { Chip } from '@localixai/kit/chip'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@localixai/kit/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@localixai/kit/dropdown-menu'
import { IconButton } from '@localixai/kit/icon-button'
import { MenuEntries } from '@localixai/kit/menu-entries'
import { STAGES, STAGE_LABEL, isOverdue, neighbour, type Card, type Stage } from '../shared/model'
import { dayOf, formatDate, formatDue, formatPoints } from './format'

/** "Move to …" for every other stage. The same entries serve the kebab and the right-click menu. */
export function moveEntries(card: Card, move: (stage: Stage) => void): MenuEntry[] {
  return STAGES.filter((stage) => stage !== card.stage).map((stage) => ({
    id: `move-${stage}`,
    label: `Move to ${STAGE_LABEL[stage]}`,
    icon: ArrowRight,
    onSelect: () => move(stage),
  }))
}

/**
 * CARD ANATOMY, top to bottom: the title (two lines at most) with its hover actions, the note,
 * who has it, then a footer with the points on the left and the due day on the right. A late day
 * turns `text-status-error` AND says "ago": colour never carries the meaning alone.
 */
export function CardView({
  card,
  now,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: Card
  now: number
  dragging: boolean
  onDragStart: (event: DragEvent<HTMLElement>, card: Card) => void
  onDragEnd: () => void
  onMove: (card: Card, stage: Stage) => void
}) {
  const entries = moveEntries(card, (stage) => onMove(card, stage))
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Alt+Left/Right moves the focused card one column; the menu offers every column.
    if (!event.altKey || event.target !== event.currentTarget) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const target = neighbour(card.stage, event.key === 'ArrowLeft' ? -1 : 1)
    if (target) onMove(card, target)
  }
  const late = isOverdue(card, dayOf(now))
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a draggable card: the pointer path is drag, the keyboard path is Alt+Arrow and the menu */}
        <article
          draggable
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the card is the focus stop that Alt+Arrow acts on
          tabIndex={0}
          aria-label={card.title}
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
          onDragStart={(event) => onDragStart(event, card)}
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
              title={card.title}
            >
              {card.title}
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  size="xs"
                  aria-label={`Actions for ${card.title}`}
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
          {card.note && <p className="mt-0.5 line-clamp-2 text-2xs text-text-soft">{card.note}</p>}
          {card.assignee && (
            <span
              className="mt-1 flex min-w-0 items-center gap-1 text-2xs text-text-faint"
              title={card.assignee}
            >
              <UserRound className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{card.assignee}</span>
            </span>
          )}
          {(card.points || card.due) && (
            <div className="mt-1.5 flex items-center justify-between gap-2">
              {card.points ? (
                <Chip tone="neutral" size="dense">
                  <span className="tabular-nums">{formatPoints(card.points)}</span>
                </Chip>
              ) : (
                <span />
              )}
              {card.due && (
                <time
                  dateTime={card.due}
                  title={`Due ${formatDate(card.due)}`}
                  className={cn(
                    'flex shrink-0 items-center gap-1 text-2xs tabular-nums',
                    late ? 'text-status-error' : 'text-text-faint',
                  )}
                >
                  <CalendarClock className="size-3" aria-hidden />
                  {formatDue(card.due, now)}
                </time>
              )}
            </div>
          )}
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <MenuEntries entries={entries} family="context" />
      </ContextMenuContent>
    </ContextMenu>
  )
}
