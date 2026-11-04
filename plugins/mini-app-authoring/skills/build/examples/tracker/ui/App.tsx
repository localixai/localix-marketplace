import { useMemo, useState } from 'react'
import { useAgentContext, useScreenProblem, type ScreenProps } from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { useNow } from '@localixai/mini-app-sdk/ui/now'
import { miniAppApiFetch, assertMiniAppResponse } from '@localixai/mini-app-sdk/ui/transport'
import { ConfirmDialog } from '@localixai/kit/confirm-dialog'
import { PanelHeader } from '@localixai/kit/panel-header'
import { RefreshAction } from '@localixai/kit/refresh-action'
import { TabBar, TabPanel, useTabPanelIds } from '@localixai/kit/tabs'
import {
  APP,
  LIVE_STATUSES,
  patchFor,
  type Application,
  type ApplicationInput,
  type Company,
  type CompanyInput,
} from '../shared/model'
import { countOf, describeForAgent } from '../shared/report'
import { ApplicationDialog } from './application-form'
import { CompanyDialog } from './company-form'
import { useApplications, useCompanies } from './data'
import { ListView } from './list-view'
import { EmptyTracker, LoadFailed, NothingMatches } from './states'
import { TableView } from './table-view'
import { Toolbar } from './toolbar'
import { useFilters } from './use-filters'

type View = 'list' | 'table'
const VIEW_LABEL: Record<View, string> = { list: 'List', table: 'Table' }
/** What the open dialog is for. `id: null` adds an application. */
type Editor = { kind: 'application'; id: string | null } | { kind: 'company' }
/** What waits for a "yes": applications to delete, or a company (with its applications). */
type Confirm = { kind: 'applications'; ids: string[] } | { kind: 'company'; company: Company }

/**
 * The screen. It reads the two collections, tells the agent exactly what it shows, and writes
 * through the same collections the agent's tools use, so a change from either side shows on the
 * other at once. This file owns the state and the writes; the views (list, table), the dialogs and
 * the states are their own files and take plain props.
 */
