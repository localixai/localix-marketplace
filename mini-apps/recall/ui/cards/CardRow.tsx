import { memo } from 'react'
import { Checkbox } from '@localixai/kit/checkbox'
import { Chip } from '@localixai/kit/chip'
import {
  WorkbenchListRow,
  WorkbenchListRowMeta,
  WorkbenchListRowText,
  WorkbenchListRowTrigger,
} from '@localixai/kit/workbench-list-row'
import { plainFront } from '../../shared/cloze'
import { snippet } from '../../shared/format'
import { InlineMd, plainInline } from '../inline'
import type { LibraryRow } from '../../shared/payloads'
import { nextDue, rowState, STATE_LABEL, STATE_TONE } from './rowInfo'

/**
 * One card in the list: a checkbox to select it, its front, its deck and tags, its state and when
 * it is next due. Memoised: a long list re-renders only the rows whose own props changed.
 */
export const CardRow = memo(function CardRow({
  row,
  now,
  selected,
  open,
  onToggle,
  onOpen,
}: {
  row: LibraryRow
  now: number
  selected: boolean
  open: boolean
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}) {
  const { note, deck } = row
  const state = rowState(row)
  const due = nextDue(row, now)
  const text = plainFront(note)
  const front = snippet(plainInline(text), 90) || 'Untitled'
  return (
    <WorkbenchListRow role="listitem" density="default" active={open} data-note-id={note.id}>
      <Checkbox
        aria-label={`Select ${snippet(front, 40)}`}
        checked={selected}
        onChange={() => onToggle(note.id)}
        className="ml-1"
      />
      <WorkbenchListRowTrigger aria-current={open ? 'true' : undefined} aria-label={`Open ${snippet(front, 40)}`} onClick={() => onOpen(note.id)}>
        <WorkbenchListRowText
          title={<InlineMd>{text}</InlineMd>}
          description={
            <span className="flex min-w-0 items-center gap-2" data-recall-color={deck?.color}>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="recall-dot" aria-hidden />
                <span className="truncate">{deck?.name ?? 'Inbox'}</span>
              </span>
              {note.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="hidden shrink-0 @sm:inline">#{tag}</span>
              ))}
            </span>
          }
        />
      </WorkbenchListRowTrigger>
      <WorkbenchListRowMeta className="flex flex-col items-end gap-0.5">
        <Chip tone={STATE_TONE[state]} size="dense">{STATE_LABEL[state]}</Chip>
        <span className="hidden text-2xs tabular-nums @sm:inline">{due ?? ''}</span>
      </WorkbenchListRowMeta>
    </WorkbenchListRow>
  )
})
