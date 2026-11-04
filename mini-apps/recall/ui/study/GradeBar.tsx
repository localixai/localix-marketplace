import { Button } from '@localixai/kit/button'
import { Kbd } from '@localixai/kit/kbd'
import { RATING_NAMES, type Rating, type Settings } from '../../shared/model'
import type { StudyCard } from '../../shared/payloads'

/** Buttons for the answers the settings ask for: each says what it is and when the card returns. */
export const ratingsFor = (buttons: Settings['buttons']): readonly Rating[] =>
  buttons === 'four' ? [1, 2, 3, 4] : [1, 3]

/** The key that answers with a rating: its place in the row (1, 2, 3, 4). */
export const keyFor = (buttons: Settings['buttons'], rating: Rating): string =>
  String(ratingsFor(buttons).indexOf(rating) + 1)

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
  const main = (rating: Rating) => suggested === rating || (suggested === null && rating === 3)
  return (
    <div role="group" aria-label="How well did you remember?" className="grid w-full grid-flow-col auto-cols-fr gap-2 @md:max-w-xl">
      {ratingsFor(buttons).map((rating) => (
        <Button
          key={rating}
          size="xl"
          variant={main(rating) ? 'mono' : rating === 1 ? 'field' : 'secondary'}
          recommended={suggested === rating}
          disabled={busy}
          className="recall-grade h-auto flex-col gap-0.5 py-2"
          data-suggested={suggested === rating}
          aria-label={`${RATING_NAMES[rating]}, back in ${card.outcomes[String(rating) as '1'].label}`}
          onClick={() => onGrade(rating)}
        >
          <span className="font-medium">{RATING_NAMES[rating]}</span>
          <span className="text-2xs font-normal tabular-nums opacity-75">
            {card.outcomes[String(rating) as '1'].label}
          </span>
          <Kbd className="hidden @2xl:inline-flex">{keyFor(buttons, rating)}</Kbd>
        </Button>
      ))}
    </div>
  )
}
