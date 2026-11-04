import { useRef, useState, type DragEvent } from 'react'
import { CircleCheck, Upload } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@localixai/kit/dialog'
import { DROP_TARGET_SURFACE_ACTIVE, DROP_TARGET_TRANSITION } from '@localixai/kit/drop-target'
import { Spinner } from '@localixai/kit/spinner'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { countOf } from '../../shared/format'
import { useRead } from '../data'
import { PreviewForm } from './PreviewForm'
import { ACCEPT, useImport } from './useImport'

/** Import: drop or choose a file, see what is in it, choose how it comes in, then open the cards. */
export function ImportDialog({
  open,
  onClose,
  onOpenCards,
}: {
  open: boolean
  onClose: () => void
  onOpenCards: (preset: { deck?: string; state?: string }) => void
}) {
  const { step, choose, commit, reset } = useImport()
  const decks = useRead('decks', {}, open)
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const close = () => {
    reset()
    onClose()
  }
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    const file = event.dataTransfer.files[0]
    if (file) void choose(file)
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import cards</DialogTitle>
        </DialogHeader>
        {step.name === 'choose' && (
          <>
            <DialogBody className="flex flex-col gap-3">
              {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- a drop target; the button inside does the same */}
              <div
                onDragOver={(event) => (event.preventDefault(), setOver(true))}
                onDragLeave={() => setOver(false)}
                onDrop={drop}
                className={cn(
                  'flex flex-col items-center gap-3 rounded-lg border border-dashed border-control-border px-4 py-8 text-center',
                  DROP_TARGET_TRANSITION,
                  over && DROP_TARGET_SURFACE_ACTIVE,
                )}
              >
                <Upload className="size-6 text-text-soft" aria-hidden />
                <p className="text-sm font-medium">Drop a file here</p>
                <p className="text-xs text-text-faint">
                  Anki (.apkg, .colpkg), CSV or TSV, Markdown, plain text or a Recall JSON backup.
                  Up to 512 MB.
                </p>
                <Button variant="field" onClick={() => input.current?.click()}>
                  Choose a file
                </Button>
                <input
                  ref={input}
                  type="file"
                  accept={ACCEPT}
                  aria-label="Choose a file to import"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void choose(file)
                  }}
                />
              </div>
              {step.error && (
                <p role="alert" className="text-xs text-status-error">
                  {step.error}
                </p>
              )}
            </DialogBody>
          </>
        )}
        {step.name === 'reading' && (
          <DialogBody className="flex items-center gap-3 py-8" role="status">
            <Spinner label="Reading the file" />
            <p className="text-sm">Reading {step.file.name}…</p>
          </DialogBody>
        )}
        {step.name === 'preview' && (
          <PreviewForm
            file={step.file}
            preview={step.preview}
            decks={decks.data?.decks ?? []}
            error={step.error}
            onBack={reset}
            onImport={(options) => void commit(step.file, step.preview, options)}
          />
        )}
        {step.name === 'importing' && (
          <DialogBody className="flex items-center gap-3 py-8" role="status">
            <Spinner label="Importing" />
            <div>
              <p className="text-sm font-medium">
                Importing {countOf(step.preview.notes, 'note')}…
              </p>
              <p className="text-xs text-text-faint">
                A large deck with pictures can take a minute. You can keep this window open.
              </p>
            </div>
          </DialogBody>
        )}
        {step.name === 'done' && (
          <>
            <DialogBody className="flex flex-col gap-3" role="status">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CircleCheck className="size-4 text-status-success" aria-hidden />
                Imported {countOf(step.result.added, 'note')} ({countOf(step.result.cards, 'card')})
              </p>
              <ul className="flex flex-col gap-0.5 text-xs text-text-soft">
                <li>
                  {step.result.status === 'draft'
                    ? 'They are drafts: accept them on the Today tab.'
                    : 'They are ready to study.'}
                </li>
                {step.result.decksCreated.length > 0 && (
                  <li>New decks: {step.result.decksCreated.join(', ')}</li>
                )}
                {step.result.skippedDuplicates > 0 && (
                  <li>Skipped {countOf(step.result.skippedDuplicates, 'duplicate')}</li>
                )}
                {step.result.reviewsReplayed > 0 && (
                  <li>Kept {countOf(step.result.reviewsReplayed, 'past answer')}</li>
                )}
                {step.result.warnings.map((w) => (
                  <li key={w} className="text-status-warning">
                    {w}
                  </li>
                ))}
              </ul>
            </DialogBody>
            <DialogFooter
              aside={
                <Button variant="ghost" onClick={close}>
                  Close
                </Button>
              }
            >
              <Button
                variant="mono"
                onClick={() => {
                  const only = step.result.decks.length === 1 ? step.result.decks[0] : undefined
                  onOpenCards({
                    state: step.result.status === 'draft' ? 'draft' : undefined,
                    deck: only?.id,
                  })
                  close()
                }}
              >
                Open imported cards
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
