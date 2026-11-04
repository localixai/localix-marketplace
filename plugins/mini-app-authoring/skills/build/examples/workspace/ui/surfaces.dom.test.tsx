import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createElement, type ReactElement } from 'react'
import { bindMiniAppUiComponents } from '@localixai/mini-app-sdk/ui/components'
import {
  bindMiniAppUiRuntime,
  type MiniAppOpenFileRequest,
  type MiniAppUiRuntime,
} from '@localixai/mini-app-sdk/ui/runtime'
import { bindMiniAppUiTestDoubles } from '@localixai/mini-app-sdk/ui/testing'
import { bindMiniAppUiTransport } from '@localixai/mini-app-sdk/ui/transport'
import { registerDom } from '@localixai/kit/testing'
import type { SavedRequest } from '../shared/model'

let teardown: () => Promise<void>
let unbindDoubles: () => void
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const priorActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
beforeAll(() => {
  teardown = registerDom()
  unbindDoubles = bindMiniAppUiTestDoubles()
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})
afterAll(async () => {
  unbindDoubles()
  await teardown()
  if (priorActEnvironment === undefined) delete actEnvironment.IS_REACT_ACT_ENVIRONMENT
  else actEnvironment.IS_REACT_ACT_ENVIRONMENT = priorActEnvironment
})

const FILE =
  '### List users\nGET https://api.example.com/users\n\n### Add\nPOST https://api.example.com/users\n\n{"a":1}\n'

const opened: MiniAppOpenFileRequest[] = []
const spawned: { command: string; sessionId: string; title?: string }[] = []
const unbinders: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const unbind of unbinders.splice(0).reverse()) await unbind()
  opened.length = 0
  spawned.length = 0
})

/** The host as the panels see it: files to read, a terminal to spawn in, a workspace to open in. */
function bindHost(files: Record<string, string>) {
  const noop = () => undefined
  unbinders.push(
    bindMiniAppUiRuntime({
      workspace: { openFile: (request: MiniAppOpenFileRequest) => opened.push(request) },
      terminal: {
        spawnCommand: async (request: { command: string; sessionId: string; title?: string }) => {
          spawned.push(request)
          return { terminalId: 't-1' }
        },
      },
      files: {
        read: async (_session: string, path: string) => ({
          path,
          content: files[path] ?? '',
          bytes: 0,
          truncated: false,
        }),
        // A live watcher: the panel then never polls for the file.
        watchWorkspace: (_session: string, handlers: { onLive?: (live: boolean) => void }) => {
          handlers.onLive?.(true)
          return noop
        },
      },
    } as unknown as MiniAppUiRuntime),
    // The host's file tab is the host's to draw: the double draws the panel docked beneath it.
    bindMiniAppUiComponents({
      FileTab: ({ path, bottomPanel }) =>
        createElement('div', { 'aria-label': `Editor ${path}` }, bottomPanel),
      TableGrid: () => null,
      ContextBindingIcon: () => null,
      ContextBindingPreview: () => null,
      Input: () => null,
      Textarea: () => null,
      ProblemLine: () => null,
      ProblemState: () => null,
    }),
  )
}

/**
 * Let the read the panel started land. The sync engine schedules its reads on a zero-delay timer,
 * so each turn yields one macrotask (a yield, not a wait) inside `act`, until the panel has left
 * its loading line.
 */
async function flush(act: (callback: () => Promise<void>) => Promise<void>, container: Element) {
  for (let turn = 0; turn < 50 && /Reading the file/.test(container.textContent ?? ''); turn++)
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))))
}

async function render(element: ReactElement) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(element))
  await flush(act, container)
  unbinders.push(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  return { act, container }
}

const byLabel = (container: Element, label: string) =>
  container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!

