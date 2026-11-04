import { ImportError, MAX_FILE_BYTES, decodeText, extensionOf, megabytes, sourceName } from './common'
import { parseApkg } from './apkg'
import { parseDelimitedNotes } from './csv'
import { parseJsonBackup } from './json'
import { parseMarkdownCards } from './markdown'
import type { ImportBatch } from './types'
import { isZip } from './zip'

export type { ImportBatch, ImportedNote, ImportedReview } from './types'
export { exportCollection } from './export'
export { ImportError } from './common'

const NO_MEDIA = { pictures: 0, sounds: 0 }

/**
 * Reads a file into a batch for the store. The format comes from the name's extension, and from the
 * bytes when the name does not say (a zip is an Anki package, `{` starts JSON). Pictures and sounds
 * are written to `mediaDir`, and nothing else is; in `preview` mode they are only counted and
 * nothing is written at all. Throws `ImportError` with a message for the person.
 */
export async function parseImport(input: {
  name: string
  bytes: Uint8Array
  mediaDir: string
  mode?: 'commit' | 'preview'
}): Promise<ImportBatch> {
  const name = sourceName(input.name)
  const { bytes } = input
  if (!bytes.length) throw new ImportError('The file is empty.')
  const extension = extensionOf(name)
  if (isZip(bytes) || extension === 'apkg' || extension === 'colpkg') {
    if (!isZip(bytes)) throw new ImportError('This is not an Anki package (it is not a zip file).')
    return parseApkg(name, bytes, input.mediaDir, input.mode === 'preview')
  }
  if (bytes.length > MAX_FILE_BYTES) {
    throw new ImportError(`The file is ${megabytes(bytes.length)}; files up to ${megabytes(MAX_FILE_BYTES)} can be imported.`)
  }
  const warnings: string[] = []
  const first = bytes.find((byte) => byte > 0x20)
  if (extension === 'json' || (!['csv', 'tsv', 'txt', 'md', 'markdown'].includes(extension) && first === 0x7b)) {
    return parseJsonBackup(name, bytes)
  }
  const text = decodeText(bytes, warnings)
  if (extension === 'md' || extension === 'markdown' || (extension === 'txt' && /^[QC]:/im.test(text))) {
    const parsed = parseMarkdownCards(text)
    return {
      source: name,
      format: 'markdown',
      decks: parsed.decks.map((deck) => ({ name: deck, description: '' })),
      notes: parsed.notes,
      media: [],
      mediaCounts: NO_MEDIA,
      notices: [],
      warnings: [...warnings, ...parsed.warnings],
    }
  }
  if (['csv', 'tsv', 'txt', ''].includes(extension)) {
    const parsed = parseDelimitedNotes(text, { preferTab: extension === 'tsv' })
    const decks = [...new Set(parsed.notes.flatMap((note) => (note.deck ? [note.deck] : [])))]
    return {
      source: name,
      format: 'csv',
      decks: decks.map((deck) => ({ name: deck, description: '' })),
      notes: parsed.notes,
      media: [],
      mediaCounts: NO_MEDIA,
      notices: [],
      warnings: [...warnings, ...parsed.warnings],
    }
  }
  throw new ImportError(`".${extension}" files cannot be imported. Use an Anki package, CSV, TSV, Markdown or a Recall backup.`)
}
