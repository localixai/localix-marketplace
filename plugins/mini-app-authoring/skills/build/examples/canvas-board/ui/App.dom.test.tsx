import { afterAll, beforeAll, expect, test } from 'bun:test'
import type { PublishedMessageContext } from '@localixai/mini-app-sdk/ui'
import { bindMiniAppUiTransport } from '@localixai/mini-app-sdk/ui/transport'
import { bindMiniAppUiTestDoubles } from '@localixai/mini-app-sdk/ui/testing'
import { registerDom } from '@localixai/kit/testing'
import type { Link, Note } from '../shared/model'

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

const CHAT = 'chat-a'
const note = (id: string, text: string, x = 0): Note => ({ id, text, x, y: 0, tone: 'neutral' })

/**
 * The chat's collections as the backend answers them: every change answers with the whole list.
 * `sent` records what the screen asked for, so a test checks the request as well as the pixels.
 */
function backend(initial: { notes: Note[]; links?: Link[] }) {
  const lists: Record<string, { id: string }[]> = {
    notes: initial.notes,
    links: initial.links ?? [],
    looks: [],
  }
  const sent: { method: string; path: string; sessionId: string | null; body?: unknown }[] = []
  const unbind = bindMiniAppUiTransport({
    url: (path) => path,
    request: async (target, init) => {
      const [path = '', query = ''] = target.split('?')
      const [, , , name = '', id] = path.split('/')
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      const sessionId = new URLSearchParams(query).get('sessionId')
      if (method !== 'GET') sent.push({ method, path, sessionId, body })
      const list = lists[name] ?? []
      if (method === 'POST') list.push({ id: `new-${list.length}`, tone: 'neutral', ...body })
      if (method === 'DELETE') lists[name] = list.filter((item) => item.id !== id)
      return Response.json({ items: lists[name] })
    },
  })
  return { sent, unbind }
}

async function render(initial: { notes: Note[]; links?: Link[] }) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { WorkItemSessionProvider } = await import('@localixai/mini-app-sdk/ui/work-item-session')
  const { App } = await import('./App')
  const server = backend(initial)
  const contexts: (PublishedMessageContext | null)[] = []
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () =>
    root.render(
      <WorkItemSessionProvider sessionId={CHAT}>
        <App active publishMessageContext={(context) => contexts.push(context)} />
      </WorkItemSessionProvider>,
    ),
  )
  return {
    act,
    container,
    server,
    contexts,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
      server.unbind()
    },
  }
}

test('an empty board invites a first note, and adds it where the next slot is', async () => {
  const view = await render({ notes: [] })
  expect(view.container.textContent).toContain('An empty board')
  const input = view.container.querySelector<HTMLInputElement>('input[aria-label="New note"]')!
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await view.act(async () => {
    setValue.call(input, 'Ship it')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await view.act(async () => {
    view.container
      .querySelector('form[aria-label="Add a note"]')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  expect(view.server.sent).toEqual([
    {
      method: 'POST',
      path: '/rpc/canvas-board/notes',
      sessionId: CHAT,
      body: { text: 'Ship it', x: 0, y: 0 },
    },
  ])
  await view.unmount()
})

test('the board shows the chat’s notes and tells the agent exactly what it shows', async () => {
  const view = await render({
    notes: [note('a', 'Plan'), note('b', 'Risk', 248)],
    links: [{ id: 'l', from: 'a', to: 'b', label: 'blocks', tone: 'warning' }],
  })
  expect(view.container.textContent).toContain('2 notes · 1 link')
  expect(view.container.textContent).toContain('Plan')
  expect(view.container.textContent).toContain('Risk')
  const published = view.contexts.at(-1)
  expect(JSON.stringify(published)).toContain('Plan -> Risk [blocks] (id l)')
  await view.unmount()
  // Closing the tab clears the context, so a question elsewhere is not about this board.
  expect(view.contexts.at(-1)).toBeNull()
})

test('selecting a note offers to delete it, and its links go with it', async () => {
  const view = await render({
    notes: [note('a', 'Plan'), note('b', 'Risk', 248)],
    links: [{ id: 'l', from: 'a', to: 'b', label: '', tone: 'neutral' }],
  })
  const card = [...view.container.querySelectorAll<HTMLElement>('.react-flow__node')].find((node) =>
    node.textContent?.includes('Plan'),
  )!
  await view.act(async () => card.click())
  const remove = view.container.querySelector<HTMLButtonElement>(
    'button[aria-label="Delete note"]',
  )!
  await view.act(async () => remove.click())
  expect(view.server.sent.map(({ method, path }) => `${method} ${path}`)).toEqual([
    'DELETE /rpc/canvas-board/notes/a',
    'DELETE /rpc/canvas-board/links/l',
  ])
  await view.unmount()
})
