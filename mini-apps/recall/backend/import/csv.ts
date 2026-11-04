import { hasCloze, normalizeDeckName, normalizeNewlines, normalizeTags, plural } from './common'
import { htmlToMarkdown, looksLikeHtml } from './html-to-md'
import type { ImportedNote } from './types'

/**
 * CSV and TSV: one card per row — front, back, then optional tags and deck, or the columns a header
 * row names. The delimiter is sniffed; quoted fields may hold delimiters, quotes and newlines.
 * Anki's own text export (`#separator:tab`, `#html:true`, `#tags column:3` …) is understood.
 */

export interface DelimitedText {
  notes: ImportedNote[]
  warnings: string[]
}

type Column = 'front' | 'back' | 'extra' | 'tags' | 'deck' | 'kind' | 'skip'

const HEADER_NAMES: Record<string, Column> = {
  front: 'front',
  question: 'front',
  term: 'front',
  back: 'back',
  answer: 'back',
  definition: 'back',
  extra: 'extra',
  tags: 'tags',
  tag: 'tags',
  deck: 'deck',
  kind: 'kind',
  type: 'kind',
}

const SEPARATORS: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  space: ' ',
  colon: ':',
}

const KINDS = new Set<ImportedNote['kind']>(['basic', 'reversed', 'cloze', 'typed'])

/** Records of a delimited text; `unterminated` when the last quote never closed. */
export function parseDelimited(text: string, delimiter: string): { rows: string[][]; unterminated: boolean } {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let fieldStart = true
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (quoted) {
      if (char !== '"') field += char
      else if (text[index + 1] === '"') {
        field += '"'
        index++
      } else quoted = false
      continue
    }
    if (char === '"' && fieldStart) {
      quoted = true
      fieldStart = false
    } else if (char === delimiter) {
      row.push(field)
      field = ''
      fieldStart = true
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      fieldStart = true
    } else {
      field += char
      fieldStart = false
    }
  }
  if (field || row.length || quoted) {
    row.push(field)
    rows.push(row)
  }
  return { rows, unterminated: quoted }
}

/** The delimiter the first lines use most consistently: tab, comma, semicolon or pipe. */
export function sniffDelimiter(text: string, preferTab = false): string {
  const sample = text.slice(0, 64 * 1024)
  let best = { delimiter: preferTab ? '\t' : ',', score: 0 }
  for (const delimiter of ['\t', ',', ';', '|']) {
    const { rows } = parseDelimited(sample, delimiter)
    const counts = rows.slice(0, 50).filter((row) => row.some((cell) => cell.trim())).map((row) => row.length - 1)
    const used = counts.filter((count) => count > 0)
    if (!used.length) continue
    const frequency = new Map<number, number>()
    for (const count of used) frequency.set(count, (frequency.get(count) ?? 0) + 1)
    const [, consistent] = [...frequency].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!
    const score = consistent / counts.length + (delimiter === '\t' && preferTab ? 0.5 : 0)
    if (score > best.score) best = { delimiter, score }
  }
  return best.delimiter
}

interface AnkiHeader {
  separator?: string
  html?: boolean
  columns: Map<number, Column>
}

/** Anki's `#key:value` lines at the top of a text export. */
function readAnkiHeader(lines: string[]): { header: AnkiHeader; skip: number } {
  const header: AnkiHeader = { columns: new Map() }
  let skip = 0
  for (const line of lines) {
    const match = /^#([a-z ]+):(.*)$/i.exec(line)
    if (!match) break
    skip++
    const key = match[1]!.trim().toLowerCase()
    const value = match[2]!.trim()
    if (key === 'separator') header.separator = SEPARATORS[value.toLowerCase()] ?? value.slice(0, 1)
    else if (key === 'html') header.html = value.toLowerCase() === 'true'
    else {
      const column = /^(tags|deck|notetype|guid) column$/.exec(key)?.[1]
      const index = Number.parseInt(value, 10)
      if (column && index > 0) header.columns.set(index - 1, column === 'tags' || column === 'deck' ? column : 'skip')
    }
  }
  return { header, skip }
}