export function App({ active, publishMessageContext }: ScreenProps) {
  const companies = useCompanies(active)
  const applications = useApplications(active)
  // Re-render each minute, so "5m ago" stays true with the screen open.
  const now = useNow(60_000, active)
  const [view, setView] = useState<View>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const ids = useTabPanelIds('tracker')
  const { filters, matching, filtering, set, clear } = useFilters(
    applications.items,
    companies.items,
  )
  const loading = companies.loading || applications.loading
  const live = applications.items.filter((a) => LIVE_STATUSES.includes(a.status)).length

  useAgentContext(
    publishMessageContext,
    active && !loading,
    useMemo(
      () => ({
        label: 'Job search',
        content: describeForAgent(companies.items, applications.items, new Date(now)),
      }),
      [companies.items, applications.items, now],
    ),
  )
  const failure = companies.error ?? applications.error
  // Nothing to show and a failure: the whole body says so (with a retry), so the line stays quiet.
  const blocked = failure !== null && applications.items.length === 0
  const problem = useScreenProblem({
    app: APP,
    subject: 'Applications',
    // A refused save is shown in its dialog, not twice.
    failure: editor || blocked ? null : (actionError ?? failure),
    showingData: applications.items.length > 0,
  })

  const editing =
    editor?.kind === 'application' && editor.id
      ? (applications.items.find((a) => a.id === editor.id) ?? null)
      : null
  const closeEditor = (open: boolean) => {
    if (open) return
    setEditor(null)
    // A refused save leaves its sentence in the hook; reading again clears it.
    applications.refresh()
    companies.refresh()
  }
  async function saveApplication(input: ApplicationInput): Promise<boolean> {
    // The shared rule adds the timeline entry when the status changed: the tools call it too.
    const saved = editing
      ? await applications.update(editing.id, patchFor(editing, input, new Date()))
      : await applications.add(input)
    if (saved) setEditor(null)
    return saved !== null
  }
  async function saveCompany(input: CompanyInput): Promise<boolean> {
    const saved = await companies.add(input)
    if (saved) setEditor(null)
    return saved !== null
  }

  async function confirmed() {
    const pending = confirm
    setConfirm(null)
    setActionError(null)
    if (pending?.kind === 'applications') {
      // One request per row, in order; stop at the first refusal.
      for (const id of pending.ids) if (!(await applications.remove(id))) break
    } else if (pending) {
      try {
        // The cascade lives on the server (backend/index.ts): one call removes the company and
        // every application made to it. Then both lists are read again.
        await assertMiniAppResponse(
          await miniAppApiFetch(`/rpc/${APP}/companies/${pending.company.id}/with-applications`, {
            method: 'DELETE',
          }),
        )
      } catch (error) {
        setActionError(error instanceof Error ? error.message : 'The company could not be removed.')
      }
      companies.refresh()
      applications.refresh()
    }
  }

  const newApplication = () => setEditor({ kind: 'application', id: null })
  const newCompany = () => setEditor({ kind: 'company' })
  const showing = blocked ? (
    <LoadFailed message={failure} onRetry={() => (companies.refresh(), applications.refresh())} />
  ) : !loading && applications.items.length === 0 ? (
    <EmptyTracker
      hasCompanies={companies.items.length > 0}
      onNewApplication={newApplication}
      onNewCompany={newCompany}
    />
  ) : !loading && matching.length === 0 ? (
    <NothingMatches onClear={clear} />
  ) : view === 'list' ? (
    <ListView
      applications={matching}
      companies={companies.items}
      all={applications.items}
      loading={loading}
      now={now}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onEdit={(a: Application) => setEditor({ kind: 'application', id: a.id })}
      onChange={(a, change) => void applications.update(a.id, patchFor(a, change, new Date()))}
      onDelete={(a) => setConfirm({ kind: 'applications', ids: [a.id] })}
      onRemoveCompany={(company) => setConfirm({ kind: 'company', company })}
    />
  ) : (
    <TableView
      applications={matching}
      companies={companies.items}
      loading={loading}
      busy={applications.sending}
      onEdit={(a) => setEditor({ kind: 'application', id: a.id })}
      onDelete={(ids) => setConfirm({ kind: 'applications', ids })}
    />
  )

  const owned =
    confirm?.kind === 'company'
      ? applications.items.filter((a) => a.companyId === confirm.company.id).length
      : 0
  return (
    // The fill chain: the header stays, one body scrolls, and the layout reflows to its own width
    // (the screen may sit in a narrow pane).
    <div className="@container flex h-full min-h-0 flex-col">
      <PanelHeader
        tone="content"
        title="Job search"
        summary={
          loading
            ? 'Loading…'
            : `${countOf(applications.items.length, 'application')} · ${live} live`
        }
        actionsLabel="Job search actions"
        actions={
          <RefreshAction
            aria-label="Refresh applications"
            tooltip="Refresh"
            onClick={() => (companies.refresh(), applications.refresh())}
          />
        }
      />
      {problem && <ProblemLine {...problem} />}
      <Toolbar
        filters={filters}
        companies={companies.items}
        onChange={set}
        onNewApplication={newApplication}
        onNewCompany={newCompany}
      />
      <TabBar
        aria-label="Views"
        active={view}
        onChange={setView}
        items={(Object.keys(VIEW_LABEL) as View[]).map((id) => ({
          id,
          label: VIEW_LABEL[id],
          badge: matching.length,
          ...ids.item(id),
        }))}
      />
      <TabPanel
        id={ids.panelId(view)}
        aria-labelledby={ids.tabId(view)}
        active
        className="flex min-h-0 flex-1 flex-col"
      >
        {showing}
      </TabPanel>
      <ApplicationDialog
        open={editor?.kind === 'application' && (editor.id === null || editing !== null)}
        application={editing}
        companies={companies.items}
        pending={applications.sending}
        serverError={applications.error}
        onOpenChange={closeEditor}
        onSubmit={saveApplication}
      />
      <CompanyDialog
        open={editor?.kind === 'company'}
        pending={companies.sending}
        serverError={companies.error}
        onOpenChange={closeEditor}
        onSubmit={saveCompany}
      />
      <ConfirmDialog
        open={confirm !== null}
        variant="destructive"
        title={
          confirm?.kind === 'company'
            ? `Remove ${confirm.company.name}?`
            : `Delete ${countOf(confirm?.kind === 'applications' ? confirm.ids.length : 0, 'application')}?`
        }
        description={
          confirm?.kind === 'company'
            ? `This also deletes its ${countOf(owned, 'application')}. This cannot be undone.`
            : 'They are removed from the tracker. This cannot be undone.'
        }
        confirmLabel={confirm?.kind === 'company' ? 'Remove company' : 'Delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => void confirmed()}
      />
    </div>
  )
}
