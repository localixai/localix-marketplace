import type { Note, NoteKind } from './model'

/**
 * Cloze marks and the faces of a card. A cloze note keeps its text in `front` with Anki's marks,
 * `{{c1::answer}}` or `{{c1::answer::hint}}`; each number is one card. These functions decide which
 * cards a note makes and what each one asks and answers, for the screen, the quiz and the agent.
 */

const CLOZE = /\{\{c(\d{1,3})::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g

export interface ClozeMark {
  n: number
  answer: string
  hint: string | null
  start: number
  end: number
}

/** Every cloze mark in the text, in order. */
export function parseCloze(text: string): ClozeMark[] {
  const marks: ClozeMark[] = []
  for (const match of text.matchAll(CLOZE)) {
    const n = Number(match[1])
    if (n < 1) continue
    marks.push({
      n,
      answer: match[2] ?? '',
      hint: match[3]?.trim() ? match[3].trim() : null,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    })
  }
  return marks
}

/** The cloze numbers in the text, ascending and unique. */
export function clozeNumbers(text: string): number[] {
  return [...new Set(parseCloze(text).map((mark) => mark.n))].sort((a, b) => a - b)
}

/** The cards a note makes: their variants, in a stable order. */
export function variantsFor(kind: NoteKind, front: string): string[] {
  if (kind === 'reversed') return ['forward', 'reverse']
  if (kind === 'cloze') return clozeNumbers(front).map((n) => `c${n}`)
  return ['forward']
}

/** Why a note cannot be saved as it is, or `null`. */
export function noteProblem(kind: NoteKind, front: string, back: string): string | null {
  if (!front.trim()) return 'Write the front.'
  if (kind === 'cloze') {
    return clozeNumbers(front).length
      ? null
      : 'A cloze card needs at least one {{c1::…}} mark in its text.'
  }
  if (!back.trim()) return 'Write the back.'
  return null
}

/** One piece of a cloze prompt: plain text, a blank to fill, or the revealed answer. */
export type ClozePart =
  | { type: 'text'; text: string }
  | { type: 'blank'; hint: string | null }
  | { type: 'answer'; text: string }

/**
 * The text of cloze card `n` as parts: its own marks become blanks (or revealed answers), the
 * other numbers show their answers.
 */
export function clozeParts(text: string, n: number, reveal: boolean): ClozePart[] {
  const parts: ClozePart[] = []
  let at = 0
  const push = (part: ClozePart) => {
    const last = parts.at(-1)
    if (part.type === 'text' && last?.type === 'text') last.text += part.text
    else parts.push(part)
  }
  for (const mark of parseCloze(text)) {
    if (mark.start > at) push({ type: 'text', text: text.slice(at, mark.start) })
    if (mark.n !== n) push({ type: 'text', text: mark.answer })
    else if (reveal) push({ type: 'answer', text: mark.answer })
    else push({ type: 'blank', hint: mark.hint })
    at = mark.end
  }
  if (at < text.length) push({ type: 'text', text: text.slice(at) })
  return parts
}

/** The parts as Markdown: a blank is `[…]` (or `[hint]`), a revealed answer is bold. */
export function clozeText(text: string, n: number, reveal: boolean): string {
  return clozeParts(text, n, reveal)
    .map((part) =>
      part.type === 'text'
        ? part.text
        : part.type === 'blank'
          ? `[${part.hint ?? '…'}]`
          : `**${part.text}**`,
    )
    .join('')
}

/** The answers of cloze card `n`, joined: what a typed answer is checked against. */
export function clozeAnswer(text: string, n: number): string {
  return parseCloze(text)
    .filter((mark) => mark.n === n)
    .map((mark) => mark.answer)
    .join(', ')
}

export interface CardFaces {
  /** What the card asks, Markdown. */
  prompt: string
  /** What it answers, Markdown (the prompt revealed, for a cloze). */
  answer: string
  /** The bare expected answer, for a typed check. */
  expected: string
  /** Shown after the answer. */
  extra: string
}

/** What a card of a note asks and answers. */
export function cardFaces(
  note: Pick<Note, 'kind' | 'front' | 'back' | 'extra'>,
  variant: string,
): CardFaces {
  const cloze = /^c(\d+)$/.exec(variant)
  if (note.kind === 'cloze' && cloze) {
    const n = Number(cloze[1])
    const extra = [note.back, note.extra].filter((part) => part.trim()).join('\n\n')
    return {
      prompt: clozeText(note.front, n, false),
      answer: clozeText(note.front, n, true),
      expected: clozeAnswer(note.front, n),
      extra,
    }
  }
  if (variant === 'reverse') {
    return { prompt: note.back, answer: note.front, expected: note.front, extra: note.extra }
  }
  return { prompt: note.front, answer: note.back, expected: note.back, extra: note.extra }
}

/** The note's text without cloze marks, for search, duplicates and the agent. */
export function plainFront(note: Pick<Note, 'kind' | 'front'>): string {
  return note.kind === 'cloze' ? note.front.replace(CLOZE, (_m, _n, answer) => answer) : note.front
}

/** Text compared for exact duplicates: lower-case, marks and punctuation gone, spaces collapsed. */
export function duplicateKey(note: Pick<Note, 'kind' | 'front'>): string {
  return plainFront(note)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
