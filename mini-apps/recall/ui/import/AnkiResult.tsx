import { CircleCheck, Info } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { countOf } from '../../shared/format'
import type { ImportResult } from '../../shared/payloads-more'
import { numberLabel } from '../format'
import { cardsWord } from './ankiText'

/** What the import did, and the two ways on: the cards in Recall, or straight into studying them. */
export function AnkiResult({
  result,
  onOpen,
  onStudy,
}: {
  result: ImportResult
  onOpen: () => void
  onStudy: (() => void) | null
}) {
  return (
    <section aria-label="Imported" role="status" className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-base font-semibold">
        <CircleCheck className="size-5 text-status-success" aria-hidden />
        Added {cardsWord(result.added)}
      </p>
      <ul className="flex flex-col gap-1 text-sm text-text-soft">
        {result.decks.length > 0 && (
          <li>{`Into ${result.decks.map((deck) => `${deck.name} (${numberLabel(deck.notes)})`).join(', ')}.`}</li>
        )}
        <li>
          {result.status === 'active'
            ? 'They are ready to study.'
            : 'They are drafts: look them over in Recall and accept the ones you want.'}
        </li>
        {result.skippedDuplicates > 0 && (
          <li>Skipped {numberLabel(result.skippedDuplicates)} you already had.</li>
        )}
        {result.reviewsReplayed > 0 && (
          <li>Kept {countOf(result.reviewsReplayed, 'past answer')}.</li>
        )}
        {(result.notices ?? []).map((notice) => (
          <li key={notice} className="flex items-start gap-1.5 text-text-faint">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
            {notice}
          </li>
        ))}
        {result.warnings.map((warning) => (
          <li key={warning} className="text-status-warning">
            {warning}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="mono" onClick={onOpen}>
          Open in Recall
        </Button>
        {onStudy && (
          <Button variant="secondary" onClick={onStudy}>
            Study now
          </Button>
        )}
      </div>
    </section>
  )
}
