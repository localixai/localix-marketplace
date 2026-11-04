import { FileClock, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@localixai/kit/button'
import { countOf } from '../../shared/format'

function Banner({ icon, children, action }: { icon: ReactNode; children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border-soft bg-surface-sunken px-3 py-2">
      <span className="text-text-soft [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-xs">{children}</div>
      {action}
    </div>
  )
}

/** What waits for a decision: drafts to accept and cards without a deck. Nothing here acts alone. */
export function Banners({
  drafts,
  inbox,
  onReview,
  onSort,
}: {
  drafts: number
  inbox: number
  onReview: () => void
  onSort: () => void
}) {
  if (!drafts && !inbox) return null
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Waiting for you">
      {drafts > 0 && (
        <Banner
          icon={<FileClock />}
          action={
            <Button size="sm" variant="field" onClick={onReview}>
              Review
            </Button>
          }
        >
          <p className="font-medium text-foreground">{countOf(drafts, 'card')} to review</p>
          <p className="text-text-faint">Made by the agent or imported. They stay out of your study until you accept them.</p>
        </Banner>
      )}
      {inbox > 0 && (
        <Banner
          icon={<Inbox />}
          action={
            <Button size="sm" variant="field" onClick={onSort}>
              Sort
            </Button>
          }
        >
          <p className="font-medium text-foreground">{countOf(inbox, 'card')} without a deck</p>
          <p className="text-text-faint">Recall can suggest a deck and tags for each.</p>
        </Banner>
      )}
    </div>
  )
}
