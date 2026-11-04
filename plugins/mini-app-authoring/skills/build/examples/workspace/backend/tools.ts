import type { Collection, MiniAppContext } from '@localixai/mini-app-sdk/backend'
import { curlCommand } from '../shared/http'
import {
  SAVE_TOOL,
  asRequest,
  describeForAgent,
  requestInputSchema,
  type SavedRequest,
} from '../shared/model'
import type { requestsSpec } from './requests'

type Requests = Collection<SavedRequest, (typeof requestsSpec)['input']['shape']>

/**
 * The agent's tools. They act on the chat the call RUNS in (`context.session.id`), never on a chat
 * the person happens to have open, so an agent can only ever touch its own chat's requests.
 *
 * A save also returns `details` with the session and the stored request. The transcript's card
 * (ui/ToolCard.tsx) reads them to offer "Run in terminal" for the right chat.
 */
export function createTools(ctx: MiniAppContext, requests: Requests) {
  const { z } = ctx
  const write = {
    executionMode: 'sequential',
    mutates: true,
    classify: () => ({ effect: 'host' as const }),
    permissionPaths: () => [],
  } as const
  const read = { executionMode: 'parallel', mutates: false, permissionPaths: () => [] } as const
  const chatOf = (context: { session?: { id: string } } | undefined) => {
    const sessionId = context?.session?.id
    return sessionId ? { userId: ctx.userId, sessionId } : null
  }
  const noChat = { content: 'This tool works inside a chat; this call has none.', isError: true }

  return [
    ctx.defineTool({
      ...write,
      name: SAVE_TOOL,
      label: 'Save a request',
      activeVerb: 'Saving a request',
      description:
        'Save one HTTP request to this chat: a name, the method, the URL, optional headers ("Name: value") and body. The person can run it with curl from the strip above the composer, and @-mention it later.',
      inputSchema: requestInputSchema.extend({
        name: requestInputSchema.shape.name.describe('What the request does, in a few words.'),
      }),
      async execute(_toolCallId, input, _signal, _onUpdate, context) {
        const where = chatOf(context)
        if (!where) return noChat
        const saved = await requests.add(input, where)
        const all = await requests.list(where)
        return {
          content: `Saved "${saved.name}".\n${describeForAgent(all)}`,
          details: { sessionId: where.sessionId, request: saved, count: all.length },
        }
      },
    }),
    ctx.defineTool({
      ...read,
      name: 'example_workspace_list_requests',
      label: 'List requests',
      activeVerb: 'Reading the saved requests',
      description: 'Read this chat’s saved requests with their ids.',
      inputSchema: z.object({}),
      async execute(_toolCallId, _input, _signal, _onUpdate, context) {
        const where = chatOf(context)
        if (!where) return noChat
        return { content: describeForAgent(await requests.list(where)) }
      },
    }),
    ctx.defineTool({
      ...read,
      name: 'example_workspace_curl_request',
      label: 'Show the curl command',
      activeVerb: 'Preparing a command',
      description:
        'Read the curl command for a saved request by its id, to run it yourself or hand it to the person.',
      inputSchema: z.object({ id: z.string().min(1) }),
      async execute(_toolCallId, { id }, _signal, _onUpdate, context) {
        const where = chatOf(context)
        if (!where) return noChat
        const found = await requests.get(id, where)
        if (!found) return notFound
        return { content: curlCommand(asRequest(found)) }
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'example_workspace_remove_request',
      label: 'Remove a request',
      activeVerb: 'Removing a request',
      description: 'Remove one saved request by its id.',
      inputSchema: z.object({ id: z.string().min(1) }),
      async execute(_toolCallId, { id }, _signal, _onUpdate, context) {
        const where = chatOf(context)
        if (!where) return noChat
        if (!(await requests.remove(id, where))) return notFound
        return { content: `Removed it.\n${describeForAgent(await requests.list(where))}` }
      },
    }),
  ]
}

const notFound = {
  content: 'No saved request has that id. Read example_workspace_list_requests for the ids.',
  isError: true,
}
