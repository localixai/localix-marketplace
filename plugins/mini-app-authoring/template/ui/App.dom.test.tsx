import { afterAll, beforeAll, expect, test } from 'bun:test'
import type { PublishedMessageContext } from '@localixai/mini-app-sdk/ui'
import { bindMiniAppUiTransport } from '@localixai/mini-app-sdk/ui/transport'
import { registerDom } from '@localixai/kit/testing'
import { bindMiniAppUiTestDoubles } from '@localixai/mini-app-sdk/ui/testing'
import type { Item } from '../shared/model'

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

/**
 * The collection's routes as the backend answers them: every change answers with the whole list.
 * `sent` records what the screen asked for, so a test checks the request, not only the pixels.
 */
function backend(initial: Item[]) {
  let items = initial
  const sent: { method: string; path: string; body?: unknown }[] = []
  const unbind = bindMiniAppUiTransport({
    url: (path) => path,
    request: async (path, init) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      if (method !== 'GET') sent.push({ method, path, body })
      const id = path.split('/').pop()
      if (method === 'POST') {
        items = [
          ...items,
          { id: 'new', note: '', done: false, createdAt: new Date().toISOString(), ...body },
        ]
      } else if (method === 'PATCH') {
        items = items.map((item) => (item.id === id ? { ...item, ...body } : item))
      } else if (method === 'DELETE') {
        items = items.filter((item) => item.id !== id)
      }
      return Response.json({ items })
    },
  })
  return { sent, unbind }
}

async function render(items: Item[]) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { App } = await import('./App')
  const server = backend(items)
  const contexts: (PublishedMessageContext | null)[] = []
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () =>
    root.render(<App active publishMessageContext={(context) => contexts.push(context)} />),
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

const item = (id: string, title: string, done = false): Item => ({
  id,
  title,
  note: '',
  done,
  createdAt: `2026-11-0${id === 'a' ? 1 : 2}T09:00:00.000Z`,
})

test('shows open items before done ones and tells the agent the same list', async () => {
  const screen = await render([item('a', 'Buy milk', true), item('b', 'Call the dentist')])
  try {
    const rows = [...screen.container.querySelectorAll('li')].map((row) => row.textContent)
    expect(rows).toEqual(['Call the dentist', 'Buy milk'])
    expect(screen.container.textContent).toContain('2 items · 1 open')
    const published = screen.contexts.findLast((context) => context !== null)
    expect(published?.bindings[0]?.target.attributes?.content).toContain(
      '- [ ] Call the dentist (id b)',
    )
  } finally {
    await screen.unmount()
  }
})

test('with nothing yet, says how to add from the chat', async () => {
  const screen = await render([])
  try {
    expect(screen.container.textContent).toContain('Nothing here yet')
    expect(screen.container.textContent).toContain('ask in the chat')
  } finally {
    await screen.unmount()
  }
})

test('adds an item from the form and shows it at once', async () => {
  const screen = await render([])
  try {
    const input = screen.container.querySelector<HTMLInputElement>('input[aria-label="New item"]')!
    await screen.act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Plan the trip')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await screen.act(async () => {
      screen.container.querySelector('form')!.requestSubmit()
    })

    expect(screen.server.sent).toEqual([
      { method: 'POST', path: '/rpc/template/items', body: { title: 'Plan the trip' } },
    ])
    expect(screen.container.textContent).toContain('Plan the trip')
    expect(input.value).toBe('')
  } finally {
    await screen.unmount()
  }
})

test('ticking an item marks it done and sends only that field', async () => {
  const screen = await render([item('b', 'Call the dentist')])
  try {
    const box = screen.container.querySelector<HTMLInputElement>(
      'input[aria-label="Done: Call the dentist"]',
    )!
    await screen.act(async () => box.click())

    expect(screen.server.sent).toEqual([
      { method: 'PATCH', path: '/rpc/template/items/b', body: { done: true } },
    ])
    expect(screen.container.textContent).toContain('1 item · 0 open')
  } finally {
    await screen.unmount()
  }
})

test('removes an item from its row', async () => {
  const screen = await render([item('b', 'Call the dentist')])
  try {
    const remove = screen.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove Call the dentist"]',
    )!
    await screen.act(async () => remove.click())

    expect(screen.server.sent).toEqual([
      expect.objectContaining({ method: 'DELETE', path: '/rpc/template/items/b' }),
    ])
    expect(screen.container.textContent).toContain('Nothing here yet')
  } finally {
    await screen.unmount()
  }
})
