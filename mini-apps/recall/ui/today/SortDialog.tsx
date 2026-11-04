import { useEffect, useState } from 'react'
import { Button } from '@localixai/kit/button'
import { Chip } from '@localixai/kit/chip'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@localixai/kit/dialog'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { StateNotice } from '@localixai/kit/state-notice'
import { Inbox } from 'lucide-react'
import { plainFront } from '../../shared/cloze'
import { snippet } from '../../shared/format'
import { InlineMd, plainInline } from '../inline'
import type { LibraryRow, Placement } from '../../shared/payloads'
import { call, messageOf, useAction, useCall } from '../data'

interface Item {
  row: LibraryRow
  suggestion: Placement | null
}

/**
 * Sorting the Inbox: Recall suggests a deck and tags for each of the oldest cards without a deck,
 * and the person accepts them one by one or all together. Nothing moves until they do.
 */
export function SortDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ask = useCall()
  const [items, setItems] = useState<Item[] | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<ReadonlySet<string>>(new Set())
  const action = useAction()

  useEffect(() => {
    if (!open) return
    let live = true
    setItems(null)
    setFailure(null)
    setDone(new Set())
    ;(async () => {
      const page = await ask('library', { query: { deckIds: ['inbox'], sort: 'oldest', limit: 20 } })
      const ids = page.rows.map((row) => row.note.id)
      const placed = ids.length ? await ask('placement', { body: { ids } }) : { suggestions: [] }
      const byId = new Map(placed.suggestions.map((s) => [s.noteId, s]))
      if (live) setItems(page.rows.map((row) => ({ row, suggestion: byId.get(row.note.id) ?? null })))
    })().catch((error: unknown) => live && setFailure(messageOf(error, 'Could not suggest decks.')))
    return () => {
      live = false
    }
  }, [open, ask])

  const useful = (item: Item) => item.suggestion && (item.suggestion.deck || item.suggestion.tags.length)
  const pending = (items ?? []).filter((item) => !done.has(item.row.note.id))
  const acceptable = pending.filter(useful)

  async function accept(list: readonly Item[]) {
    const finished = await action.run(async () => {
      for (const { row, suggestion } of list) {
        if (!suggestion) continue
        const ids = [row.note.id]
        if (suggestion.deck) await call('bulk', { body: { ids, action: 'move', deckId: suggestion.deck.id } })
        if (suggestion.tags.length) await call('bulk', { body: { ids, action: 'tag-add', tags: suggestion.tags } })
      }
      return list.map((item) => item.row.note.id)
    })
    if (finished) setDone((current) => new Set([...current, ...finished]))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Sort the Inbox</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <DialogDescription>
            Suggested decks and tags for your oldest cards without a deck. Accept the ones that fit.
          </DialogDescription>
          {failure ? (
            <p role="alert" className="text-xs text-status-error">
              {failure}
            </p>
          ) : items === null ? (
            <LoadingHint>Looking for a home for each card…</LoadingHint>
          ) : pending.length === 0 ? (
            <StateNotice icon={Inbox} title="Nothing left to sort" body="Every card here has a deck or was handled." />
          ) : (
            <ul className="divide-y divide-border-faint rounded-lg border border-border-soft" aria-label="Suggestions">
              {pending.map((item) => (
                <li key={item.row.note.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="truncate text-sm"><InlineMd>{plainFront(item.row.note)}</InlineMd></p>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-text-faint">
                      {useful(item) ? (
                        <>
                          <span>Suggested:</span>
                          {item.suggestion?.deck && <Chip tone="info">{item.suggestion.deck.name}</Chip>}
                          {item.suggestion?.tags.map((tag) => (
                            <Chip key={tag}>#{tag}</Chip>
                          ))}
                        </>
                      ) : (
                        <span>No suggestion; it stays in the Inbox.</span>
                      )}
                    </div>
                  </div>
                  {useful(item) && (
                    <Button
                      size="sm"
                      variant="field"
                      disabled={action.busy}
                      aria-label={`Accept the suggestion for ${snippet(plainInline(plainFront(item.row.note)), 40)}`}
                      onClick={() => void accept([item])}
                    >
                      Accept
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {action.error && (
            <p role="alert" className="text-xs text-status-error">
              {action.error}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="mono" disabled={action.busy || acceptable.length === 0} onClick={() => void accept(acceptable)}>
            Accept all{acceptable.length ? ` (${acceptable.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
