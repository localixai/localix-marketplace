import type { AnkiNote, NoteType } from './apkg-schema'
import { answerPart, clozeFieldOf, renderCard, wordsOf } from './anki-template'
import { hasCloze } from './common'
import type { ImportedNote } from './types'

/**
 * From an Anki note and the cards its note type makes to Recall's notes. A note type with templates
 * is read the way the cards look: every side is rendered, and the shape of the templates decides
 * what a note is (one template: basic or typed; mirror templates: one two-way note; a cloze type:
 * the field its template shows; anything else: each Anki card its own basic note). A note type
 * without templates (an old or minimal package) falls back to its first fields.
 */

/** One card of a note, rendered: the question, the whole answer and what the answer adds. */
export interface Side {
  question: string
  answer: string
  added: string
  /** Fields the card asks to be typed. */
  typed: string[]
}

export interface Mapped {
  note: Pick<ImportedNote, 'kind' | 'front' | 'back' | 'extra'>
  /** The one Anki card this note stands for, when each card is its own note. */
  ord?: number
  /** The progress variant an Anki card of this ordinal feeds, `null` for a card that feeds none. */
  variant: (ord: number) => string | null
}

export type Plan =
  | { shape: 'fields' }
  | { shape: 'cloze' }
  | { shape: 'single' }
  | { shape: 'mirror' }
  | { shape: 'cards' }

export const hasTemplates = (type: NoteType | undefined): type is NoteType =>
  !!type && type.templates.some((template) => template.question.trim())

/** Renders every template of a note's type for it. */
export function renderSides(
  type: NoteType,
  note: AnkiNote,
  special: { Deck: string; Tags: string },
): Side[] {
  const fields: Record<string, string> = {}
  type.fields.forEach((name, index) => (fields[name] = note.fields[index] ?? ''))
  return type.templates.map((template) => {
    const options = { special: { ...special, Card: template.name } }
    const question = renderCard(template.question, fields, options)
    const answer = renderCard(template.answer, fields, { ...options, frontSide: question.html })
    return {
      question: question.html,
      answer: answer.html,
      added: answerPart(question.html, answer.html),
      typed: [...new Set([...question.typed, ...answer.typed])],
    }
  })
}

/** The sound files a rendered note names, by the name its text gives. */
export function soundNames(html: string): string[] {
  const names = [...html.matchAll(/\[sound:([^\]]*)\]/g)].map((match) => match[1]!)
  for (const match of html.matchAll(
    /<audio\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  )) {
    names.push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  return names.map((name) => name.trim()).filter(Boolean)
}

/** How a note type's notes become Recall's, decided once from all the notes that use it. */
export function planType(type: NoteType | undefined, sides: Side[][]): Plan {
  if (!hasTemplates(type)) return { shape: 'fields' }
  if (type.cloze) return { shape: 'cloze' }
  if (type.templates.length === 1) return { shape: 'single' }
  if (type.templates.length === 2 && mirrors(sides)) return { shape: 'mirror' }
  return { shape: 'cards' }
}

/** Whether, for most notes that have both cards, each question's words appear in the other's answer. */
function mirrors(notes: Side[][]): boolean {
  let both = 0
  let mirrored = 0
  for (const [first, second] of notes) {
    const asked = [wordsOf(first?.question ?? ''), wordsOf(second?.question ?? '')] as const
    if (!asked[0] || !asked[1]) continue
    both++
    if (wordsOf(second!.answer).includes(asked[0]) && wordsOf(first!.answer).includes(asked[1]))
      mirrored++
  }
  return both > 0 && mirrored * 2 > both
}

const plain = (line: string) => line.replace(/\\(.)/g, '$1').replace(/\s+/g, ' ').trim()
/** A line that is only a leftover of the template: a stray dot, a rule, a dash. */
const LEFTOVER = /^(?:[.\-–—·•:;,]+|\*{3,}|_{3,}|-{3,})$/

