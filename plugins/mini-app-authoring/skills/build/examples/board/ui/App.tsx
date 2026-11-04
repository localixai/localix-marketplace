import { useMemo, useState } from 'react'
import {
  useAgentContext,
  useCollection,
  useScreenProblem,
  type ScreenProps,
} from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { useNow } from '@localixai/mini-app-sdk/ui/now'
import { EmptyHint } from '@localixai/kit/empty-hint'
import { PanelHeader } from '@localixai/kit/panel-header'
import { SearchInput } from '@localixai/kit/search-input'
import { Select, type SelectOption } from '@localixai/kit/select'
import { WorkbenchToolbar, WorkbenchToolbarSection } from '@localixai/kit/workbench-toolbar'
import {
  APP,
  CARDS,
  STAGES,
  cardSchema,
  cardsIn,
  columnTotals,
  describeForAgent,
  type Card,
  type CardInput,
} from '../shared/model'
import { AddCardForm } from './add-card-form'
import { BoardColumn } from './board-column'
import { countOf, formatPoints } from './format'
import { useBoardMoves } from './use-board-moves'

/**
 * The board. It reads the chat's collection (`scope: 'chat'`: the host gives this tab the chat it
 * belongs to), tells the agent exactly what it shows, and writes through the same collection the
 * agent's tools use. The agent's moves arrive on their own: the collection hook follows the store
 * feed, so a card the agent moves slides to its column without a refresh.
 */
export function App({ active, publishMessageContext }: ScreenProps) {
  const cards = useCollection<Card, CardInput>({
    app: APP,
    name: CARDS,
    item: cardSchema,
    scope: 'chat',
    active,
  })
  // Re-render each minute, so "tomorrow" and the red of a late card stay true with the board open.
  const now = useNow(60_000, active)
  const moves = useBoardMoves(cards.items, cards.update)
  const problem = useScreenProblem({
    app: APP,
    subject: 'Board',
    failure: cards.error,
    showingData: cards.items.length > 0,
  })
  const [query, setQuery] = useState('')
  const [assignee, setAssignee] = useState('all')

  // The agent reads the whole board, not the filtered one: a filter is the person's view.
  useAgentContext(
    publishMessageContext,
    active && !cards.loading,
    useMemo(() => ({ label: 'Board', content: describeForAgent(cards.items) }), [cards.items]),
  )

  const people = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: 'Everyone' },
      ...[...new Set(cards.items.map((card) => card.assignee).filter(Boolean))]
        .sort()
        .map((name) => ({ value: name, label: name })),
    ],
    [cards.items],
  )
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return cards.items.filter(
      (card) =>
        (assignee === 'all' || card.assignee === assignee) &&
        (!needle || `${card.title} ${card.note}`.toLowerCase().includes(needle)),
    )
  }, [cards.items, query, assignee])
  const inPlay = columnTotals(cards.items.filter((card) => card.stage !== 'done'))

  return (
    // The fill chain: the header and toolbar stay, the columns fill the rest, and each column
    // scrolls its own cards. `@container` makes the layout follow the pane, not the window.
    <div className="@container flex h-full min-h-0 flex-col">
      <PanelHeader
        tone="content"
        title="Board"
        summary={
          cards.loading
            ? 'Loading…'
            : `${countOf(cards.items.length, 'card')} · ${formatPoints(inPlay.points)} left to do`
        }
      />
      {problem && <ProblemLine {...problem} />}
      <WorkbenchToolbar aria-label="Board filters" wrap>
        <WorkbenchToolbarSection className="min-w-0 flex-1" wrap>
          <SearchInput
            aria-label="Search the board"
            placeholder="Search cards"
            value={query}
            onValueChange={setQuery}
            className="w-full min-w-40 max-w-64"
          />
          <Select
            aria-label="Filter by person"
            size="md"
            value={assignee}
            options={people}
            onValueChange={setAssignee}
          />
        </WorkbenchToolbarSection>
        <WorkbenchToolbarSection align="end">
          <span className="hidden text-2xs text-text-faint @2xl:inline">
            Drag a card, press Alt+Arrow, or use its menu
          </span>
          <AddCardForm sending={cards.sending} onAdd={cards.add} />
        </WorkbenchToolbarSection>
      </WorkbenchToolbar>
      <p role="status" aria-live="polite" className="sr-only">
        {moves.announcement}
      </p>
      {!cards.loading && cards.items.length === 0 && !cards.error && (
        <EmptyHint>
          Add a card above, or ask in the chat: “add a card to fix the login bug”.
        </EmptyHint>
      )}
      <div
        role="region"
        aria-label="Board columns"
        className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-3 scrollbar-thin"
      >
        {STAGES.map((stage) => (
          <BoardColumn
            key={stage}
            stage={stage}
            cards={cardsIn(visible, stage)}
            now={now}
            loading={cards.loading}
            failed={cards.error !== null}
            dragId={moves.dragId}
            {...moves.columnDrop(stage)}
            onDragStart={moves.onCardDragStart}
            onDragEnd={moves.onCardDragEnd}
            onMove={(card, target) => void moves.move(card, target)}
          />
        ))}
      </div>
    </div>
  )
}
