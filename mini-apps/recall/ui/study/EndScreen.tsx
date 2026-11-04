import { PartyPopper } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { StateNotice } from '@localixai/kit/state-notice'
import { Metric } from '../Metric'
import { countOf, formatDue, formatPercent } from '../../shared/format'
import { useRead } from '../data'
import { clock, momentOf } from '../format'
import type { Session } from './useStudy'

/** The prompt that puts this session's misses in the chat to be explained. */
export function missesPrompt(misses: Session['misses']): string {
  const lines = misses.slice(0, 15).map((miss) => `- "${miss.front.slice(0, 120)}" (note id ${miss.noteId})`)
  return [
    `I just missed ${countOf(misses.length, 'card')} in Recall. Please explain each one briefly from its back and extra (read it with recall_get_card), and tell me one way to remember it:`,
    ...lines,
  ].join('\n')
}

/** What the session came to: how many, how well, when the next card is, and the misses to explain. */
export function EndScreen({
  session,
  seconds,
  now,
  onDone,
  onResume,
  onMore,
  onAsk,
}: {
  session: Session
  seconds: number
  now: number
  onDone: () => void
  /** Present while cards are left: the session was ended early. */
  onResume: (() => void) | null
  /** Start a new run for what is still waiting today. */
  onMore: () => void
  onAsk: (text: string) => void
}) {
  const { answered, remembered, misses } = session
  // What still waits today (a new run would find it) and when the next learning card is due.
  const today = useRead('today').data
  const more = today?.due.total ?? 0
  const nextDueAt = session.nextDueAt ?? today?.nextDueAt ?? null
  const next = more > 0 ? `${more} more today` : nextDueAt ? formatDue(nextDueAt, new Date(now)) : '—'
  const keepGoing = onResume ?? (more > 0 ? onMore : null)
  if (answered === 0) {
    return (
      <StateNotice
        icon={PartyPopper}
        title="Nothing to study right now"
        body={
          more > 0
            ? `${more} more waiting today.`
            : nextDueAt
              ? `Next card: ${momentOf(nextDueAt, now)}.`
              : 'Every card is up to date.'
        }
        actions={
          <>
            {more > 0 && (
              <Button variant="mono" onClick={onMore}>
                Keep studying
              </Button>
            )}
            <Button variant={more > 0 ? 'field' : 'mono'} onClick={onDone}>
              Done
            </Button>
          </>
        }
      />
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-6">
      <div className="recall-card flex w-full flex-col gap-5" role="region" aria-label="Session summary">
        <div>
          <span className="recall-kicker">Session {onResume ? 'paused' : 'complete'}</span>
          <h2 className="mt-1 text-2xl font-semibold">
            {onResume ? 'Good stop' : 'Nicely done'}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
          <Metric label="Reviewed" value={answered} />
          <Metric label="Remembered" value={formatPercent(remembered / answered)} hint="today" />
          <Metric label="Time" value={clock(seconds)} />
          <Metric label="Next" value={next} hint={more === 0 && nextDueAt ? momentOf(nextDueAt, now) : undefined} />
        </div>
        {misses.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-text-soft">Missed ({misses.length})</p>
            <ul className="flex flex-col gap-1 text-sm">
              {misses.slice(0, 5).map((miss) => (
                <li key={miss.noteId} className="truncate text-text-soft">
                  {miss.front}
                </li>
              ))}
              {misses.length > 5 && <li className="text-xs text-text-faint">…and {misses.length - 5} more</li>}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="mono" onClick={onDone}>
            Done
          </Button>
          {keepGoing && (
            <Button variant="field" onClick={keepGoing}>
              Keep studying
            </Button>
          )}
          {misses.length > 0 && (
            <Button variant="field" onClick={() => onAsk(missesPrompt(misses))}>
              Explain my misses in the chat
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
