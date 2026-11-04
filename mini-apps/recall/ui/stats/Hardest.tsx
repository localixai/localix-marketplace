import { TextAction } from '@localixai/kit/text-action'
import { Chip } from '@localixai/kit/chip'
import { plainFront } from '../../shared/cloze'
import { countOf } from '../../shared/format'
import { InlineMd } from '../inline'
import type { LibraryRow } from '../../shared/payloads'

/** The cards missed most; each opens in Cards. */
export function Hardest({
  rows,
  onOpen,
  onAll,
}: {
  rows: readonly LibraryRow[]
  onOpen: (id: string) => void
  onAll: () => void
}) {
  if (!rows.length) return <p className="text-xs text-text-faint">No card has been missed yet.</p>
  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-border-faint" aria-label="Hardest cards">
        {rows.map((row) => {
          const lapses = Math.max(0, ...row.cards.map((card) => card.lapses))
          return (
            <li key={row.note.id} className="flex items-center gap-2 py-1.5">
              <TextAction className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => onOpen(row.note.id)}>
                <InlineMd>{plainFront(row.note)}</InlineMd>
              </TextAction>
              <span className="shrink-0 text-xs text-text-faint">{row.deck?.name ?? 'Inbox'}</span>
              <Chip tone={row.cards.some((card) => card.leech) ? 'warning' : 'neutral'} className="tabular-nums">
                {countOf(lapses, 'miss', 'misses')}
              </Chip>
            </li>
          )
        })}
      </ol>
      <TextAction className="self-start text-xs" onClick={onAll}>
        Show all hard cards
      </TextAction>
    </div>
  )
}
