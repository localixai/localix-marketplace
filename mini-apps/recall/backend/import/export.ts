import type { RecallExport } from '../../shared/model'
import { withoutSounds } from '../../shared/sound'
import { toCsv } from './csv'
import { notesOfExport } from './json'
import { writeMarkdownCards } from './markdown'

/** The collection as text: the full JSON backup, a CSV of the cards, or Recall Markdown. */
export function exportCollection(data: RecallExport, format: 'json' | 'csv' | 'markdown'): string {
  if (format === 'json') return `${JSON.stringify(data, null, 2)}\n`
  // Text formats carry no media, so a sound link is left out rather than shown as the word "audio".
  const notes = notesOfExport({ ...data, reviews: [] }).map((note) => ({
    ...note,
    front: withoutSounds(note.front),
    back: withoutSounds(note.back),
    extra: withoutSounds(note.extra),
  }))
  if (format === 'markdown') return writeMarkdownCards(notes)
  return toCsv([
    ['front', 'back', 'extra', 'tags', 'deck', 'kind'],
    ...notes.map((note) => [note.front, note.back, note.extra, note.tags.join(' '), note.deck ?? '', note.kind]),
  ])
}
