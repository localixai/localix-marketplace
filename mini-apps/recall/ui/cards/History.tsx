import { Chip } from '@localixai/kit/chip'
import { SectionLabel } from '@localixai/kit/section-label'
import { cardStateWord } from '../../shared/describe'
import { countOf, formatDue, formatInterval, formatPercent } from '../../shared/format'
import { RATING_NAMES, type Rating } from '../../shared/model'
import type { NoteDetail } from '../../shared/payloads'
import { momentOf } from '../format'

const TONE: Record<Rating, 'error' | 'warning' | 'success' | 'info'> = {
  1: 'error',
  2: 'warning',
  3: 'success',
  4: 'info',
}

/** A card's memory in words: where each of its cards stands and every answer, newest first. */
export function History({ detail, now }: { detail: NoteDetail; now: number }) {
  const { cards, history } = detail
  const answered = history.length
  const kept = history.filter((review) => review.rating > 1).length
  return (
    <section aria-label="History" className="flex flex-col gap-4 border-t border-border-soft p-4">
      <div className="flex flex-col gap-2">
        <SectionLabel as="h3">Memory</SectionLabel>
        {cards.length === 0 ? (
          <p className="text-xs text-text-faint">This note makes no cards yet.</p>
        ) : (
          <ul className="divide-y divide-border-faint rounded-lg border border-border-soft">
            {cards.map((card) => (
              <li key={card.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                <span className="w-16 font-medium capitalize">{card.variant.replace('forward', 'front')}</span>
                <Chip tone={card.leech ? 'warning' : 'neutral'}>{cardStateWord(card)}</Chip>
                <span className="tabular-nums text-text-soft">
                  {card.state > 0 && !card.paused ? `Next ${formatDue(card.due, new Date(now))}` : card.state === 0 ? 'Not studied yet' : 'Paused'}
                </span>
                <span className="ml-auto tabular-nums text-text-faint">
                  {countOf(card.reps, 'review')} · {countOf(card.lapses, 'miss', 'misses')}
                  {card.state > 0 ? ` · recall ${formatPercent(card.retrievability)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <SectionLabel as="h3">Answers</SectionLabel>
          {answered > 0 && (
            <span className="text-xs text-text-faint tabular-nums">
              Remembered {formatPercent(kept / answered)} of {countOf(answered, 'answer')}
            </span>
          )}
        </div>
        {answered === 0 ? (
          <p className="text-xs text-text-faint">No answers yet.</p>
        ) : (
          <ol className="divide-y divide-border-faint rounded-lg border border-border-soft" aria-label="Answers, newest first">
            {history.map((review) => (
              <li key={review.id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                <Chip tone={TONE[review.rating]} className="w-14 justify-center">{RATING_NAMES[review.rating]}</Chip>
                <span className="tabular-nums text-text-soft">{momentOf(review.reviewedAt, now)}</span>
                <span className="ml-auto tabular-nums text-text-faint">
                  back in {formatInterval(Math.max(0, Date.parse(review.due) - Date.parse(review.reviewedAt)))}
                  {review.source === 'chat' ? ' · in chat' : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