describe('the .http editor', () => {
  test('lists the requests in the saved file, opens the file at one, and runs one with curl', async () => {
    bindHost({ 'api/users.http': FILE })
    const { HttpFileTab } = await import('./HttpFileTab')
    const { act, container } = await render(
      <HttpFileTab sessionId="chat-a" path="api/users.http" />,
    )

    expect(container.querySelector('[role="status"]')?.textContent).toBe('2 requests')
    await act(async () => byLabel(container, 'Go to Add').click())
    expect(opened).toEqual([{ sessionId: 'chat-a', path: 'api/users.http', line: 5 }])

    await act(async () => byLabel(container, 'Run Add').click())
    expect(spawned).toEqual([
      {
        sessionId: 'chat-a',
        title: 'POST Add',
        command: `curl -sS -i -X POST 'https://api.example.com/users' --data-raw '{"a":1}'`,
      },
    ])
  })

  test('says how to start when the file holds no request', async () => {
    bindHost({ 'empty.http': '# nothing yet\n' })
    const { HttpFileTab } = await import('./HttpFileTab')
    const { container } = await render(<HttpFileTab sessionId="chat-a" path="empty.http" />)
    expect(container.querySelector('[role="status"]')?.textContent).toBe('0 requests')
    expect(container.textContent).toContain('Start one with a “### name” line')
  })
})

describe('the strip above the composer', () => {
  const saved = (id: string, name: string, createdAt: string): SavedRequest => ({
    id,
    name,
    method: 'GET',
    url: `https://example.com/${id}`,
    headers: [],
    body: '',
    createdAt,
  })

  function bindRequests(items: SavedRequest[]) {
    const urls: string[] = []
    unbinders.push(
      bindMiniAppUiTransport({
        url: (path) => path,
        request: async (path) => {
          urls.push(path)
          return Response.json({ items })
        },
      }),
    )
    return urls
  }

  test('counts this chat’s requests and runs one in this chat’s terminal', async () => {
    bindHost({})
    const urls = bindRequests([
      saved('a', 'Old', '2026-11-01T09:00:00.000Z'),
      saved('b', 'New', '2026-11-02T09:00:00.000Z'),
    ])
    const { RequestsStrip } = await import('./RequestsStrip')
    const { act, container } = await render(
      <RequestsStrip sessionId="chat-a" context={{ isFocused: true }} />,
    )

    expect(urls).toContain('/rpc/example-workspace/requests?sessionId=chat-a')
    expect(container.textContent).toContain('2 requests · latest: New')
    await act(async () => byLabel(container, 'Run Old').click())
    expect(spawned).toEqual([expect.objectContaining({ sessionId: 'chat-a', title: 'GET Old' })])
  })

  test('shows nothing for a composer that is not focused, or a chat with no request', async () => {
    bindHost({})
    const urls = bindRequests([])
    const { RequestsStrip } = await import('./RequestsStrip')
    const background = await render(
      <RequestsStrip sessionId="chat-a" context={{ isFocused: false }} />,
    )
    expect(background.container.textContent).toBe('')
    expect(urls).toEqual([])
    const empty = await render(<RequestsStrip sessionId="chat-a" context={{ isFocused: true }} />)
    expect(empty.container.textContent).toBe('')
  })
})

describe('the save tool’s card', () => {
  const item = (output: unknown, extra: object = {}) =>
    ({
      id: 'call-1',
      type: 'tool_call',
      tool: 'example_workspace_save_request',
      input: { name: 'Ping', method: 'GET', url: 'https://example.com/ping' },
      output,
      ...extra,
    }) as never

  test('names what was saved and runs it in the chat it was saved to', async () => {
    bindHost({})
    const { SaveRequestCard } = await import('./ToolCard')
    const { act, container } = await render(
      <SaveRequestCard item={item({ sessionId: 'chat-a', count: 3 })} />,
    )
    expect(container.textContent).toContain('Saved: Ping')
    expect(container.textContent).toContain('3 requests')
    await act(async () => byLabel(container, 'Run in terminal').click())
    expect(spawned).toEqual([expect.objectContaining({ sessionId: 'chat-a', title: 'GET Ping' })])
  })

  test('offers no Run when the chat it ran in is not known', async () => {
    bindHost({})
    const { SaveRequestCard } = await import('./ToolCard')
    const { container } = await render(<SaveRequestCard item={item('plain text output')} />)
    expect(container.textContent).toContain('Saved: Ping')
    expect(container.querySelector('[aria-label="Run in terminal"]')).toBeNull()
  })
})
