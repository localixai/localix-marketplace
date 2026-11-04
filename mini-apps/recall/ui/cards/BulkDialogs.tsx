import { useEffect, useState } from 'react'
import { Button } from '@localixai/kit/button'
import { ConfirmDialog } from '@localixai/kit/confirm-dialog'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@localixai/kit/dialog'
import { Field } from '@localixai/kit/field'
import { Input } from '@localixai/kit/input'
import { Select } from '@localixai/kit/select'
import { countOf } from '../../shared/format'
import { INBOX, normalizeTags } from '../../shared/model'
import type { DeckSummary } from '../../shared/payloads'
import type { BulkAsk } from './BulkBar'

export type BulkBody =
  | { action: 'move'; deckId: string | null }
  | { action: 'tag-add' | 'tag-remove'; tags: string[] }
  | { action: 'reset' | 'delete' | 'pause' | 'resume' | 'accept' }

/** The question a bulk action needs answered: which deck, which tag, or "are you sure". */
export function BulkDialogs({
  ask,
  count,
  decks,
  busy,
  onClose,
  onSubmit,
}: {
  ask: BulkAsk | null
  count: number
  decks: readonly DeckSummary[]
  busy: boolean
  onClose: () => void
  onSubmit: (body: BulkBody) => void
}) {
  const [deck, setDeck] = useState(INBOX)
  const [tags, setTags] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    setDeck(INBOX)
    setTags('')
    setProblem(null)
  }, [ask])

  if (ask === 'reset' || ask === 'delete') {
    const destroy = ask === 'delete'
    return (
      <ConfirmDialog
        open
        variant="destructive"
        title={destroy ? `Delete ${countOf(count, 'card')}?` : `Reset progress on ${countOf(count, 'card')}?`}
        description={
          destroy
            ? 'The cards and their answers are deleted. This cannot be undone.'
            : 'They become new cards again and their answers are forgotten.'
        }
        confirmLabel={destroy ? 'Delete' : 'Reset progress'}
        onClose={onClose}
        onConfirm={() => onSubmit({ action: ask })}
      />
    )
  }
  const moving = ask === 'move'
  function submit() {
    if (moving) return onSubmit({ action: 'move', deckId: deck === INBOX ? null : deck })
    const list = normalizeTags([tags])
    if (!list.length) return setProblem('Write a tag.')
    onSubmit({ action: ask as 'tag-add' | 'tag-remove', tags: list })
  }
  return (
    <Dialog open={ask !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {moving
              ? `Move ${countOf(count, 'card')} to…`
              : ask === 'tag-add'
                ? `Add a tag to ${countOf(count, 'card')}`
                : `Remove a tag from ${countOf(count, 'card')}`}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          {moving ? (
            <Field label="Deck">
              <Select
                aria-label="Deck"
                value={deck}
                onValueChange={setDeck}
                options={[{ value: INBOX, label: 'Inbox (no deck)' }, ...decks.map((d) => ({ value: d.id, label: d.name }))]}
              />
            </Field>
          ) : (
            <Field label="Tag" error={problem ?? undefined}>
              <Input
                autoFocus
                value={tags}
                placeholder="grammar"
                onChange={(event) => {
                  setTags(event.target.value)
                  setProblem(null)
                }}
                onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), submit())}
              />
            </Field>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="mono" disabled={busy} onClick={submit}>
            {moving ? 'Move' : ask === 'tag-add' ? 'Add tag' : 'Remove tag'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
