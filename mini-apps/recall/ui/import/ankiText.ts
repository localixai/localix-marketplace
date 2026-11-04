import { countOf } from '../../shared/format'
import type { ImportFilePreview, ImportOptions } from '../../shared/payloads-more'
import { bytesLabel, numberLabel } from '../format'

/** The words of the Anki file tab, in one place so the tab, its tests and the agent's text agree. */

/** One deck: its name. More than one (or none): the file's own name. */
export const titleOf = (preview: ImportFilePreview): string =>
  preview.decks.length === 1 ? preview.decks[0]!.name : preview.source

/** "Anki deck · 2,524 notes · 5,048 cards · with sound · 103 MB", plus "with review history". */
export function summaryOf(preview: ImportFilePreview): string {
  return [
    'Anki deck',
    // Recall calls a note a card everywhere, so the header counts the way the rest of the screen does.
    cardsWord(preview.notes),
    ...(preview.sounds > 0 ? ['with sound'] : []),
    bytesLabel(preview.bytes),
    ...(preview.withProgress > 0 ? ['with review history'] : []),
  ].join(' · ')
}

/** How many cards the button will import with these choices. */
export function importCount(preview: ImportFilePreview, skipDuplicates: boolean): number {
  return skipDuplicates ? Math.max(0, preview.notes - preview.duplicates) : preview.notes
}

export const cardsWord = (count: number): string =>
  `${numberLabel(count)} ${count === 1 ? 'card' : 'cards'}`

/** What the agent is told while the file is open. */
export function agentTextFor(path: string, preview: ImportFilePreview): string {
  const parts = [
    cardsWord(preview.notes),
    ...(preview.sounds > 0 ? [`with sound (${countOf(preview.sounds, 'sound')})`] : []),
    bytesLabel(preview.bytes),
    ...(preview.withProgress > 0 ? ['with review history'] : []),
  ]
  const existing =
    preview.duplicates > 0 ? ` ${countOf(preview.duplicates, 'card')} are already in Recall.` : ''
  return `An Anki deck is open: ${titleOf(preview)}, ${parts.join(', ')}.${existing} File: ${path}. Nothing is imported until the person chooses on the tab; to import it from the chat use recall_import_file with this path (dryRun first).`
}

/** Which of three failures a message is, so the tab can say it in a title. */
export function failureTitle(message: string): string {
  if (/larger than|too large|too big|expands to more than/i.test(message))
    return 'This file is too big'
  if (
    /not an Anki|holds no collection|not a zip|not readable|not a readable|does not hold a readable|cannot be imported/i.test(
      message,
    )
  ) {
    return 'This is not an Anki file'
  }
  return 'The file could not be read'
}

/** The request the options make. */
export function commitBody(
  path: string,
  preview: ImportFilePreview,
  choice: {
    deck: string
    status: 'draft' | 'active'
    keepProgress: boolean
    skipDuplicates: boolean
  },
  fileDecks: string,
): { path: string } & ImportOptions {
  return {
    path,
    deckId: choice.deck === fileDecks ? undefined : choice.deck,
    status: choice.status,
    keepProgress: preview.withProgress > 0 ? choice.keepProgress : undefined,
    skipDuplicates: preview.duplicates > 0 ? choice.skipDuplicates : undefined,
  }
}
