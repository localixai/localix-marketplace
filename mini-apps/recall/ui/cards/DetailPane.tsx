import { useState } from 'react'
import { ArrowLeft, Check, Trash2 } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { ConfirmDialog } from '@localixai/kit/confirm-dialog'
import { IconButton } from '@localixai/kit/icon-button'
import { PanelHeader } from '@localixai/kit/panel-header'
import { StateNotice } from '@localixai/kit/state-notice'
import { SearchX } from 'lucide-react'
import { snippet } from '../../shared/format'
import { InlineMd } from '../inline'
import { plainFront } from '../../shared/cloze'
import type { Note } from '../../shared/model'
import type { DeckSummary } from '../../shared/payloads'
import { describeDetail } from '../../shared/describe'
import { call, useAction, useRead } from '../data'
import { useReportContext } from '../screen-context'
import { History } from './History'
import { NoteEditor } from './NoteEditor'
import type { FormState } from './note-form'

/**
 * The right side of Cards: the editor and the card's history. `noteId: null` is a new card. A
 * card the owner no longer has shows as gone, never as the last copy that was read.
 */
export function DetailPane({
  noteId,
  decks,
  initial,
  suggest,
  now,
  onBack,
  onSaved,
  onOpenNote,
  onGone,
}: {
  noteId: string | null
  decks: readonly DeckSummary[]
  initial?: Partial<FormState>
  suggest: boolean
  now: number
  onBack: () => void
  onSaved: (note: Note, created: boolean) => void
  onOpenNote: (id: string) => void
  onGone: () => void
}) {
  const read = useRead('noteGet', { params: { id: noteId ?? '-' } }, noteId !== null)
  const [confirming, setConfirming] = useState(false)
  const action = useAction()
  const detail = read.data
  useReportContext(
    detail && noteId ? `Open card: ${describeDetail(detail, new Date(now))}` : noteId === null ? 'Writing a new card.' : null,
  )
  const gone = noteId !== null && read.gone

  const header = (
    <PanelHeader
      tone="content"
      title={noteId ? 'Card' : 'New card'}
      summary={detail ? <InlineMd>{snippet(plainFront(detail.note), 80)}</InlineMd> : undefined}
      icon={
        <IconButton aria-label="Back to cards" tooltip="Back to cards" size="sm" className="@3xl:hidden" onClick={onBack}>
          <ArrowLeft />
        </IconButton>
      }
    />
  )
  if (gone) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <StateNotice
          icon={SearchX}
          title="This card is gone"
          body="It was deleted or moved somewhere else."
          actions={<Button onClick={onGone}>Close</Button>}
        />
      </div>
    )
  }
  const isDraft = detail?.note.status === 'draft'
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="@container flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin">
        <div className="flex flex-col">
        <NoteEditor
          key={noteId ?? 'new'}
          noteId={noteId}
          decks={decks}
          initial={initial}
          suggest={suggest}
          onSaved={onSaved}
          onOpenNote={onOpenNote}
          actions={
            noteId ? (
              <>
                {isDraft && (
                  <Button
                    variant="field"
                    disabled={action.busy}
                    onClick={() => void action.run(() => call('drafts', { body: { action: 'accept', ids: [noteId] } }))}
                  >
                    <Check data-icon="inline-start" />
                    Accept
                  </Button>
                )}
                <Button variant="ghost" disabled={action.busy} onClick={() => setConfirming(true)}>
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              </>
            ) : null
          }
        />
        {detail && noteId && <History detail={detail} now={now} />}
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        variant="destructive"
        title="Delete this card?"
        description="Its answers are deleted with it. This cannot be undone."
        confirmLabel="Delete card"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false)
          if (noteId && (await action.run(() => call('noteRemove', { params: { id: noteId } })))) onGone()
        }}
      />
      {action.error && <p role="alert" className="px-4 pb-2 text-xs text-status-error">{action.error}</p>}
    </div>
  )
}
