import { Chip } from '@localixai/kit/chip'
import { Input } from '@localixai/kit/input'
import { clozeParts } from '../../shared/cloze'
import type { CheckAnswerResult, StudyCard } from '../../shared/payloads'
import { Md } from '../Md'

const VERDICT: Record<CheckAnswerResult['verdict'], { label: string; tone: 'success' | 'warning' | 'error' | 'neutral' }> = {
  correct: { label: 'Correct', tone: 'success' },
  partly: { label: 'Partly right', tone: 'warning' },
  wrong: { label: 'Not quite', tone: 'error' },
  unsure: { label: 'Not sure — you decide', tone: 'neutral' },
}

/** Markdown that a flowing inline render would break (code, lists, images, emphasis, lines). */
const needsMarkdown = (text: string): boolean => /[\n`*_]|!\[|\]\(/.test(text)

/** A cloze text with its blanks drawn as blanks, or filled once revealed. */
function Cloze({ card, revealed }: { card: StudyCard; revealed: boolean }) {
  const front = card.note.front
  if (card.cloze === null || needsMarkdown(front)) {
    return <Md>{revealed ? card.answer : card.prompt}</Md>
  }
  return (
    <p className="recall-cloze" aria-label={revealed ? 'Cloze, answered' : 'Cloze with blanks'}>
      {clozeParts(front, card.cloze, revealed).map((part, index) =>
        part.type === 'text' ? (
          <span key={index}>{part.text}</span>
        ) : part.type === 'blank' ? (
          <span key={index} className="recall-blank" role="img" aria-label={part.hint ? `blank, hint: ${part.hint}` : 'blank'}>
            {part.hint ?? '…'}
          </span>
        ) : (
          <span key={index} className="recall-filled">
            {part.text}
          </span>
        ),
      )}
    </p>
  )
}

/**
 * The card on the table: its question, a field for a typed answer, and, once turned over, the
 * answer, how a typed answer was judged and the extra note. Markdown is the host's renderer.
 */
export function CardFace({
  card,
  revealed,
  typed,
  check,
  onTyped,
  onSubmit,
}: {
  card: StudyCard
  revealed: boolean
  typed: string
  check: CheckAnswerResult | null
  onTyped: (value: string) => void
  onSubmit: () => void
}) {
  const isCloze = card.cloze !== null
  const verdict = check ? VERDICT[check.verdict] : null
  return (
    <>
      {isCloze ? <Cloze card={card} revealed={revealed} /> : <Md>{card.prompt}</Md>}
      {card.typed && !revealed && (
        <Input
          autoFocus
          size="lg"
          aria-label="Your answer"
          placeholder="Type your answer, then press Enter"
          value={typed}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            onSubmit()
          }}
        />
      )}
      {revealed && (
        <div className="recall-turn flex flex-col gap-3" aria-label="Answer">
          <hr className="recall-rule" />
          {!isCloze && <Md>{card.answer}</Md>}
          {card.typed && (
            <div className="flex flex-col gap-1.5 text-xs text-text-soft">
              {typed.trim() && (
                <p>
                  You wrote: <span className="text-foreground">{typed}</span>
                </p>
              )}
              {isCloze || <p className="sr-only">Expected: {card.expected}</p>}
              {verdict && (
                <div role="status" className="flex items-center gap-2">
                  <Chip tone={verdict.tone}>{verdict.label}</Chip>
                  {check?.by === 'model' && <span className="text-text-faint">checked by AI</span>}
                </div>
              )}
            </div>
          )}
          {card.extra.trim() && (
            <div className="rounded-md bg-surface-sunken px-3 py-2">
              <Md className="text-text-soft">{card.extra}</Md>
            </div>
          )}
        </div>
      )}
    </>
  )
}
