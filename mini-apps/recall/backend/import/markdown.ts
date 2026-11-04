import { hasCloze, normalizeDeckName, normalizeNewlines, normalizeTags, plural } from './common'
import type { ImportedNote } from './types'

/**
 * Recall's Markdown card format, read and written:
 *
 * ```markdown
 * # Geography                       a deck for the cards below it
 *
 * Q: What is the capital of France? a card; its lines run to the next marker
 * A: Paris
 * E: On the Seine.                  extra, shown after the answer (optional)
 * kind: reversed                    reversed or typed (optional; basic otherwise)
 * tags: europe, capitals
 *
 * ---                               ends a card (a new Q: or C: does too)
 *
 * C: The {{c1::Seine}} runs through Paris.
 * ```
 *
 * A content line that would read as a marker is written with a leading backslash, and one leading
 * backslash is taken off when it is read back, so a written file reads back to the same cards.
 */

type Field = 'front' | 'back' | 'extra'

interface Draft {
  kind: ImportedNote['kind']
  deck: string
  field: Field
  lines: Record<Field, string[]>
  tags: string[]
}

const MARKER = /^([QACE]):[ \t]?(.*)$/i
const TAGS = /^tags:(.*)$/i
const KIND = /^kind:[ \t]*(basic|reversed|typed|cloze)[ \t]*$/i
const HEADING = /^#[ \t]+(\S.*)$/
const SEPARATOR = /^---[ \t]*$/
/** A content line that starts like a marker, with any number of escaping backslashes before it. */
const ESCAPED = /^\\*(?:[QACE]:|tags:|kind:|#[ \t]|---[ \t]*$)/i

export interface MarkdownCards {
  notes: ImportedNote[]
  decks: string[]
  warnings: string[]
}

export function parseMarkdownCards(rawText: string): MarkdownCards {
  const lines = normalizeNewlines(rawText.replace(/^﻿/, '')).split('\n')
  const notes: ImportedNote[] = []
  const decks: string[] = []
  const counts = { noAnswer: 0, noCloze: 0, stray: 0 }
  let deck = ''
  let draft: Draft | null = null

  const finish = () => {
    if (!draft) return
    const [front, back, extra] = (['front', 'back', 'extra'] as const).map((field) =>
      draft!.lines[field].join('\n').trim(),
    ) as [string, string, string]
    let kind = draft.kind
    if (kind !== 'cloze' && !back && hasCloze(front)) kind = 'cloze'
    if (!front || (kind !== 'cloze' && !back)) counts.noAnswer++
    else if (kind === 'cloze' && !hasCloze(front)) counts.noCloze++
    else notes.push({ kind, front, back, extra, tags: draft.tags, ...(draft.deck ? { deck: draft.deck } : {}) })
    draft = null
  }

  for (const line of lines) {
    if (SEPARATOR.test(line)) {
      finish()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      finish()
      deck = normalizeDeckName(heading[1]!)
      if (deck && !decks.includes(deck)) decks.push(deck)
      continue
    }
    const marker = MARKER.exec(line)
    if (marker) {
      const letter = marker[1]!.toUpperCase()
      if (letter === 'Q' || letter === 'C') {
        finish()
        draft = {
          kind: letter === 'C' ? 'cloze' : 'basic',
          deck,
          field: 'front',
          lines: { front: [marker[2]!], back: [], extra: [] },
          tags: [],
        }
        continue
      }
      if (draft) {
        draft.field = letter === 'A' ? 'back' : 'extra'
        draft.lines[draft.field].push(marker[2]!)
        continue
      }
    }
    const tags = TAGS.exec(line)
    if (tags && draft) {
      draft.tags = normalizeTags([...draft.tags, tags[1]!])
      continue
    }
    const kind = KIND.exec(line)
    if (kind && draft) {
      const value = kind[1]!.toLowerCase() as ImportedNote['kind']
      if (draft.kind !== 'cloze' && value !== 'cloze') draft.kind = value
      continue
    }
    if (draft) draft.lines[draft.field].push(ESCAPED.test(line) ? line.replace(/^\\/, '') : line)
    else if (line.trim()) counts.stray++
  }
  finish()

  const warnings: string[] = []
  if (counts.noAnswer) warnings.push(`${plural(counts.noAnswer, 'card')} without a question or an answer skipped.`)
  if (counts.noCloze) warnings.push(`${plural(counts.noCloze, 'cloze card')} without a {{c1::…}} mark skipped.`)
  if (counts.stray) warnings.push(`${plural(counts.stray, 'line')} outside any card ignored.`)
  return { notes, decks, warnings }
}

/** A field after its marker; the first line follows the marker, so only later lines need escaping. */
function block(marker: string, text: string): string[] {
  const [first = '', ...rest] = text.split('\n')
  return [`${marker} ${first}`.trimEnd(), ...rest.map((line) => (ESCAPED.test(line) ? `\\${line}` : line))]
}

/** Notes as Recall Markdown: notes without a deck first, then one heading per deck. */
export function writeMarkdownCards(notes: readonly ImportedNote[]): string {
  const byDeck = new Map<string, ImportedNote[]>([['', []]])
  for (const note of notes) {
    const deck = (note.deck ?? '').replace(/\s+/g, ' ').trim()
    const list = byDeck.get(deck)
    if (list) list.push(note)
    else byDeck.set(deck, [note])
  }
  const out: string[] = []
  for (const [deck, list] of byDeck) {
    if (!list.length) continue
    if (deck) out.push(`# ${deck}`, '')
    list.forEach((note, index) => {
      if (index) out.push('---', '')
      out.push(...block(note.kind === 'cloze' ? 'C:' : 'Q:', note.front))
      if (note.back) out.push(...block('A:', note.back))
      if (note.extra) out.push(...block('E:', note.extra))
      if (note.kind === 'reversed' || note.kind === 'typed') out.push(`kind: ${note.kind}`)
      if (note.tags.length) out.push(`tags: ${note.tags.join(', ')}`)
      out.push('')
    })
  }
  return `${out.join('\n').trimEnd()}\n`
}
