/**
 * The seam between the parsers and the store, as DESIGN.md fixes it. Owned by the import module;
 * the service's `previewImport` / `commitImport` consume it.
 */
export interface ImportedReview {
  rating: 1 | 2 | 3 | 4
  reviewedAt: string
  durationMs?: number
}

export interface ImportedNote {
  kind: 'basic' | 'reversed' | 'cloze' | 'typed'
  /** Markdown. */
  front: string
  back: string
  extra: string
  /** Lower-case, no '#'. */
  tags: string[]
  /** Deck name; none → the chosen deck or the Inbox. */
  deck?: string
  /** Past reviews per card variant ('forward' | 'reverse' | 'c1'…), oldest first. */
  progress?: Record<string, ImportedReview[]>
  paused?: boolean
}

export interface ImportBatch {
  /** The file's name. */
  source: string
  format: 'apkg' | 'csv' | 'markdown' | 'json'
  decks: { name: string; description: string }[]
  notes: ImportedNote[]
  /** Media already written to `<dataDir>/media/<sha256>.<ext>`; notes reference `media/<file>`. */
  media: { original: string; file: string }[]
  /** "3 sounds dropped", "12 empty rows skipped". */
  warnings: string[]
}
