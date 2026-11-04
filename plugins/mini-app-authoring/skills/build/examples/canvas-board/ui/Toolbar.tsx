import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { IconButton } from '@localixai/kit/icon-button'
import { Input } from '@localixai/kit/input'
import { Select } from '@localixai/kit/select'
import { TONES, type Link, type Note, type Tone } from '../shared/model'
import type { Selection } from './flow'

const TONE_OPTIONS = TONES.map((tone) => ({
  value: tone,
  label: tone[0]!.toUpperCase() + tone.slice(1),
}))

/** The row above the board: add a note, and edit whatever is selected. */
export function Toolbar({
  sending,
  selection,
  note,
  link,
  onAdd,
  onEditNote,
  onEditLink,
  onDelete,
}: {
  sending: boolean
  selection: Selection
  note: Note | undefined
  link: Link | undefined
  onAdd: (text: string) => Promise<unknown>
  onEditNote: (patch: { text?: string; tone?: Tone }) => void
  onEditLink: (patch: { label?: string; tone?: Tone }) => void
  onDelete: () => void
}) {
  const [text, setText] = useState('')
  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    if (await onAdd(text)) setText('')
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-4 py-2">
      <form
        aria-label="Add a note"
        className="flex min-w-48 flex-1 gap-2"
        onSubmit={(e) => void add(e)}
      >
        <Input
          aria-label="New note"
          placeholder="Add a note"
          value={text}
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" size="sm" recommended disabled={sending || !text.trim()}>
          <Plus data-icon="inline-start" />
          Add
        </Button>
      </form>
      {selection && (note || link) && (
        // Keyed by the selected thing: switching selection starts the field from its own value.
        <div key={selection.id} className="flex items-center gap-2">
          <Input
            aria-label={note ? 'Note text' : 'Link label'}
            className="w-48"
            defaultValue={note ? note.text : link?.label}
            maxLength={note ? 500 : 60}
            placeholder={note ? 'Note text' : 'Label'}
            onBlur={(event) => {
              const value = event.target.value.trim()
              if (note && value && value !== note.text) onEditNote({ text: value })
              if (link && value !== link.label) onEditLink({ label: value })
            }}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          />
          <Select
            aria-label="Tone"
            size="md"
            value={(note ?? link)!.tone}
            options={TONE_OPTIONS}
            onValueChange={(tone) => {
              if (note) onEditNote({ tone: tone as Tone })
              else onEditLink({ tone: tone as Tone })
            }}
          />
          <IconButton
            aria-label={note ? 'Delete note' : 'Delete link'}
            tooltip="Delete"
            disabled={sending}
            onClick={onDelete}
          >
            <Trash2 />
          </IconButton>
        </div>
      )}
    </div>
  )
}
