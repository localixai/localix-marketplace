import { cardFaces, noteProblem } from '../../shared/cloze'
import {
  INBOX,
  noteInputSchema,
  normalizeTags,
  type Note,
  type NoteInput,
  type NoteKind,
} from '../../shared/model'
import { fieldErrors } from '../format'

/** The editor's fields as the person sees them: a deck is an id or `'inbox'`, tags are one line. */
export interface FormState {
  kind: NoteKind
  front: string
  back: string
  extra: string
  deck: string
  tags: string
}

export type FormErrors = Partial<Record<'front' | 'back' | 'extra' | 'tags', string>>

export const EMPTY_FORM: FormState = { kind: 'basic', front: '', back: '', extra: '', deck: INBOX, tags: '' }

export const formOf = (note: Note): FormState => ({
  kind: note.kind,
  front: note.front,
  back: note.back,
  extra: note.extra,
  deck: note.deckId ?? INBOX,
  tags: note.tags.join(' '),
})

export const sameForm = (a: FormState, b: FormState): boolean =>
  a.kind === b.kind &&
  a.front === b.front &&
  a.back === b.back &&
  a.extra === b.extra &&
  a.deck === b.deck &&
  normalizeTags([a.tags]).join(' ') === normalizeTags([b.tags]).join(' ')

export const KIND_LABELS: Record<NoteKind, string> = {
  basic: 'Basic',
  reversed: 'Two-way',
  cloze: 'Cloze',
  typed: 'Typed answer',
}
export const KIND_HELP: Record<NoteKind, string> = {
  basic: 'A question and its answer.',
  reversed: 'Asked both ways: front to back and back to front.',
  cloze: 'Hide words in a sentence with {{c1::answer}}; each number is a card.',
  typed: 'You type the answer and Recall checks it.',
}

/** The shared rules, applied to the form: what to send, or a sentence for each field that fails. */
export function validate(
  form: FormState,
): { ok: true; input: NoteInput } | { ok: false; errors: FormErrors } {
  const input = {
    kind: form.kind,
    front: form.front,
    back: form.back,
    extra: form.extra,
    deckId: form.deck === INBOX ? null : form.deck,
    tags: normalizeTags([form.tags]),
  }
  const parsed = noteInputSchema.safeParse(input)
  const errors: FormErrors = parsed.success ? {} : fieldErrors(parsed.error.issues)
  const problem = noteProblem(form.kind, form.front, form.back)
  if (problem) {
    const field = problem.startsWith('Write the back') ? 'back' : 'front'
    errors[field] ??= problem
  }
  return Object.keys(errors).length || !parsed.success
    ? { ok: false, errors }
    : { ok: true, input: parsed.data }
}

/** What the editor previews: the first card of the note, as it would be asked and answered. */
export function previewOf(form: FormState) {
  const variant = form.kind === 'cloze' ? 'c1' : 'forward'
  return cardFaces(form, variant)
}
