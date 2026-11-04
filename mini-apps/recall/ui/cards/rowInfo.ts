import { cardStateWord } from '../../shared/describe'
import { formatDue } from '../../shared/format'
import type { LibraryRow } from '../../shared/payloads'

export type RowState = 'draft' | 'paused' | 'hard' | 'new' | 'learning' | 'review'

/** The one word a row shows for its note: a draft first, then paused, hard, new, learning, review. */
export function rowState(row: LibraryRow): RowState {
  if (row.note.status === 'draft') return 'draft'
  const words = row.cards.map(cardStateWord)
  for (const word of ['paused', 'hard', 'learning', 'review', 'new'] as const) {
    if (words.every((w) => w === word)) return word
  }
  if (words.includes('hard')) return 'hard'
  if (words.includes('learning')) return 'learning'
  if (words.includes('review')) return 'review'
  return words.includes('paused') ? 'paused' : 'new'
}

export const STATE_LABEL: Record<RowState, string> = {
  draft: 'Draft',
  paused: 'Paused',
  hard: 'Hard',
  new: 'New',
  learning: 'Learning',
  review: 'Review',
}

export const STATE_TONE: Record<RowState, 'info' | 'warning' | 'neutral' | 'success' | 'accent'> = {
  draft: 'accent',
  paused: 'neutral',
  hard: 'warning',
  new: 'info',
  learning: 'info',
  review: 'success',
}

/** When the soonest studiable card of the note is due: "in 3 d", "now", or null for a new or paused one. */
export function nextDue(row: LibraryRow, now: number): string | null {
  const due = row.cards
    .filter((card) => !card.paused && card.state > 0)
    .map((card) => card.due)
    .sort()[0]
  return due ? formatDue(due, new Date(now)) : null
}
