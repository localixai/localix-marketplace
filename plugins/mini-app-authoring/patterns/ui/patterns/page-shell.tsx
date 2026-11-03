import { useMemo, useState } from 'react'
import { Plus, Rows3, Rows4, SearchX } from 'lucide-react'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { useScreenProblem } from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { useNow } from '@localixai/mini-app-sdk/ui/now'
import { Button } from '@localixai/kit/button'
import { Chip } from '@localixai/kit/chip'
import { DIVIDED_LIST } from '@localixai/kit/divided-list'
import { EmptyHint } from '@localixai/kit/empty-hint'
import { IconButton } from '@localixai/kit/icon-button'
import { PanelHeader } from '@localixai/kit/panel-header'
import { RefreshAction } from '@localixai/kit/refresh-action'
import { SearchInput } from '@localixai/kit/search-input'
import { Select, type SelectOption } from '@localixai/kit/select'
import { Skeleton } from '@localixai/kit/skeleton'
import { StatCard, StatSection } from '@localixai/kit/stat'
import { StateNotice } from '@localixai/kit/state-notice'
import { TabBar, TabPanel, useTabPanelIds } from '@localixai/kit/tabs'
import { WorkbenchToolbar, WorkbenchToolbarSection } from '@localixai/kit/workbench-toolbar'
import { APP, OPEN_STAGES, OWNERS, STAGES, toUsd, type Deal } from '../../shared/model'
import { useDeals, type PatternProps } from '../data'
import {
  countOf,
  formatCloseDay,
  formatCompact,
  formatCompactMoney,
  formatMoney,
  monthOf,
} from '../format'
import { STAGE_LABEL, STAGE_OPTIONS, STAGE_TONE } from '../stage'

/**
 * PAGE SHELL — the frame of a real screen: a fixed header, a toolbar for search, filters and the
 * primary action, tabs for sub-views, and one body that scrolls while everything above it stays put.
 *
 * Use it as the outer layout of any screen that lists things: a library, an inbox, a pipeline.
 * The fill chain is what makes it work in a pane of any size, and every link in it matters:
 * `@container` on the root (so layout follows the PANEL width, not the window's), `flex h-full
 * min-h-0 flex-col` down the spine, `min-h-0 flex-1 overflow-y-auto` on the one scrolling body.
 * Drop `min-h-0` anywhere and the body grows past the pane instead of scrolling.
 *
 * When copying, rename: `PageShell`, `useDeals` and `Deal` (your data), the tab ids/labels, the
 * filter options, and the "New deal" action. Keep the structure.
 */

type View = 'all' | 'open' | 'closed'
const VIEW_LABEL: Record<View, string> = { all: 'All deals', open: 'Open', closed: 'Closed' }
const inView = (deal: Deal, view: View) =>
  view === 'all' || (view === 'open') === OPEN_STAGES.includes(deal.stage)

const STAGE_FILTER: SelectOption[] = [{ value: 'all', label: 'All stages' }, ...STAGE_OPTIONS]
const OWNER_FILTER: SelectOption[] = [
  { value: 'all', label: 'All owners' },
  ...OWNERS.map((owner) => ({ value: owner, label: owner })),
]

