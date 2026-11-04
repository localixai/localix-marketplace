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
  hasDrafts,
  busy,
  onClear,
  onAsk,
  onRun,
}: {
  count: number
  hasDrafts: boolean
  busy: boolean
  onClear: () => void
  onAsk: (ask: BulkAsk) => void
  onRun: (action: 'pause' | 'resume' | 'accept') => void
}) {
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
        <span className="px-1 text-xs font-medium tabular-nums">{countOf(count, 'card')} selected</span>
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
