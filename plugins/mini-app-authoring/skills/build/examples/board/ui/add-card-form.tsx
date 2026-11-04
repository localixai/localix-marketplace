import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { Input } from '@localixai/kit/input'
import { cardInputSchema, type CardInput } from '../shared/model'

/**
 * A one-line form that adds a card to the Backlog. The shared schema is the one rule: the same
 * `title` check the server runs, so the button never offers what the server would refuse. The form
 * clears only once the card is stored, so a failed save keeps what was typed.
 */
export function AddCardForm({
  sending,
  onAdd,
}: {
  sending: boolean
  onAdd: (input: CardInput) => Promise<unknown>
}) {
  const [title, setTitle] = useState('')
  const valid = cardInputSchema.shape.title.safeParse(title).success
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (valid && (await onAdd({ title }))) setTitle('')
  }
  return (
    <form aria-label="Add a card" className="flex gap-2" onSubmit={(event) => void submit(event)}>
      <Input
        aria-label="New card"
        placeholder="Add a card"
        value={title}
        maxLength={120}
        className="w-44"
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button type="submit" size="sm" recommended disabled={sending || !valid}>
        <Plus data-icon="inline-start" />
        Add
      </Button>
    </form>
  )
}
