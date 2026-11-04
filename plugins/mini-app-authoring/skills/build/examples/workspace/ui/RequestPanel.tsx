import { Play } from 'lucide-react'
import { miniAppWorkspace } from '@localixai/mini-app-sdk/ui/runtime'
import { IconButton } from '@localixai/kit/icon-button'
import {
  WorkbenchListRow,
  WorkbenchListRowActions,
  WorkbenchListRowMeta,
  WorkbenchListRowTrigger,
} from '@localixai/kit/workbench-list-row'
import { countOf } from '../shared/model'
import type { ParsedRequest } from '../shared/http'
import { runRequest } from './terminal'
import type { FileRequests } from './useFileRequests'

/**
 * The panel docked under the `.http` editor: every request in the file, with the two things a
 * request file is for.
 *
 * - Clicking a request opens the file at the request's line (`miniAppWorkspace.openFile` with `line`): the
 *   editor that is already open scrolls there rather than opening a second tab.
 * - "Run" sends it with curl in the chat's terminal.
 */
export function RequestPanel({
  sessionId,
  path,
  state,
}: {
  sessionId: string
  path: string
  state: FileRequests
}) {
  const goTo = (request: ParsedRequest) =>
    miniAppWorkspace.openFile({ sessionId, path, line: request.line })
  return (
    <section aria-label="Requests in this file" className="flex max-h-56 min-h-0 flex-col">
      <p className="px-3 py-1.5 text-2xs text-text-faint" role="status">
        {state.error ?? (state.loading ? 'Reading the file…' : countOf(state.requests.length))}
      </p>
      {!state.loading && !state.error && state.requests.length === 0 && (
        <p className="px-3 pb-2 text-2xs text-text-faint">
          Start one with a “### name” line, then “GET https://…”. Save the file to see it here.
        </p>
      )}
      <div role="list" className="min-h-0 overflow-y-auto">
        {state.requests.map((request) => (
          <WorkbenchListRow key={request.line} role="listitem" density="dense">
            <WorkbenchListRowMeta className="w-12 shrink-0 font-mono">
              {request.method}
            </WorkbenchListRowMeta>
            <WorkbenchListRowTrigger
              className="px-0"
              aria-label={`Go to ${request.name}`}
              onClick={() => goTo(request)}
            >
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                {request.name}
              </span>
            </WorkbenchListRowTrigger>
            <WorkbenchListRowActions aria-label={`${request.name} actions`} visibility="always">
              <IconButton
                size="sm"
                aria-label={`Run ${request.name}`}
                tooltip="Run in terminal"
                onClick={() => void runRequest(sessionId, request)}
              >
                <Play />
              </IconButton>
            </WorkbenchListRowActions>
          </WorkbenchListRow>
        ))}
      </div>
    </section>
  )
}
