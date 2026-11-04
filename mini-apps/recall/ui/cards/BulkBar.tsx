import { Check, FolderInput, MoreHorizontal, Pause, Play, RotateCcw, Tag, Tags, Trash2, X } from 'lucide-react'
import type { MenuEntry } from '@localixai/mini-app-sdk/ui'
import { Button } from '@localixai/kit/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@localixai/kit/dropdown-menu'
import { MenuEntries } from '@localixai/kit/menu-entries'
import { WorkbenchToolbar, WorkbenchToolbarSection } from '@localixai/kit/workbench-toolbar'
import { countOf } from '../../shared/format'

export type BulkAsk = 'move' | 'tag-add' | 'tag-remove' | 'reset' | 'delete'

/** The actions on the selected cards; the ones that need an answer first open a dialog. */
export function BulkBar({
  count,
  total,
  all,
  loaded,
  hasDrafts,
  busy,
  onClear,
  onSelectAll,
  onAsk,
  onRun,
}: {
  /** The cards the action applies to. */
  count: number
  /** How many the list matches in all. */
  total: number
  /** Every match is selected, even those not loaded. */
  all: boolean
  /** How many rows the list has loaded. */
  loaded: number
  hasDrafts: boolean
  busy: boolean
  onClear: () => void
  onSelectAll: () => void
  onAsk: (ask: BulkAsk) => void
  onRun: (action: 'pause' | 'resume' | 'accept') => void
}) {
  // More cards match than are loaded: offer every one, as a mail list does.
  const offer = !all && total > loaded
  const entries: MenuEntry[] = [
    { id: 'tag-add', label: 'Add a tag', icon: Tag, onSelect: () => onAsk('tag-add') },
    { id: 'tag-remove', label: 'Remove a tag', icon: Tags, onSelect: () => onAsk('tag-remove') },
    { separator: true },
    { id: 'pause', label: 'Pause', icon: Pause, onSelect: () => onRun('pause') },
    { id: 'resume', label: 'Resume', icon: Play, onSelect: () => onRun('resume') },
    { id: 'reset', label: 'Reset progress', icon: RotateCcw, onSelect: () => onAsk('reset') },
  ]
  return (
    <WorkbenchToolbar aria-label="Actions on selected cards" wrap>
      <WorkbenchToolbarSection wrap>
        <span className="px-1 text-xs font-medium tabular-nums">{selectionWords(count, total, all, loaded)}</span>
        {offer && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onSelectAll}>
            Select all {countOf(total, 'card')}
          </Button>
        )}
        <Button size="sm" variant="field" disabled={busy} onClick={() => onAsk('move')}>
          <FolderInput data-icon="inline-start" />
          Move to deck
        </Button>
        {hasDrafts && (
          <Button size="sm" variant="field" disabled={busy} onClick={() => onRun('accept')}>
            <Check data-icon="inline-start" />
            Accept drafts
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="field" disabled={busy} aria-label="More actions on the selection">
              <MoreHorizontal data-icon="inline-start" />
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <MenuEntries entries={entries} family="dropdown" />
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => onAsk('delete')}>
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
      </WorkbenchToolbarSection>
      <WorkbenchToolbarSection align="end">
        <Button size="sm" variant="ghost" onClick={onClear}>
          <X data-icon="inline-start" />
          Clear selection
        </Button>
      </WorkbenchToolbarSection>
    </WorkbenchToolbar>
  )
}

/** "All 2,524 cards selected", "50 of 2,524 selected", "All 3 selected" or "2 cards selected". */
export function selectionWords(count: number, total: number, all: boolean, loaded: number): string {
  if (all) return `All ${countOf(total, 'card')} selected`
  if (total > loaded) return `${count.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} selected`
  if (count === total && total > 1) return `All ${total.toLocaleString('en-US')} selected`
  return `${countOf(count, 'card')} selected`
}
