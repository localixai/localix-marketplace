import { Inbox, SearchX, WifiOff } from 'lucide-react'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { Button } from '@localixai/kit/button'
import { DIVIDED_LIST } from '@localixai/kit/divided-list'
import { Skeleton } from '@localixai/kit/skeleton'
import { StateNotice } from '@localixai/kit/state-notice'
import type { Deal } from '../../shared/model'
import { formatCloseDay, formatMoney } from '../format'

/** Parts of the states pattern: the one decision (`viewState`) and the body that draws it. */

export type ViewState = 'loading' | 'error' | 'empty' | 'filtered' | 'ready'

/**
 * Which of the five states a list is in. One pure function, so a screen cannot draw two at once
 * or forget one, and the order of the checks is the policy:
 * - loading wins only until something is known;
 * - an error is the whole state only when there is nothing older to show; with stale rows the rows
 *   stay and a notice bar says why they may be old;
 * - "empty" (nothing exists) and "filtered" (something exists, none match) are different messages
 *   with different ways out, so they are never merged.
 */
export function viewState(input: {
  loading: boolean
  error: string | null
  total: number
  shown: number
  filtering: boolean
}): ViewState {
  if (input.loading) return 'loading'
  if (input.error && input.total === 0) return 'error'
  if (input.total === 0) return 'empty'
  if (input.shown === 0 && input.filtering) return 'filtered'
  return 'ready'
}

/** Loading shaped like the content: the same rows, the same widths, no spinner in the middle. */
function RowsSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading deals"
      className={cn(DIVIDED_LIST, 'rounded-lg border border-border-soft')}
    >
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

export function StatesBody({
  state,
  deals,
  query,
  error,
  now,
  onRetry,
  onClearFilters,
  onCreate,
}: {
  state: ViewState
  deals: Deal[]
  query: string
  error: string | null
  now: number
  onRetry: () => void
  onClearFilters: () => void
  onCreate?: () => void
}) {
  switch (state) {
    case 'loading':
      return <RowsSkeleton />
    case 'error':
      return (
        <StateNotice
          role="alert"
          icon={WifiOff}
          title="Deals could not be loaded"
          body={error ?? 'Something went wrong while reading the pipeline.'}
          actionsLabel="Ways to recover"
          actions={<Button onClick={onRetry}>Try again</Button>}
        />
      )
    case 'empty':
      return (
        <StateNotice
          icon={Inbox}
          title="No deals yet"
          body="Add the first deal and the pipeline, the board and the dashboard fill in from it."
          actionsLabel="Get started"
          actions={
            <>
              <Button onClick={onCreate} disabled={!onCreate}>
                New deal
              </Button>
              <Button variant="field" onClick={onRetry}>
                Reload
              </Button>
            </>
          }
        />
      )
    case 'filtered':
      return (
        <StateNotice
          icon={SearchX}
          title="No deals match"
          body={`Nothing matches “${query}”. Check the spelling or search for something broader.`}
          actions={
            <Button variant="field" onClick={onClearFilters}>
              Clear filters
            </Button>
          }
        />
      )
    case 'ready':
      return (
        <ul aria-label="Deals" className={cn(DIVIDED_LIST, 'rounded-lg border border-border-soft')}>
          {deals.map((deal) => (
            <li key={deal.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground" title={deal.title}>
                  {deal.title}
                </p>
                <p className="truncate text-2xs text-text-faint" title={deal.company}>
                  {deal.company}
                </p>
              </div>
              <span className="text-2xs tabular-nums text-text-faint">
                {formatCloseDay(deal.closeDate, now)}
              </span>
              <span className="w-20 text-right text-xs font-medium tabular-nums text-foreground">
                {formatMoney(deal.amount, deal.currency)}
              </span>
            </li>
          ))}
        </ul>
      )
  }
}
