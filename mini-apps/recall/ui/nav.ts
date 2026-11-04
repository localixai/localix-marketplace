import type { LibraryQuery } from '../shared/model'

export type Tab = 'today' | 'cards' | 'stats' | 'settings'
export const TABS: readonly Tab[] = ['today', 'cards', 'stats', 'settings']

/** What a study session covers: all cards, or one deck's. */
export interface StudyTarget {
  deckIds?: string[]
  label: string
}

/** The Cards tab's filters, held by the shell so Today and Stats can open it already filtered. */
export interface CardsFilters {
  q: string
  mode: 'text' | 'meaning'
  deck: string
  tag: string
  state: string
  kind: string
  sort: NonNullable<LibraryQuery['sort']>
}

export const NO_FILTERS: CardsFilters = {
  q: '',
  mode: 'text',
  deck: 'all',
  tag: '',
  state: 'all',
  kind: 'all',
  sort: 'newest',
}

export const isFiltering = (f: CardsFilters): boolean =>
  Boolean(f.q.trim()) || f.deck !== 'all' || Boolean(f.tag.trim()) || f.state !== 'all' || f.kind !== 'all'
