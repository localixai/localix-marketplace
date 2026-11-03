import { ArrowLeft, MoreHorizontal, MousePointerClick } from 'lucide-react'
import type { MenuEntry } from '@localixai/mini-app-sdk/ui'
import { Chip } from '@localixai/kit/chip'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@localixai/kit/context-menu'
import { DetailField } from '@localixai/kit/detail-field'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@localixai/kit/dropdown-menu'
import { IconButton } from '@localixai/kit/icon-button'
import { MenuEntries } from '@localixai/kit/menu-entries'
import { SectionLabel } from '@localixai/kit/section-label'
import { StateNotice } from '@localixai/kit/state-notice'
import {
  WorkbenchListRow,
  WorkbenchListRowActions,
  WorkbenchListRowLeading,
  WorkbenchListRowMeta,
  WorkbenchListRowText,
  WorkbenchListRowTrigger,
} from '@localixai/kit/workbench-list-row'
import type { Activity, ActivityInput, Deal } from '../../shared/model'
import { formatCloseDay, formatDate, formatMoney, orDash } from '../format'
import { STAGE_ICON, STAGE_LABEL, STAGE_TEXT, STAGE_TONE } from '../stage'
import { LogActivityForm, Timeline } from './master-detail-activity'
import { cn } from '@localixai/mini-app-sdk/ui/classes'

/** Parts of the master-detail pattern: the list row, the empty state and the detail pane. */

export function DealRow({
  deal,
  now,
  selected,
  tabStop,
  entries,
  onSelect,
}: {
  deal: Deal
  now: number
  selected: boolean
  /** The one row in the tab order; arrow keys move it (a roving tabindex). */
  tabStop: boolean
  entries: MenuEntry[]
  onSelect: () => void
}) {
  const Icon = STAGE_ICON[deal.stage]
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <WorkbenchListRow role="listitem" density="default" active={selected}>
          <WorkbenchListRowTrigger
            data-deal-id={deal.id}
            aria-current={selected ? 'true' : undefined}
            tabIndex={tabStop ? 0 : -1}
            onClick={onSelect}
          >
            <WorkbenchListRowLeading>
              <Icon
                className={cn('size-4', STAGE_TEXT[deal.stage])}
                aria-label={STAGE_LABEL[deal.stage]}
                role="img"
              />
            </WorkbenchListRowLeading>
            <WorkbenchListRowText
              title={deal.title}
              description={`${deal.company} · ${deal.owner}`}
            />
          </WorkbenchListRowTrigger>
          <WorkbenchListRowMeta className="flex flex-col items-end gap-0 tabular-nums">
            <span className="text-xs font-medium text-foreground">
              {formatMoney(deal.amount, deal.currency)}
            </span>
            <span className="hidden text-2xs @sm:inline">
              {formatCloseDay(deal.closeDate, now)}
            </span>
          </WorkbenchListRowMeta>
          <WorkbenchListRowActions aria-label={`${deal.title} actions`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  size="sm"
                  aria-label={`Actions for ${deal.title}`}
                  tooltip="Deal actions"
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

/** What the detail pane shows when nothing is selected: say what to do, not "empty". */
export function NoSelection() {
  return (
    <StateNotice
      icon={MousePointerClick}
      title="Select a deal"
      body="Its details and its activity appear here."
    />
  )
}

export function DetailPane({
  deal,
  activities,
  now,
  sending,
  activityError,
  focusSignal,
  onBack,
  onAddActivity,
}: {
  deal: Deal
  activities: Activity[]
  now: number
  sending: boolean
  activityError: string | null
  focusSignal: number
  onBack: () => void
  onAddActivity: (input: ActivityInput) => Promise<unknown>
}) {
  return (
    <section aria-label={`Deal: ${deal.title}`} className="@container flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-start gap-2 border-b border-border-soft px-4 py-3">
        <IconButton
          aria-label="Back to the list"
          tooltip="Back to the list"
          className="-ml-2 @2xl:hidden"
          onClick={onBack}
        >
          <ArrowLeft />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground" title={deal.title}>
            {deal.title}
          </h2>
          <p className="truncate text-xs text-text-faint" title={deal.company}>
            {deal.company}
          </p>
        </div>
        <Chip tone={STAGE_TONE[deal.stage]}>{STAGE_LABEL[deal.stage]}</Chip>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 scrollbar-thin">
        <div className="flex flex-col gap-2">
          <SectionLabel as="h3">Details</SectionLabel>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs @lg:grid-cols-2">
            <DetailField label="Owner" value={deal.owner} />
            <DetailField label="Amount" value={formatMoney(deal.amount, deal.currency)} />
            <DetailField label="Created" value={formatDate(deal.createdAt)} />
            <DetailField label="Closes" value={formatDate(deal.closeDate)} />
            {/* DetailField truncates to one line: right for a name or a date, wrong for a note.
                Free text gets the whole row and wraps. */}
            <p className="text-xs @lg:col-span-2">
              <span className="text-text-faint">Note: </span>
              <span className="whitespace-pre-wrap break-words">{orDash(deal.note)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <SectionLabel as="h3">Activity · {activities.length}</SectionLabel>
          <Timeline activities={activities} now={now} />
          <LogActivityForm
            key={deal.id}
            dealId={deal.id}
            sending={sending}
            serverError={activityError}
            focusSignal={focusSignal}
            onAdd={onAddActivity}
          />
        </div>
      </div>
    </section>
  )
}
