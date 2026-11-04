import { Briefcase, SearchX } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { Skeleton } from '@localixai/kit/skeleton'
import { StateNotice } from '@localixai/kit/state-notice'

/**
 * The four states of a list besides "has rows". Each says what happened and offers the next step;
 * none is a blank pane. (The fourth, loading, is drawn by each view as skeletons shaped like its
 * own rows, so nothing jumps when the data arrives.)
 */

/** Nothing tracked yet: a first run, with the actions that start it. */
export function EmptyTracker({
  hasCompanies,
  onNewApplication,
  onNewCompany,
}: {
  hasCompanies: boolean
  onNewApplication: () => void
  onNewCompany: () => void
}) {
  return (
    <StateNotice
      icon={Briefcase}
      title="No applications yet"
      body={
        hasCompanies
          ? 'Add the first one, or ask in the chat: “I applied to Acme as a designer today”.'
          : 'Add a company first, or ask in the chat: “I applied to Acme as a designer today”.'
      }
      actions={
        <Button onClick={hasCompanies ? onNewApplication : onNewCompany}>
          {hasCompanies ? 'New application' : 'New company'}
        </Button>
      }
    />
  )
}

/** Applications exist, but the search and filters leave none. */
export function NothingMatches({ onClear }: { onClear: () => void }) {
  return (
    <StateNotice
      icon={SearchX}
      title="No applications match"
      body="Nothing matches these filters."
      actions={
        <Button variant="field" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  )
}

/** The first read failed and there is nothing to show: say why, and offer to try again. */
export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <StateNotice
      role="alert"
      title="Applications could not be loaded"
      body={message}
      actions={<Button onClick={onRetry}>Try again</Button>}
    />
  )
}

/** Rows shaped like the list's rows, so nothing jumps when the data arrives. */
export function ListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2 px-1.5 py-1">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-center gap-2.5">
          <Skeleton className="size-4 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  )
}
