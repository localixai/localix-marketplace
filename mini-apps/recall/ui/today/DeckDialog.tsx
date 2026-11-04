import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@localixai/kit/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@localixai/kit/dialog'
import { Field } from '@localixai/kit/field'
import { Input } from '@localixai/kit/input'
import { deckInputSchema, type Deck } from '../../shared/model'
import { call, useAction } from '../data'
import { fieldErrors } from '../format'

const COLORS = [1, 2, 3, 4, 5, 6] as const

/** Make a deck or rename and recolour one. The shared schema judges the name before it is sent. */
export function DeckDialog({
  open,
  deck,
  onClose,
}: {
  open: boolean
  deck: Deck | null
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const action = useAction()
  useEffect(() => {
    if (!open) return
    setName(deck?.name ?? '')
    setColor(deck?.color ?? 1)
    setErrors({})
    action.clear()
  }, [open, deck])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = deckInputSchema.safeParse({ name, color })
    if (!parsed.success) return setErrors(fieldErrors(parsed.error.issues))
    setErrors({})
    const saved = await action.run(() =>
      deck
        ? call('deckUpdate', { params: { id: deck.id }, body: parsed.data })
        : call('deckCreate', { body: parsed.data }),
    )
    if (saved) onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{deck ? 'Rename deck' : 'New deck'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Name" error={errors.name ?? undefined}>
              <Input
                autoFocus
                value={name}
                maxLength={100}
                placeholder="Spanish, Biology, Capitals"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Colour">
              <div role="radiogroup" aria-label="Deck colour" className="flex gap-2">
                {COLORS.map((slot) => (
                  <button // mini-app: native-control — a colour swatch is a bare hit target
                    key={slot}
                    type="button"
                    role="radio"
                    aria-checked={color === slot}
                    aria-label={`Colour ${slot}`}
                    data-recall-color={slot}
                    className="recall-swatch"
                    onClick={() => setColor(slot)}
                  />
                ))}
              </div>
            </Field>
            {action.error && (
              <p role="alert" className="text-xs text-status-error">
                {action.error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="submit" variant="mono" disabled={action.busy}>
              {deck ? 'Save' : 'Create deck'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