/** Markdown without stray punctuation lines, rules at its edges and runs of blank lines. */
export function tidy(markdown: string): string {
  return markdown
    .split('\n')
    .filter((line) => !LEFTOVER.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The lines of `answers` that none of `known` (and no earlier answer) already shows. */
export function added(known: string[], answers: string[]): string {
  const seen = new Set(known.flatMap((text) => text.split('\n').map(plain)).filter(Boolean))
  const out: string[] = []
  for (const line of answers.flatMap((text) => tidy(text).split('\n'))) {
    const key = plain(line)
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    out.push(line)
  }
  return tidy(out.join('\n'))
}

/** The legacy shape: an old or minimal package, read from its first fields. */
function fromFields(
  type: NoteType | undefined,
  note: AnkiNote,
  convert: (html: string) => string,
): Mapped {
  const field = (index: number) => convert(note.fields[index] ?? '')
  const forward = (ord: number) => (ord === 0 ? 'forward' : null)
  const two = type?.fields.length === 2
  const kind = type?.cloze
    ? 'cloze'
    : type?.templates.length === 2 && two
      ? 'reversed'
      : /type in the answer/i.test(type?.name ?? '') && two
        ? 'typed'
        : 'basic'
  if (kind === 'cloze') {
    const extra = type!.fields.length > 1 ? field(1) : ''
    return { note: { kind, front: field(0), back: '', extra }, variant: (ord) => `c${ord + 1}` }
  }
  const variant =
    kind === 'reversed'
      ? (ord: number) => (ord === 0 ? 'forward' : ord === 1 ? 'reverse' : null)
      : forward
  return { note: { kind, front: field(0), back: field(1), extra: '' }, variant }
}

/** Whether the fallback reads this type exactly (so it is no reason for a warning). */
export function exactFields(type: NoteType | undefined): boolean {
  if (!type) return false
  if (type.cloze) return true
  return type.fields.length === 2 && (type.templates.length === 1 || type.templates.length === 2)
}

/** The notes one Anki note becomes: none when it holds nothing to ask. */
export function mapNote(
  plan: Plan,
  type: NoteType | undefined,
  note: AnkiNote,
  sides: Side[],
  ords: number[],
  convert: (html: string) => string,
): Mapped[] {
  if (plan.shape === 'fields') return [fromFields(type, note, convert)]
  const raw = convert
  convert = (html) => tidy(raw(html))
  const first = sides[0]
  if (!type || !first) return []
  const valueOf = (name: string) => note.fields[type.fields.indexOf(name)] ?? ''
  if (plan.shape === 'cloze') {
    const field =
      clozeFieldOf(type.templates[0]!.question) ??
      clozeFieldOf(type.templates[0]!.answer) ??
      type.fields[0] ??
      ''
    const front = convert(valueOf(field))
    return [
      {
        note: { kind: 'cloze', front, back: '', extra: added([front], [convert(first.added)]) },
        variant: (ord) => `c${ord + 1}`,
      },
    ]
  }
  if (plan.shape === 'single')
    return [single(first, valueOf, convert, (ord) => (ord === 0 ? 'forward' : null))]
  if (plan.shape === 'mirror' && wordsOf(sides[1]?.question ?? '')) {
    const front = convert(first.question)
    const back = convert(sides[1]!.question)
    const extra = added([front, back], [convert(first.added), convert(sides[1]!.added)])
    return [
      {
        note: { kind: 'reversed', front, back, extra },
        variant: (ord) => (ord === 0 ? 'forward' : ord === 1 ? 'reverse' : null),
      },
    ]
  }
  if (plan.shape === 'mirror')
    return [single(first, valueOf, convert, (ord) => (ord === 0 ? 'forward' : null))]
  // Each Anki card its own basic note.
  return ords.flatMap((ord) => {
    const side = sides[ord]
    return side
      ? [{ ...single(side, valueOf, convert, (at) => (at === ord ? 'forward' : null)), ord }]
      : []
  })
}

function single(
  side: Side,
  valueOf: (name: string) => string,
  convert: (html: string) => string,
  variant: Mapped['variant'],
): Mapped {
  const typed = side.typed.length > 0
  const asked = convert(side.added)
  // A typed card renders nothing where the answer is typed; the expected answer is that field.
  const back = typed && !asked ? convert(valueOf(side.typed[0]!)) : asked
  return {
    note: { kind: typed ? 'typed' : 'basic', front: convert(side.question), back, extra: '' },
    variant,
  }
}

/** A note is worth keeping when it has a front and, unless cloze, a back. */
export function usable(mapped: Mapped): boolean {
  const { kind, front, back } = mapped.note
  return !!front && (kind === 'cloze' ? hasCloze(front) : !!back)
}
