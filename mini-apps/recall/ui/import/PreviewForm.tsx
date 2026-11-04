import { useState } from 'react'
import { FileText, TriangleAlert } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { DialogBody, DialogFooter } from '@localixai/kit/dialog'
import { Field } from '@localixai/kit/field'
import { Select } from '@localixai/kit/select'
import { Metric } from '../Metric'
import { Switch } from '@localixai/kit/switch'
import { SegmentedRadioGroup } from '@localixai/mini-app-sdk/ui/segmented-control'
import { countOf, snippet } from '../../shared/format'
import type { DeckSummary } from '../../shared/payloads'
import type { ImportOptions, ImportPreview } from '../../shared/payloads-more'

const FILE_DECKS = 'file'

/** What the file holds, and the choices before it is imported. */
export function PreviewForm({
  file,
  preview,
  decks,
  error,
  onBack,
  onImport,
}: {
  file: File
  preview: ImportPreview
  decks: readonly DeckSummary[]
  error: string | null
  onBack: () => void
  onImport: (options: ImportOptions) => void
}) {
  const [deck, setDeck] = useState(FILE_DECKS)
  const [status, setStatus] = useState<'draft' | 'active'>('draft')
  const [keepProgress, setKeepProgress] = useState(true)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  return (
    <>
      <DialogBody className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-sm">
          <FileText className="size-4 text-text-soft" aria-hidden />
          <span className="min-w-0 truncate font-medium">{preview.source || file.name}</span>
        </p>
        <div className="grid grid-cols-2 gap-2 @md:grid-cols-4">
          <Metric label="Cards" value={preview.cards} hint={countOf(preview.notes, 'note')} />
          <Metric label="Decks" value={preview.decks.length} />
          <Metric label="Duplicates" value={preview.duplicates} hint="already here" />
          <Metric label="With progress" value={preview.withProgress} />
        </div>
        {preview.decks.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-soft" aria-label="Decks in the file">
            {preview.decks.slice(0, 8).map((d) => (
              <li key={d.name}>
                {d.name} <span className="text-text-faint tabular-nums">{d.notes}{d.exists ? '' : ' · new'}</span>
              </li>
            ))}
          </ul>
        )}
        {preview.warnings.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-md bg-status-warning/12 px-3 py-2 text-xs" aria-label="Warnings">
            {preview.warnings.map((w) => (
              <li key={w} className="flex items-start gap-1.5">
                <TriangleAlert className="mt-0.5 size-3 shrink-0 text-status-warning" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        )}
        {preview.sample.length > 0 && (
          <ul className="divide-y divide-border-faint rounded-lg border border-border-soft text-xs" aria-label="A few cards from the file">
            {preview.sample.slice(0, 3).map((card, index) => (
              <li key={index} className="flex gap-3 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{snippet(card.front, 60)}</span>
                <span className="min-w-0 flex-1 truncate text-text-faint">{snippet(card.back, 60)}</span>
              </li>
            ))}
          </ul>
        )}
        <Field label="Put the cards in">
          <Select
            aria-label="Put the cards in"
            value={deck}
            onValueChange={setDeck}
            options={[
              { value: FILE_DECKS, label: 'The decks in the file' },
              ...decks.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </Field>
        <Field label="Start as" description={status === 'draft' ? 'Drafts wait on the Today tab until you accept them.' : 'Ready cards are studied at once.'}>
          <SegmentedRadioGroup<'draft' | 'active'>
            aria-label="Start as"
            value={status}
            onValueChange={setStatus}
            fullWidth
            options={[
              { value: 'draft', label: 'Drafts to review' },
              { value: 'active', label: 'Ready to study' },
            ]}
          />
        </Field>
        {preview.withProgress > 0 && (
          <Field label="Keep Anki progress" layout="inline" description="Cards continue where you left off.">
            <Switch aria-label="Keep Anki progress" checked={keepProgress} onChange={(e) => setKeepProgress(e.target.checked)} />
          </Field>
        )}
        <Field label="Skip duplicates" layout="inline" description="Leave out cards whose front you already have.">
          <Switch aria-label="Skip duplicates" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
        </Field>
        {error && <p role="alert" className="text-xs text-status-error">{error}</p>}
      </DialogBody>
      <DialogFooter
        aside={<Button variant="ghost" onClick={onBack}>Choose another file</Button>}
      >
        <Button
          variant="mono"
          onClick={() =>
            onImport({
              deckId: deck === FILE_DECKS ? undefined : deck,
              status,
              keepProgress: preview.withProgress > 0 ? keepProgress : undefined,
              skipDuplicates,
            })
          }
        >
          Import {countOf(preview.notes, 'note')}
        </Button>
      </DialogFooter>
    </>
  )
}
