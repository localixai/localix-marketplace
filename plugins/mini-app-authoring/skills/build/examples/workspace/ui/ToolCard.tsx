import type { ComponentProps } from 'react'
import { Play, Send } from 'lucide-react'
import type { ToolCardContribution } from '@localixai/mini-app-sdk/ui'
import {
  ErrorRow,
  IORow,
  OutputBlock,
  ToolBody,
  ToolHeaderAction,
  ToolLine,
  hasItemError,
  isItemStreaming,
  itemErrorMessage,
} from '@localixai/kit/tool-card'
import { methodSchema, type HttpRequest } from '../shared/http'
import { countOf } from '../shared/model'
import { runRequest } from './terminal'

/** The call the transcript renders — the host's own item shape, as its card seam declares it. */
type ToolCallItem = ComponentProps<NonNullable<ToolCardContribution['Component']>>['item']

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined

/**
 * One call of `example_workspace_save_request` in the transcript, built from the kit's tool-card
 * parts so it reads like every built-in card: `ToolLine` is the row, `ToolBody` what opens under
 * it, `IORow` labels a section "In" (what the call was given) or "Out" (what came back), and
 * `ErrorRow` shows a failure.
 *
 * It PARSES `item.input` and `item.output`: both come from a stored transcript, written by
 * whatever build ran the call, so nothing here trusts them to match today's types. The tool's
 * `details` carry the chat it ran in; the header's Run is offered only when it is known, and opens
 * the terminal of THAT chat, not of the one on screen.
 */
export function SaveRequestCard({ item }: { item: ToolCallItem }) {
  const input = record(item.input)
  const details = record(item.output)
  const streaming = isItemStreaming(item)
  const hasError = hasItemError(item)

  const method = methodSchema.safeParse(input.method)
  const request: HttpRequest | null =
    method.success && text(input.url)
      ? {
          name: text(input.name) ?? 'Request',
          method: method.data,
          url: text(input.url)!,
          headers: Array.isArray(input.headers)
            ? input.headers.filter((h) => typeof h === 'string')
            : [],
          body: text(input.body) ?? '',
        }
      : null
  const sessionId = text(details.sessionId)
  const count = typeof details.count === 'number' ? details.count : undefined

  return (
    <ToolLine
      icon={Send}
      title={`Saved: ${request?.name ?? 'a request'}`}
      titleDetails={request ? `${request.method} ${request.url}` : undefined}
      subtitle={streaming ? '…' : hasError ? 'Failed' : count ? countOf(count) : 'Done'}
      isLoading={streaming}
      hasError={hasError}
      headerActions={
        sessionId && request && !hasError ? (
          <ToolHeaderAction
            icon={Play}
            label="Run in terminal"
            onClick={() => void runRequest(sessionId, request)}
          />
        ) : undefined
      }
    >
      <ToolBody>
        {request && (
          <IORow label="In">
            <OutputBlock>{`${request.method} ${request.url}${request.body ? `\n\n${request.body}` : ''}`}</OutputBlock>
          </IORow>
        )}
        <ErrorRow message={itemErrorMessage(item)} />
      </ToolBody>
    </ToolLine>
  )
}
