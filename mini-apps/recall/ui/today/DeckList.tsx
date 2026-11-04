import { Eye, MoreHorizontal, Pencil, Play, Plus, Trash2, Library } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { Chip } from '@localixai/kit/chip'
import type { MenuEntry } from '@localixai/mini-app-sdk/ui'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@localixai/kit/dropdown-menu'
import { IconButton } from '@localixai/kit/icon-button'
import { MenuEntries } from '@localixai/kit/menu-entries'
import { SectionLabel } from '@localixai/kit/section-label'
import { countOf, formatDue } from '../../shared/format'
import type { DeckSummary } from '../../shared/payloads'

/** One row of the deck list; the Inbox is a row without a menu of its own. */
export interface DeckRow {
  id: string
  name: string
  color: number | null
  /** What the person wrote: notes, shown as cards. */
  notes: number
  due: number
  new: number
  /** Notes waiting to be accepted, paused cards, and when the soonest scheduled card comes. */
  drafts: number
  paused: number
  nextDueAt: string | null
  deck: DeckSummary | null
}

export function rowsOf(decks: readonly DeckSummary[], inbox: { notes: number; due: number }): DeckRow[] {
  const rows: DeckRow[] = decks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    color: deck.color,
    notes: deck.notes,
    due: deck.due,
    new: deck.new,
    drafts: deck.drafts,
    paused: deck.paused,
    nextDueAt: deck.nextDueAt,
    deck,
  }))
  if (inbox.notes > 0) {
    rows.push({ id: 'inbox', name: 'Inbox', color: null, notes: inbox.notes, due: inbox.due, new: -1, drafts: 0, paused: 0, nextDueAt: null, deck: null })
  }
  return rows
}

function entriesOf(
  row: DeckRow,
  onShow: (row: DeckRow) => void,
  onEdit: (deck: DeckSummary) => void,
  onRemove: (deck: DeckSummary) => void,
): MenuEntry[] {
  const deck = row.deck
  return [
    { id: 'show', label: 'Show cards', icon: Library, onSelect: () => onShow(row) },
    ...(deck
      ? [
          { id: 'edit', label: 'Rename or recolour', icon: Pencil, onSelect: () => onEdit(deck) },
          { separator: true as const },
          { id: 'remove', label: 'Remove deck', icon: Trash2, danger: true, onSelect: () => onRemove(deck) },
        ]
      : []),
  ]
}

/** What waits in a deck, in the hero's words: "3 due · 2 new", zero parts left out. */
export function studyWords(row: Pick<DeckRow, 'due' | 'new'>): string {
  // The Inbox cannot tell new from due (new is -1): it says the total.
  if (row.new < 0) return `${row.due} to study`
  return [row.due - row.new > 0 ? `${row.due - row.new} due` : '', row.new > 0 ? `${row.new} new` : ''].filter(Boolean).join(' · ')
}

/** Why a deck has nothing to study: drafts to accept, paused cards, or all done until later. */
export function idleWords(row: Pick<DeckRow, 'drafts' | 'paused' | 'nextDueAt'>, now: Date): string {
  if (row.nextDueAt) return `All done · next ${formatDue(row.nextDueAt, now)}`
  if (row.drafts > 0) return countOf(row.drafts, 'draft')
  if (row.paused > 0) return `${row.paused} paused`
  return 'Nothing due'
}

/** Decks as rows: what is due, a Study button per deck, and a menu to look at, edit or remove. */
export function DeckList({
  rows,
  onStudy,
  onShow,
  onReview,
  onEdit,
  onRemove,
  onCreate,
}: {
  rows: readonly DeckRow[]
  onStudy: (row: DeckRow) => void
  onShow: (row: DeckRow) => void
  onReview: (row: DeckRow) => void
  onEdit: (deck: DeckSummary) => void
  onRemove: (deck: DeckSummary) => void
  onCreate: () => void
}) {
  const now = new Date()
  return (
    <section aria-labelledby="recall-decks" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel as="h3">
          <span id="recall-decks">Decks</span>
        </SectionLabel>
        <Button size="sm" variant="field" onClick={onCreate}>
          <Plus data-icon="inline-start" />
          New deck
        </Button>
      </div>
      <ul className="grid gap-2 @4xl:grid-cols-2">
        {rows.map((row) => (
          <li key={row.id} className="@container flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border-soft px-3 py-2" data-recall-color={row.color ?? undefined}>
            <span className="recall-dot" aria-hidden />
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 flex-1 basis-28 justify-start"
              aria-label={`Show cards in ${row.name}, ${countOf(row.notes, 'card')}`}
              onClick={() => onShow(row)}
            >
              <span className="truncate font-medium">{row.name}</span>
              <span className="hidden shrink-0 font-normal text-text-faint tabular-nums @md:inline">
                {countOf(row.notes, 'card')}
              </span>
            </Button>
            {row.due > 0 ? (
              <Chip tone="info" className="tabular-nums" title={`${row.due} to study today`}>
                {studyWords(row)}
              </Chip>
            ) : (
              <span className="text-xs text-text-faint">{idleWords(row, now)}</span>
            )}
            {row.due === 0 && row.drafts > 0 && !row.nextDueAt ? (
              <Button size="sm" variant="field" aria-label={`Review drafts in ${row.name}`} onClick={() => onReview(row)}>
                <Eye data-icon="inline-start" />
                Review
              </Button>
            ) : (
              <Button
                size="sm"
                variant="field"
                disabled={row.due === 0}
                aria-label={`Study ${row.name}`}
                onClick={() => onStudy(row)}
              >
                <Play data-icon="inline-start" />
                Study
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton size="sm" aria-label={`Actions for ${row.name}`} tooltip="Deck actions">
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <MenuEntries entries={entriesOf(row, onShow, onEdit, onRemove)} family="dropdown" />
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>
    </section>
  )
}
