import { Hono, type Context } from 'hono'
import {
  jsonBody,
  type AgentToolExecutionContext,
  type MiniAppContext,
  type MiniAppRouteContext,
} from '@localixai/mini-app-sdk/backend'

/**
 * The board over MCP, for a coding agent Localix starts in this chat (Claude Code reads it from
 * `--mcp-config`). Streamable HTTP without a stream: each POST is one JSON-RPC message and its
 * reply is plain JSON. It serves the same `kanban` tool the chat's own agent has, acting on the
 * chat the host resolved for the request — so it can only ever reach that chat's board.
 */

interface BoardTool {
  name: string
  description: string
  inputSchema: { safeParse(value: unknown): { success: boolean; data?: unknown; error?: unknown } }
  execute(
    toolCallId: string,
    input: never,
    signal?: AbortSignal,
    onUpdate?: undefined,
    context?: AgentToolExecutionContext,
  ): Promise<{ content: unknown; isError?: boolean }>
}

/** Who the board records as the actor: the coding agent the person started in this chat. */
const AGENT = { agentId: 'external:claude-code', name: 'Claude Code' }
const SERVER = { name: 'localix-board', version: '0.1.0' }
const PROTOCOL = '2025-06-18'

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any }

const reply = (id: Message['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result })
const failure = (id: Message['id'], code: number, message: string) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
})

function text(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : JSON.stringify(part)))
      .join('\n')
  return JSON.stringify(content)
}

export function createBoardMcp(
  z: MiniAppContext['z'],
  toolFor: (userId: string) => BoardTool,
): Hono<MiniAppRouteContext> {
  const answer = async (c: Context<MiniAppRouteContext>, message: Message) => {
    const sessionId = c.env.sessionId as string
    const tool = toolFor(c.env.userId)
    switch (message.method) {
      case 'initialize':
        return reply(message.id, {
          protocolVersion:
            typeof message.params?.protocolVersion === 'string'
              ? message.params.protocolVersion
              : PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER,
          instructions:
            "This chat's task board. Keep it current: epics for milestones, tasks with checklists, take a card before working it, tick items as they are done, complete or block it.",
        })
      case 'ping':
        return reply(message.id, {})
      case 'tools/list':
        return reply(message.id, {
          tools: [
            {
              name: tool.name,
              description: tool.description,
              inputSchema: z.toJSONSchema(tool.inputSchema as never, { io: 'input' }),
            },
          ],
        })
      case 'tools/call': {
        if (message.params?.name !== tool.name)
          return failure(message.id, -32602, `Unknown tool: ${String(message.params?.name)}`)
        const parsed = tool.inputSchema.safeParse(message.params?.arguments ?? {})
        if (!parsed.success)
          return reply(message.id, {
            content: [{ type: 'text', text: `Invalid arguments: ${String(parsed.error)}` }],
            isError: true,
          })
        try {
          const result = await tool.execute(
            `mcp-${String(message.id)}`,
            parsed.data as never,
            undefined,
            undefined,
            { session: { id: sessionId, scratchDir: '', agent: AGENT } },
          )
          return reply(message.id, {
            content: [{ type: 'text', text: text(result.content) }],
            isError: result.isError === true,
          })
        } catch (error) {
          return reply(message.id, {
            content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
            isError: true,
          })
        }
      }
      default:
        return failure(message.id, -32601, `Method not found: ${String(message.method)}`)
    }
  }

  const message = z
    .object({
      jsonrpc: z.string().optional(),
      id: z.union([z.string(), z.number(), z.null()]).optional(),
      method: z.string().optional(),
      params: z.any().optional(),
    })
    .passthrough()
  const body = z.union([message, z.array(message)])

  return new Hono<MiniAppRouteContext>()
    .get('/mcp', (c) => c.body(null, 405))
    .post('/mcp', jsonBody(body), async (c) => {
      if (!c.env.sessionId)
        return c.json(
          failure(null, -32001, 'This board belongs to a chat that is not available.'),
          404,
        )
      const sent = c.req.valid('json') as Message | Message[]
      const messages = Array.isArray(sent) ? sent : [sent]
      const requests = messages.filter((m) => m.id !== undefined && m.id !== null)
      // Notifications and responses alone are acknowledged with no body.
      if (requests.length === 0) return c.body(null, 202)
      const replies = await Promise.all(requests.map((m) => answer(c, m)))
      return c.json(Array.isArray(sent) ? replies : replies[0])
    })
}
