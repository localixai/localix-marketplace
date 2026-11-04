import { ArrowRight, CircleCheck, Info, Layers, TriangleAlert } from 'lucide-react'
import { Chip } from '@localixai/kit/chip'
import { SectionHeading } from '@localixai/kit/section-heading'
import type { ImportFilePreview } from '../../shared/payloads-more'
import { Md } from '../Md'
import { numberLabel } from '../format'
import { summaryOf, titleOf } from './ankiText'

const MAX_DECKS = 8

/** What is inside the file: its name and size, a few notes, where they go, what is already here. */
export function AnkiPreview({ preview }: { preview: ImportFilePreview }) {
  const everything = preview.notes > 0 && preview.duplicates >= preview.notes
  return (
    <>
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-soft bg-surface-sunken text-text-soft">
          <Layers className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{titleOf(preview)}</h1>
          <p aria-label="About this file" className="mt-0.5 text-xs text-text-faint">
            {summaryOf(preview)}
          </p>
        </div>
      </header>

      {preview.sample.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeading as="h2" level="section" title="A look inside" />
          <ul aria-label="A look inside" className="grid gap-2 @xl:grid-cols-2">
            {preview.sample.map((note, index) => (
              <li
                key={index}
                className="flex items-center gap-3 rounded-lg border border-border-soft px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <Md>{note.front}</Md>
                </div>
                <ArrowRight className="size-3.5 shrink-0 text-text-faint" aria-hidden />
                <div className="min-w-0 flex-1 text-text-soft">
                  <Md className="text-text-soft">{note.back}</Md>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {preview.decks.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeading as="h2" level="section" title="Decks" />
          <ul
            aria-label="Decks the cards go to"
            className="divide-y divide-border-faint rounded-lg border border-border-soft text-sm"
          >
            {preview.decks.slice(0, MAX_DECKS).map((deck) => (
              <li key={deck.name} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{deck.name}</span>
                <span className="text-xs tabular-nums text-text-soft">
                  {numberLabel(deck.notes)}
                </span>
                <Chip tone={deck.exists ? 'neutral' : 'info'}>
                  {deck.exists ? 'already in Recall' : 'new'}
                </Chip>
              </li>
            ))}
            {preview.decks.length > MAX_DECKS && (
              <li className="px-3 py-2 text-xs text-text-faint">
                …and {preview.decks.length - MAX_DECKS} more decks
              </li>
            )}
          </ul>
        </section>
      )}

      {everything ? (
        <p role="status" className="flex items-center gap-2 text-sm">
          <CircleCheck className="size-4 text-status-success" aria-hidden />
          Everything here is already in Recall.
        </p>
      ) : (
        preview.duplicates > 0 && (
          <p className="text-sm text-text-soft">
            {numberLabel(preview.duplicates)} of these are already in your cards.
          </p>
        )
      )}

      {(preview.notices ?? []).length > 0 && (
        <ul
          aria-label="Notes about the file"
          className="flex flex-col gap-1 text-xs text-text-faint"
        >
          {(preview.notices ?? []).map((notice) => (
            <li key={notice} className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
              {notice}
            </li>
          ))}
        </ul>
      )}

      {preview.warnings.length > 0 && (
        <ul
          className="flex flex-col gap-1 rounded-md bg-status-warning/12 px-3 py-2 text-xs"
          aria-label="Warnings"
        >
          {preview.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 size-3 shrink-0 text-status-warning" aria-hidden />
              {warning}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
