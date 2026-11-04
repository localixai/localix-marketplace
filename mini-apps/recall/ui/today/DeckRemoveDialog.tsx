import { useEffect, useState } from 'react'
import { Button } from '@localixai/kit/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@localixai/kit/dialog'
import { SegmentedRadioGroup } from '@localixai/mini-app-sdk/ui/segmented-control'
import { countOf } from '../../shared/format'
import type { DeckSummary } from '../../shared/payloads'
import { call, useAction } from '../data'

type Fate = 'inbox' | 'delete'

/** Removing a deck asks what happens to its cards: move them to the Inbox or delete them. */
export function DeckRemoveDialog({
  deck,
  onClose,
}: {
  deck: DeckSummary | null
  onClose: () => void
}) {
  const [fate, setFate] = useState<Fate>('inbox')
  const action = useAction()
  useEffect(() => {
    if (deck) {
      setFate('inbox')
      action.clear()
    }
  }, [deck])
  if (!deck) return null
  const deleting = fate === 'delete'
  const run = async () => {
    const done = await action.run(() => call('deckRemove', { params: { id: deck.id }, body: { cards: fate } }))
    if (done) onClose()
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Remove {deck.name}?</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <DialogDescription>
            {deck.notes === 0
              ? 'The deck has no cards.'
              : `The deck has ${countOf(deck.notes, 'card')}. What should happen to them?`}
          </DialogDescription>
          {deck.notes > 0 && (
            <SegmentedRadioGroup<Fate>
              aria-label="What happens to the cards"
              value={fate}
              onValueChange={setFate}
              fullWidth
              options={[
                { value: 'inbox', label: 'Move cards to Inbox' },
                { value: 'delete', label: 'Delete them' },
              ]}
            />
          )}
          {deleting && (
            <p className="text-xs text-status-error">Deleting also removes their review history.</p>
          )}
          {action.error && (
            <p role="alert" className="text-xs text-status-error">
              {action.error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant={deleting ? 'destructive-solid' : 'mono'} disabled={action.busy} onClick={() => void run()}>
            {deleting ? 'Remove deck and cards' : 'Remove deck'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
