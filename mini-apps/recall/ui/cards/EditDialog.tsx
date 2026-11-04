import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@localixai/kit/dialog'
import { useRead } from '../data'
import { NoteEditor } from './NoteEditor'

/** The editor in a dialog, for changing a card without leaving where the person is (studying). */
export function EditCardDialog({
  noteId,
  onClose,
}: {
  /** The card to edit; `null` keeps the dialog closed. */
  noteId: string | null
  onClose: (saved: boolean) => void
}) {
  const decks = useRead('decks')
  const settings = useRead('settings')
  return (
    <Dialog open={noteId !== null} onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent size="lg" layout="edge-to-edge">
        <DialogHeader>
          <DialogTitle>Edit card</DialogTitle>
        </DialogHeader>
        {noteId && (
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <NoteEditor
            key={noteId}
            noteId={noteId}
            decks={decks.data?.decks ?? []}
            suggest={settings.data?.settings.suggestPlacement ?? false}
            onSaved={() => onClose(true)}
            onOpenNote={() => undefined}
          />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
