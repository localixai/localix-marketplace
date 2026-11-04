import { MoreHorizontal } from 'lucide-react'
import type { MenuEntry } from '@localixai/mini-app-sdk/ui'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@localixai/kit/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@localixai/kit/dropdown-menu'
import { IconButton } from '@localixai/kit/icon-button'
import { MenuEntries } from '@localixai/kit/menu-entries'
import {
  WorkbenchListRow,
  WorkbenchListRowActions,
  WorkbenchListRowLeading,
  WorkbenchListRowMeta,
  WorkbenchListRowText,
  WorkbenchListRowTrigger,
} from '@localixai/kit/workbench-list-row'
import type { Application } from '../shared/model'
import { EM_DASH, formatCompactMoney, formatRelative } from './format'
import { STATUS_ICON, STATUS_LABEL, STATUS_TEXT } from './status'

/**
 * One row of the master list: the status icon, the role with its company, the pay and how long ago
 * it last moved. The kebab and the right-click menu share one description of the actions
 * (`entries`), so the two never drift apart. A row is a `listitem` with one button inside: the
 * button is the focus stop.
 */
export function ApplicationRow({
  application,
  company,
  now,
  selected,
  tabStop,
  entries,
  onSelect,
}: {
  application: Application
  /** `null` when the company is gone: shown as a dash, never as a blank. */
  company: string | null
  now: number
  selected: boolean
  /** The one row in the tab order; arrow keys move it (a roving tabindex). */
  tabStop: boolean
  entries: MenuEntry[]
  onSelect: () => void
}) {
  const Icon = STATUS_ICON[application.status]
  const moved = application.history.at(-1)?.at ?? application.createdAt
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <WorkbenchListRow role="listitem" density="default" active={selected}>
          <WorkbenchListRowTrigger
            data-application-id={application.id}
            aria-current={selected ? 'true' : undefined}
            tabIndex={tabStop ? 0 : -1}
            onClick={onSelect}
          >
            <WorkbenchListRowLeading>
              <Icon
                className={cn('size-4', STATUS_TEXT[application.status])}
                aria-label={STATUS_LABEL[application.status]}
                role="img"
              />
            </WorkbenchListRowLeading>
            <WorkbenchListRowText title={application.role} description={company ?? EM_DASH} />
          </WorkbenchListRowTrigger>
          <WorkbenchListRowMeta className="flex flex-col items-end gap-0 tabular-nums">
            <span className="text-xs font-medium text-foreground">
              {formatCompactMoney(application.salary)}
            </span>
            <span className="hidden text-2xs @sm:inline">{formatRelative(moved, now)}</span>
          </WorkbenchListRowMeta>
          <WorkbenchListRowActions aria-label={`${application.role} actions`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  size="sm"
                  aria-label={`Actions for ${application.role}`}
                  tooltip="Application actions"
                >
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <MenuEntries entries={entries} family="dropdown" />
              </DropdownMenuContent>
            </DropdownMenu>
          </WorkbenchListRowActions>
        </WorkbenchListRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <MenuEntries entries={entries} family="context" />
      </ContextMenuContent>
    </ContextMenu>
  )
}
