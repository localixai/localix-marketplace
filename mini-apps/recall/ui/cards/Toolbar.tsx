import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { Input } from '@localixai/kit/input'
import { Kbd } from '@localixai/kit/kbd'
import { SearchInput } from '@localixai/kit/search-input'
import { Select, type SelectOption } from '@localixai/kit/select'
import { WorkbenchToolbar, WorkbenchToolbarSection } from '@localixai/kit/workbench-toolbar'
import { SegmentedRadioGroup } from '@localixai/mini-app-sdk/ui/segmented-control'
import { INBOX, LIBRARY_SORTS, NOTE_KINDS, type LibrarySort } from '../../shared/model'
import type { DeckSummary } from '../../shared/payloads'
import { isFiltering, type CardsFilters } from '../nav'
import { KIND_LABELS } from './note-form'

const STATES: SelectOption[] = [
  { value: 'all', label: 'Any state' },
  { value: 'new', label: 'New' },
  { value: 'learning', label: 'Learning' },
  { value: 'review', label: 'Review' },
  { value: 'paused', label: 'Paused' },
  { value: 'hard', label: 'Hard cards' },
  { value: 'draft', label: 'Drafts' },
]
const SORTS: Record<LibrarySort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  updated: 'Recently edited',
  due: 'Due soonest',
  hardest: 'Hardest first',
  alpha: 'A to Z',
}

/** Search (by words or by meaning), the filters, the sort and the New card button. */
export function Toolbar({
  filters,
  decks,
  onChange,
  onClear,
  onNew,
}: {
  filters: CardsFilters
  decks: readonly DeckSummary[]
  onChange: (change: Partial<CardsFilters>) => void
  onClear: () => void
  onNew: () => void
}) {
  const deckOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: 'All decks' },
      { value: INBOX, label: 'Inbox' },
      ...decks.map((deck) => ({ value: deck.id, label: deck.name })),
    ],
    [decks],
  )
  const kinds: SelectOption[] = [
    { value: 'all', label: 'Any type' },
    ...NOTE_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] })),
  ]
  return (
    <WorkbenchToolbar aria-label="Card filters" wrap>
      <WorkbenchToolbarSection className="min-w-0 flex-1" wrap>
        <SearchInput
          aria-label="Search cards"
          placeholder={filters.mode === 'meaning' ? 'Search by meaning' : 'Search words, tags'}
          value={filters.q}
          onValueChange={(q) => onChange({ q })}
          className="w-full min-w-40 max-w-72"
        />
        <SegmentedRadioGroup<'text' | 'meaning'>
          aria-label="Search by"
          size="sm"
          value={filters.mode}
          onValueChange={(mode) => onChange({ mode })}
          options={[
            { value: 'text', label: 'Words' },
            { value: 'meaning', label: 'Meaning', title: 'Find cards that mean the same, not only the same words' },
          ]}
        />
      </WorkbenchToolbarSection>
      <WorkbenchToolbarSection align="end">
        <Button size="sm" variant="mono" onClick={onNew}>
          <Plus data-icon="inline-start" />
          New card
          <Kbd className="hidden @lg:inline-flex">N</Kbd>
        </Button>
      </WorkbenchToolbarSection>
      <WorkbenchToolbarSection className="basis-full" wrap>
        <Select aria-label="Filter by deck" size="md" value={filters.deck} options={deckOptions} onValueChange={(deck) => onChange({ deck })} />
        <Select aria-label="Filter by state" size="md" value={filters.state} options={STATES} onValueChange={(state) => onChange({ state })} />
        <Select aria-label="Filter by type" size="md" value={filters.kind} options={kinds} onValueChange={(kind) => onChange({ kind })} />
        <Input
          aria-label="Filter by tag"
          size="md"
          className="w-28"
          placeholder="Tag"
          value={filters.tag}
          onChange={(event) => onChange({ tag: event.target.value })}
        />
        <Select
          aria-label="Sort cards"
          size="md"
          value={filters.sort}
          options={LIBRARY_SORTS.map((value) => ({ value, label: SORTS[value] }))}
          onValueChange={(sort) => onChange({ sort: sort as LibrarySort })}
        />
        {isFiltering(filters) && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </WorkbenchToolbarSection>
    </WorkbenchToolbar>
  )
}