function headerColumns(row: string[]): Column[] | null {
  const names = row.map((cell) => HEADER_NAMES[cell.trim().toLowerCase()])
  const known = names.filter(Boolean)
  const hasFront = names.includes('front')
  if (!hasFront || known.length < 2) return null
  return names.map((name) => name ?? 'skip')
}

function positional(width: number, anki: Map<number, Column>): Column[] {
  if (anki.size) {
    const fields: Column[] = ['front', 'back']
    let next = 0
    return Array.from({ length: width }, (_, index) => anki.get(index) ?? fields[next++] ?? 'extra')
  }
  return Array.from({ length: width }, (_, index) => (['front', 'back', 'tags', 'deck'] as Column[])[index] ?? 'skip')
}

export function parseDelimitedNotes(rawText: string, options: { preferTab?: boolean }): DelimitedText {
  const warnings: string[] = []
  const text = normalizeNewlines(rawText.replace(/^﻿/, ''))
  const { header, skip } = readAnkiHeader(text.split('\n', 20))
  const body = text.split('\n').slice(skip).join('\n')
  const delimiter = header.separator ?? sniffDelimiter(body, options.preferTab)
  const { rows, unterminated } = parseDelimited(body, delimiter)
  if (unterminated) warnings.push('The last quoted field never closed; it was read to the end of the file.')

  const first = rows.findIndex((row) => row.some((cell) => cell.trim()))
  const named = first >= 0 && !header.columns.size ? headerColumns(rows[first]!) : null
  const counts = { empty: 0, noFront: 0, noBack: 0, sounds: 0, images: 0 }
  const notes: ImportedNote[] = []
  const toMarkdown = (cell: string) => {
    const value = cell.trim()
    if (header.html === false || (header.html !== true && !looksLikeHtml(value))) return value
    const result = htmlToMarkdown(value, { image: (src) => (/^https?:\/\//i.test(src) ? src : null) })
    counts.sounds += result.sounds + result.videos
    counts.images += result.images
    return result.markdown
  }

  rows.forEach((row, index) => {
    if (named && index === first) return
    if (!row.some((cell) => cell.trim())) {
      counts.empty++
      return
    }
    const columns = named ?? positional(row.length, header.columns)
    const cells: Partial<Record<Column, string[]>> = {}
    row.forEach((cell, column) => {
      const role = columns[column] ?? 'skip'
      if (role !== 'skip') (cells[role] ??= []).push(cell)
    })
    const front = toMarkdown(cells.front?.[0] ?? '')
    const back = toMarkdown(cells.back?.[0] ?? '')
    const extra = (cells.extra ?? []).map(toMarkdown).filter(Boolean).join('\n\n')
    const requested = cells.kind?.[0]?.trim().toLowerCase() as ImportedNote['kind'] | undefined
    const cloze = hasCloze(front)
    // Cloze marks decide a cloze card; otherwise the kind column may ask for reversed or typed.
    const kind = cloze ? 'cloze' : requested && requested !== 'cloze' && KINDS.has(requested) ? requested : 'basic'
    if (!front) {
      counts.noFront++
      return
    }
    if (!back && kind !== 'cloze') {
      counts.noBack++
      return
    }
    const deck = normalizeDeckName(cells.deck?.[0] ?? '')
    notes.push({
      kind,
      front,
      back,
      extra,
      tags: normalizeTags(cells.tags ?? []),
      ...(deck ? { deck } : {}),
    })
  })

  if (counts.empty) warnings.push(`${plural(counts.empty, 'empty row')} skipped.`)
  if (counts.noFront) warnings.push(`${plural(counts.noFront, 'row')} without a front skipped.`)
  if (counts.noBack) warnings.push(`${plural(counts.noBack, 'row')} without a back skipped.`)
  if (counts.sounds) warnings.push(`${plural(counts.sounds, 'sound')} dropped.`)
  if (counts.images) warnings.push(`${plural(counts.images, 'image')} not in the file dropped.`)
  return { notes, warnings }
}

/** Rows to CSV: every field that needs it quoted, quotes doubled. */
export function toCsv(rows: string[][]): string {
  const quote = (value: string) => (/[",\n\r]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  return `${rows.map((row) => row.map(quote).join(',')).join('\n')}\n`
}