export function PageShell({
  active,
  onNewDeal,
}: PatternProps & {
  /** The primary action. The gallery sends it to the form-dialog pattern. */
  onNewDeal?: () => void
}) {
  const deals = useDeals(active)
  // Re-render each minute, so "in 3d" and "today" stay true with the screen open.
  const now = useNow(60_000, active)
  const problem = useScreenProblem({
    app: APP,
    subject: 'Deals',
    failure: deals.error,
    showingData: deals.items.length > 0,
  })
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState('all')
  const [owner, setOwner] = useState('all')
  const [view, setView] = useState<View>('all')
  const [compact, setCompact] = useState(false)
  const ids = useTabPanelIds('page-shell')

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return deals.items.filter(
      (deal) =>
        (stage === 'all' || deal.stage === stage) &&
        (owner === 'all' || deal.owner === owner) &&
        (!needle || `${deal.title} ${deal.company}`.toLowerCase().includes(needle)),
    )
  }, [deals.items, query, stage, owner])
  const shown = matching.filter((deal) => inView(deal, view))
  const filtering = query.trim() !== '' || stage !== 'all' || owner !== 'all'
  const clearFilters = () => {
    setQuery('')
    setStage('all')
    setOwner('all')
  }

  const open = deals.items.filter((deal) => OPEN_STAGES.includes(deal.stage))
  const usd = (list: readonly Deal[]) =>
    list.reduce((sum, deal) => sum + toUsd(deal.amount, deal.currency), 0)
  const thisMonth = monthOf(now)
  const closingSoon = shown.filter((deal) => deal.closeDate?.startsWith(thisMonth))

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <PanelHeader
        tone="content"
        title="Pipeline"
        summary={
          deals.loading
            ? 'Loading deals…'
            : `${countOf(open.length, 'open deal')} · ${formatCompactMoney(usd(open))} in play`
        }
        actionsLabel="Pipeline actions"
        actions={
          <>
            <IconButton
              aria-label="Compact rows"
              tooltip="Compact rows"
              aria-pressed={compact}
              onClick={() => setCompact((on) => !on)}
            >
              {compact ? <Rows4 /> : <Rows3 />}
            </IconButton>
            <RefreshAction aria-label="Refresh deals" tooltip="Refresh" onClick={deals.refresh} />
          </>
        }
      />
      {problem && <ProblemLine {...problem} />}
      <WorkbenchToolbar aria-label="Deal filters" wrap>
        <WorkbenchToolbarSection className="min-w-0 flex-1" wrap>
          <SearchInput
            aria-label="Search deals"
            placeholder="Search deals or companies"
            value={query}
            onValueChange={setQuery}
            className="w-full min-w-40 max-w-64"
          />
          <Select
            aria-label="Filter by stage"
            size="md"
            value={stage}
            options={STAGE_FILTER}
            onValueChange={setStage}
          />
          <Select
            aria-label="Filter by owner"
            size="md"
            value={owner}
            options={OWNER_FILTER}
            onValueChange={setOwner}
          />
        </WorkbenchToolbarSection>
        <WorkbenchToolbarSection align="end">
          <Button size="sm" recommended onClick={onNewDeal} disabled={!onNewDeal}>
            <Plus data-icon="inline-start" />
            New deal
          </Button>
        </WorkbenchToolbarSection>
      </WorkbenchToolbar>
      <TabBar
        aria-label="Pipeline views"
        active={view}
        onChange={setView}
        items={(Object.keys(VIEW_LABEL) as View[]).map((id) => ({
          id,
          label: VIEW_LABEL[id],
          badge: matching.filter((deal) => inView(deal, id)).length,
          ...ids.item(id),
        }))}
      />
      <TabPanel
        id={ids.panelId(view)}
        aria-labelledby={ids.tabId(view)}
        active
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className="flex flex-col gap-4 px-3 py-3 @3xl:px-4">
          <StatSection title={VIEW_LABEL[view]}>
            <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
              <StatCard
                label="Value"
                value={formatCompactMoney(usd(shown))}
                hint="converted to USD"
              />
              <StatCard
                label="Deals"
                value={formatCompact(shown.length)}
                title={countOf(shown.length, 'deal')}
              />
              <StatCard
                label="Average"
                value={formatCompactMoney(shown.length ? usd(shown) / shown.length : 0)}
              />
              <StatCard label="Closing this month" value={closingSoon.length} />
            </div>
          </StatSection>
          {deals.loading ? (
            <RowsSkeleton />
          ) : deals.items.length === 0 && deals.error ? (
            <StateNotice
              role="alert"
              title="Deals could not be loaded"
              body={deals.error}
              actions={<Button onClick={deals.refresh}>Try again</Button>}
            />
          ) : shown.length === 0 ? (
            <StateNotice
              icon={SearchX}
              title="No deals here"
              body={filtering ? 'Nothing matches these filters.' : 'This view has no deals yet.'}
              actions={
                filtering ? (
                  <Button variant="field" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul
              aria-label={`${VIEW_LABEL[view]} deals`}
              className={cn(DIVIDED_LIST, 'rounded-lg border border-border-soft')}
            >
              {shown.map((deal) => (
                <DealLine key={deal.id} deal={deal} now={now} compact={compact} />
              ))}
            </ul>
          )}
          {!deals.loading && shown.length > 0 && (
            <EmptyHint>{countOf(shown.length, 'deal')} shown</EmptyHint>
          )}
        </div>
      </TabPanel>
    </div>
  )
}

/** One deal as a line: what it is, who has it, its stage and its value. */
function DealLine({ deal, now, compact }: { deal: Deal; now: number; compact: boolean }) {
  return (
    <li className={cn('flex items-center gap-3 px-3', compact ? 'py-1.5' : 'py-2.5')}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground" title={deal.title}>
          {deal.title}
        </p>
        <p className="truncate text-2xs text-text-faint" title={`${deal.company} · ${deal.owner}`}>
          {deal.company}
          <span className="hidden @xl:inline"> · {deal.owner}</span>
        </p>
      </div>
      <Chip tone={STAGE_TONE[deal.stage]} size="dense">
        {STAGE_LABEL[deal.stage]}
      </Chip>
      <span className="hidden w-16 text-right text-2xs text-text-faint @xl:block">
        {formatCloseDay(deal.closeDate, now)}
      </span>
      <span className="w-20 text-right text-xs font-medium tabular-nums text-foreground">
        {formatMoney(deal.amount, deal.currency)}
      </span>
    </li>
  )
}

/** Loading shaped like the rows it stands for, so nothing jumps when the data arrives. */
function RowsSkeleton() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-px overflow-hidden rounded-lg border border-border-soft"
    >
      {STAGES.map((stage) => (
        <div key={stage} className="flex items-center gap-3 px-3 py-2.5">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  )
}
