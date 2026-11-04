import { Button } from '@localixai/kit/button'
import { RATING_NAMES, type Rating, type Settings } from '../../shared/model'
import type { StudyCard } from '../../shared/payloads'

/** Buttons for the answers the settings ask for: each says what it is and when the card returns. */
export const ratingsFor = (buttons: Settings['buttons']): readonly Rating[] =>
  buttons === 'four' ? [1, 2, 3, 4] : [1, 3]

/** The key that answers with a rating: its place in the row (1, 2, 3, 4). */
export const keyFor = (buttons: Settings['buttons'], rating: Rating): string =>
  String(ratingsFor(buttons).indexOf(rating) + 1)

/** One quiet line for every study action: the same height and weight for the answer and the grades. */
export const ACTION_CLASS = 'recall-action h-10 gap-2'

export function GradeBar({
  card,
  buttons,
  suggested,
  busy,
  onGrade,
}: {
  card: StudyCard
  buttons: Settings['buttons']
  /** The rating a typed check proposed; the person still confirms it. */
  suggested: Rating | null
  busy: boolean
  onGrade: (rating: Rating) => void
}) {
  // Good is the default answer, so it is the one with a stronger outline; a typed check moves it.
  const main = (rating: Rating) => suggested === rating || (suggested === null && rating === 3)
  return (
    <div
      role="group"
      aria-label="How well did you remember?"
      className="flex w-full gap-2 @md:max-w-md"
    >
      {ratingsFor(buttons).map((rating) => (
        <Button
          key={rating}
          size="xl"
          variant={rating === 1 ? 'ghost' : 'secondary'}
          disabled={busy}
          className={`${ACTION_CLASS} recall-grade min-w-0 flex-1`}
          data-main={main(rating) ? 'true' : undefined}
          data-suggested={suggested === rating}
          aria-label={`${RATING_NAMES[rating]}, back in ${card.outcomes[String(rating) as '1'].label}`}
          onClick={() => onGrade(rating)}
        >
          <span>{RATING_NAMES[rating]}</span>
          <span className="recall-grade-when text-xs font-normal tabular-nums">
            {card.outcomes[String(rating) as '1'].label}
          </span>
        </Button>
      ))}
    </div>
  )
}
