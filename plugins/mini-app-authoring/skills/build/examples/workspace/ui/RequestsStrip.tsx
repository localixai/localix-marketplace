import { memo } from 'react'
import { Play, Send } from 'lucide-react'
import type { SessionSurfaceProps } from '@localixai/mini-app-sdk/ui'
import { useCollection } from '@localixai/mini-app-sdk/ui/app'
import { WorkItemSessionProvider } from '@localixai/mini-app-sdk/ui/work-item-session'
import { CollapsibleStrip } from '@localixai/kit/collapsible-strip'
import { IconButton } from '@localixai/kit/icon-button'
import {
  WorkbenchListRow,
  WorkbenchListRowActions,
  WorkbenchListRowMeta,
  WorkbenchListRowText,
} from '@localixai/kit/workbench-list-row'
import { APP, REQUESTS, asRequest, countOf, newestFirst, savedRequestSchema } from '../shared/model'
import type { RequestInput, SavedRequest } from '../shared/model'
import { runRequest } from './terminal'

/** What `composer.header` hands along: whether this composer is the focused, warm one. */
const isFocusedComposer = (context: unknown): boolean =>
  typeof context === 'object' &&
  context !== null &&
  (context as { isFocused?: unknown }).isFocused === true

/**
 * The strip above a chat's composer: how many requests this chat has saved, live, and each one to
 * run. Registered as a `composer.header` session surface.
 *
 * Every warm composer renders the surface, and each mounted strip would hold a collection read and
 * a feed subscription, so only the FOCUSED composer mounts the body; returning to a composer
 * re-reads. It renders nothing while the chat has no requests — it is extra, never in the way.
 *
 * A session surface sits outside any tab, so the chat comes from its props: `WorkItemSessionProvider`
 * gives `useCollection` (scope `'chat'`) the session a tab would have supplied.
 */
export function RequestsStrip({ sessionId, context }: SessionSurfaceProps) {
  if (!sessionId || !isFocusedComposer(context)) return null
  return (
    <WorkItemSessionProvider sessionId={sessionId}>
      <StripBody sessionId={sessionId} />
    </WorkItemSessionProvider>
  )
}

/** Memoized: typing in the composer re-renders the header, and nothing here depends on it. */
const StripBody = memo(function StripBody({ sessionId }: { sessionId: string }) {
  const { items } = useCollection<SavedRequest, RequestInput>({
    app: APP,
    name: REQUESTS,
    item: savedRequestSchema,
    scope: 'chat',
  })
  if (items.length === 0) return null
  const [latest] = newestFirst(items)
  return (
    <CollapsibleStrip
      label={{ expand: 'Show saved requests', collapse: 'Hide saved requests' }}
      icon={<Send className="size-4" />}
      count={items.length}
      title="Requests"
      listLabel="Saved requests"
      summary={`${countOf(items.length)} · latest: ${latest?.name}`}
    >
      {newestFirst(items).map((request) => (
        <WorkbenchListRow key={request.id} role="listitem" density="dense">
          <WorkbenchListRowMeta className="w-12 shrink-0 font-mono">
            {request.method}
          </WorkbenchListRowMeta>
          <WorkbenchListRowText title={request.name} />
          <WorkbenchListRowActions aria-label={`${request.name} actions`} visibility="always">
            <IconButton
              size="sm"
              aria-label={`Run ${request.name}`}
              tooltip="Run in terminal"
              onClick={() => void runRequest(sessionId, asRequest(request))}
            >
              <Play />
            </IconButton>
          </WorkbenchListRowActions>
        </WorkbenchListRow>
      ))}
    </CollapsibleStrip>
  )
})
