import { useState } from 'react'
import { CloudOff } from 'lucide-react'
import { useNow } from '@localixai/mini-app-sdk/ui/now'
import { SegmentedRadioGroup } from '@localixai/mini-app-sdk/ui/segmented-control'
import { Button } from '@localixai/kit/button'
import { Field } from '@localixai/kit/field'
import { PanelHeader } from '@localixai/kit/panel-header'
import { SearchInput } from '@localixai/kit/search-input'
import { Switch } from '@localixai/kit/switch'
import { WorkbenchNoticeBar } from '@localixai/kit/workbench-notice-bar'
import { useDeals, type PatternProps } from '../data'
import { StatesBody, viewState, type ViewState } from './states-parts'

/**
 * STATES — what a list shows when it is not simply full: loading, empty, filtered to nothing, a
 * failed load, and a transient condition above good content. Each is drawn on purpose, with its
 * own words and its own way out; none is a blank pane or a spinner floating in the middle.
 *
 * - Loading: skeletons shaped like the rows, so nothing jumps when the data arrives.
 * - Empty: `StateNotice` with an icon, a title, a body that says what to do, and action buttons.
 * - Filtered to nothing: a different message from "empty" (something exists), with "Clear filters".
 * - Error: `StateNotice role="alert"` with the reason and a retry; with older rows still on screen
 *   the rows stay and a notice bar explains instead.
 * - Transient: `WorkbenchNoticeBar` above the content for a condition that comes and goes.
 *
 * The switch is the gallery's: it overrides what the live data would show so each state can be
 * seen. In a real screen there is no switch; `viewState(...)` reads the live loading, error and
 * counts, and `StatesBody` draws the answer. Copy those two and delete this file's override.
 *
 * When copying, rename: `States`, `useDeals`, the wording in `states-parts.tsx`, and the actions.
 */

type Simulated = 'live' | Exclude<ViewState, 'ready'>
const OPTIONS: { value: Simulated; label: string }[] = [
  { value: 'live', label: 'Live data' },
  { value: 'loading', label: 'Loading' },
  { value: 'empty', label: 'Empty' },
  { value: 'filtered', label: 'No matches' },
  { value: 'error', label: 'Load error' },
]

export function States({
  active,
  onNewDeal,
}: PatternProps & {
  /** The primary action of the empty state. The gallery sends it to the form-dialog pattern. */
  onNewDeal?: () => void
}) {
  const deals = useDeals(active)
  const now = useNow(60_000, active)
  const [simulate, setSimulate] = useState<Simulated>('live')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState(false)

  // What the live data says, then what the switch overrides.
  const needle = query.trim().toLowerCase()
  const matching = deals.items.filter(
    (deal) => !needle || `${deal.title} ${deal.company}`.toLowerCase().includes(needle),
  )
  const total = simulate === 'empty' ? 0 : deals.items.length
  const state = viewState({
    loading: simulate === 'loading' || (simulate === 'live' && deals.loading),
    error: simulate === 'error' ? 'The pipeline service did not answer in time.' : deals.error,
    total: simulate === 'error' ? 0 : total,
    shown: simulate === 'filtered' ? 0 : simulate === 'empty' ? 0 : matching.length,
    filtering: simulate === 'filtered' || needle !== '',
  })
  const shownQuery = simulate === 'filtered' && !needle ? 'Acme' : query.trim()

  function pick(next: Simulated) {
    setSimulate(next)
    if (next !== 'live') setQuery('')
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <PanelHeader
        tone="content"
        title="States"
        summary="Switch what the list shows"
        actionsLabel="State controls"
        actions={
          <Field layout="inline" label="Transient notice" className="w-auto">
            <Switch checked={notice} onChange={(event) => setNotice(event.target.checked)} />
          </Field>
        }
      />
      <div className="shrink-0 overflow-x-auto px-3 pt-3 scrollbar-thin @3xl:px-4">
        <SegmentedRadioGroup
          aria-label="State to show"
          size="sm"
          value={simulate}
          options={OPTIONS}
          onValueChange={pick}
        />
      </div>
      {notice && (
        <WorkbenchNoticeBar
          tone="warning"
          className="mt-3"
          icon={<CloudOff className="size-3.5" />}
          title="Showing the last loaded deals"
          description="The connection dropped. Changes you make now are kept and sent when it is back."
          dismissLabel="Dismiss the notice"
          onDismiss={() => setNotice(false)}
          actions={
            <Button size="xs" variant="ghost" onClick={deals.refresh}>
              Retry now
            </Button>
          }
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 scrollbar-thin @3xl:px-4">
        {state !== 'loading' && state !== 'error' && state !== 'empty' && (
          <SearchInput
            aria-label="Search deals"
            placeholder="Search deals or companies"
            value={simulate === 'filtered' ? shownQuery : query}
            onValueChange={(value) => {
              if (simulate !== 'live') setSimulate('live')
              setQuery(value)
            }}
            className="w-full max-w-72"
          />
        )}
        <StatesBody
          state={state}
          deals={matching}
          query={shownQuery}
          error={
            simulate === 'error' ? 'The pipeline service did not answer in time.' : deals.error
          }
          now={now}
          onRetry={() => {
            setSimulate('live')
            deals.refresh()
          }}
          onClearFilters={() => {
            setSimulate('live')
            setQuery('')
          }}
          onCreate={onNewDeal}
        />
      </div>
    </div>
  )
}
