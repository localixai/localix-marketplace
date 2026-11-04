import { useState } from 'react'
import { Layers } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { Skeleton } from '@localixai/kit/skeleton'
import { StateNotice } from '@localixai/kit/state-notice'
import { Banners } from './Banners'
import { DeckDialog } from './DeckDialog'
import { DeckList, rowsOf, type DeckRow } from './DeckList'
import { DeckRemoveDialog } from './DeckRemoveDialog'
import { Hero } from './Hero'
import { SortDialog } from './SortDialog'
import type { Read } from '../data'
import type { StudyTarget } from '../nav'
import { useReportContext } from '../screen-context'
import type { Deck } from '../../shared/model'
import type { DeckSummary, TodaySummary } from '../../shared/payloads'
import { describeOverview } from '../../shared/describe'
import { utcOffset } from '../format'

export interface TodayActions {
  onStudy: (target: StudyTarget | null) => void
  onShowCards: (preset: { deck?: string; state?: string }) => void
  onNewCard: () => void
  onImport: () => void
}

export function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

/** The first tab: start studying, what waits for a decision, the goal and the decks. */
export function TodayTab({
  today,
  now,
  actions,
}: {
  today: Read<TodaySummary>
  now: number
  actions: TodayActions
}) {
  const [sorting, setSorting] = useState(false)
  const [editing, setEditing] = useState<{ deck: Deck | null } | null>(null)
  const [removing, setRemoving] = useState<DeckSummary | null>(null)
  const data = today.data
  useReportContext(data ? describeOverview(data, { actual: null, target: 0 }, new Date(now), utcOffset()) : null)

  if (!data) {
    return today.error ? (
      <StateNotice
        role="alert"
        icon={Layers}
        title="Today could not be loaded"
        body={today.error}
        actions={<Button onClick={today.refresh}>Try again</Button>}
      />
    ) : (
      <TodaySkeleton />
    )
  }
  if (data.totals.notes === 0 && data.decks.length === 0) {
    return (
      <StateNotice
        icon={Layers}
        title="No cards yet"
        body="Paste text or attach a file in the chat — the agent makes cards. Or add one yourself."
        actions={
          <>
            <Button variant="mono" onClick={actions.onNewCard}>
              Add a card
            </Button>
            <Button variant="field" onClick={actions.onImport}>
              Import
            </Button>
          </>
        }
      />
    )
  }
  const rows = rowsOf(data.decks, { notes: data.inbox, due: data.inboxDue })
  const study = (row: DeckRow) => actions.onStudy({ deckIds: [row.id], label: row.name })
  return (
    <div className="flex flex-col gap-6">
      <Hero today={data} now={now} onStudy={() => actions.onStudy(null)} />
      <Banners
        drafts={data.drafts}
        inbox={data.inbox}
        onReview={() => actions.onShowCards({ state: 'draft' })}
        onSort={() => setSorting(true)}
      />
      <DeckList
        rows={rows}
        onStudy={study}
        onShow={(row) => actions.onShowCards({ deck: row.id })}
        onReview={(row) => actions.onShowCards({ deck: row.id, state: 'draft' })}
        onEdit={(deck) => setEditing({ deck })}
        onRemove={setRemoving}
        onCreate={() => setEditing({ deck: null })}
      />
      <SortDialog open={sorting} onClose={() => setSorting(false)} />
      <DeckDialog open={editing !== null} deck={editing?.deck ?? null} onClose={() => setEditing(null)} />
      <DeckRemoveDialog deck={removing} onClose={() => setRemoving(null)} />
    </div>
  )
}
