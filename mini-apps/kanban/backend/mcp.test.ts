import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { MiniAppContext, MiniAppRouteScope } from '@localixai/mini-app-sdk/backend'

import { register } from './index'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** The board's routes as the host mounts them, with the scope the host resolved for the chat. */
function mcp(sessionId: string | null = 's1') {
  const root = mkdtempSync(join(tmpdir(), 'kanban-mcp-'))
  roots.push(root)
  const ctx = {
    userId: 'u1',
    z,
    sessionStorage: {
      resolveDataDir: async (_user: string, session: string) => join(root, session),
    },
    agents: { list: async () => [] },
    defineTool: (definition: unknown) => definition,
    ui: { offer: (destination: object) => ({ type: 'ui.navigate', ...destination }) },
    log: () => {},
  } as unknown as MiniAppContext
  const app = register(ctx).backend?.[0]?.routeMount?.app
  if (!app) throw new Error('no routes')
  const scope: MiniAppRouteScope = {
    userId: 'u1',
    ...(sessionId ? { sessionId } : {}),
    projectId: '',
    cwd: '/',
  }
  let id = 0
  const call = async (method: string, params?: object) => {
    const response = await app.request(
      '/mcp',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, ...(params ? { params } : {}) }),
      },
      scope,
    )
    return { status: response.status, body: (await response.json()) as Record<string, any> }
  }
  const board = async () =>
    (await (await app.request('/board', {}, scope)).json()) as { tasks: { title: string }[] }
  return { call, board, app, scope }
}

test('an MCP client sees the board as one tool and its cards land on this chat’s board', async () => {
  const board = mcp()
  const init = await board.call('initialize', { protocolVersion: '2025-06-18', capabilities: {} })
  expect(init.body.result.capabilities.tools).toBeDefined()
  expect(init.body.result.serverInfo.name).toBe('localix-board')

  const listed = await board.call('tools/list')
  expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['kanban'])
  expect(listed.body.result.tools[0].inputSchema.properties.action).toBeDefined()

  const created = await board.call('tools/call', {
    name: 'kanban',
    arguments: { action: 'create', title: 'Login page', items: ['Form', 'Validation'] },
  })
  expect(created.body.result.isError).toBe(false)
  expect(created.body.result.content[0].type).toBe('text')
  expect((await board.board()).tasks.map((task) => task.title)).toEqual(['Login page'])
})

test('a notification is accepted with no reply, and an unknown method is an error', async () => {
  const board = mcp()
  const note = await board.app.request(
    '/mcp',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    },
    board.scope,
  )
  expect(note.status).toBe(202)
  expect((await board.call('resources/list')).body.error.code).toBe(-32601)
})

test('bad arguments come back as a tool error, and a chat that is not available has no board', async () => {
  const board = mcp()
  const bad = await board.call('tools/call', { name: 'kanban', arguments: { action: 'fly' } })
  expect(bad.body.result.isError).toBe(true)
  const none = mcp(null)
  expect((await none.call('tools/list')).status).toBe(404)
})
