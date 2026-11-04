import { afterAll, beforeAll } from 'bun:test'
import { registerDom } from '@localixai/kit/testing'
import type { PublishedMessageContext } from '@localixai/mini-app-sdk/ui'
import { bindMiniAppUiRuntime, type MiniAppUiRuntime } from '@localixai/mini-app-sdk/ui/runtime'
import { bindMiniAppUiTestDoubles } from '@localixai/mini-app-sdk/ui/testing'
import { bindMiniAppUiTransport } from '@localixai/mini-app-sdk/ui/transport'
import { WorkItemSessionProvider } from '@localixai/mini-app-sdk/ui/work-item-session'
import { APP, type Card, type Stage } from '../shared/model'
import { dayOf } from './format'

/** The chat the board under test belongs to. */
export const CHAT = 'chat-1'

/** Register a DOM, the host's doubles and React's act environment for the file's tests. */
export function setupDom(): void {
  let teardown: () => Promise<void>
  let unbindDoubles: () => void
  const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const prior = env.IS_REACT_ACT_ENVIRONMENT
  beforeAll(() => {
    teardown = registerDom()
    unbindDoubles = bindMiniAppUiTestDoubles()
    env.IS_REACT_ACT_ENVIRONMENT = true
  })
  afterAll(async () => {
    unbindDoubles()
    await teardown()
    if (prior === undefined) delete env.IS_REACT_ACT_ENVIRONMENT
    else env.IS_REACT_ACT_ENVIRONMENT = prior
  })
}

const DAY = 86_400_000
export const card = (over: Partial<Card> & Pick<Card, 'id'>): Card => ({
  title: `Card ${over.id}`,
  note: '',
  assignee: '',
  points: null,
  due: null,
  stage: 'backlog',
  createdAt: `2026-11-0${over.id.replace(/\D/g, '') || 1}T09:00:00.000Z`,
  ...over,
})

/** Four cards over three columns; the days are relative to today so the tests stay true. */
export const fixtureCards = (): Card[] => [
  card({
    id: 'c1',
    title: 'Plan the launch',
    assignee: 'Maya',
    points: 5,
    due: dayOf(Date.now() + 3 * DAY),
  }),
  card({
    id: 'c2',
    title: 'Fix the login bug',
    assignee: 'Daniel',
    points: 3,
    stage: 'doing',
    due: dayOf(Date.now() - 2 * DAY),
  }),
  card({ id: 'c3', title: 'Write the docs', points: 8, stage: 'doing' }),
  card({ id: 'c4', title: 'Ship v1', stage: 'review', note: 'Waiting on QA' }),
]

export interface Write {
  method: string
  path: string
  body: unknown
}

/**
 * The collection's routes as the backend answers them: every change answers with the whole list,
 * and a request names its chat in the query. `cards` is the store; `writes` records what the
 * screen asked for, so a test checks the request and not only the pixels.
 */
export function bindBackend(
  initial: Card[],
  options: { hold?: boolean; failReads?: boolean } = {},
) {
  let release = () => {}
  const store = { cards: initial, writes: [] as Write[], failReads: options.failReads ?? false }
  // `hold` keeps reads waiting until `release()`: the board stays in its loading state.
  const gate = options.hold ? new Promise<void>((resolve) => void (release = resolve)) : null
  const unbind = bindMiniAppUiTransport({
    url: (path) => path,
    request: async (path, init) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      if (method === 'GET' && gate) await gate
      if (method === 'GET' && store.failReads) {
        return Response.json({ error: 'The backend is down.' }, { status: 500 })
      }
      if (method !== 'GET') store.writes.push({ method, path, body })
      const id = path.split('?')[0]!.split('/')[4]
      if (method === 'POST') store.cards = [...store.cards, card({ id: 'new', ...body })]
      if (method === 'PATCH') {
        store.cards = store.cards.map((each) => (each.id === id ? { ...each, ...body } : each))
      }
      if (method === 'DELETE') store.cards = store.cards.filter((each) => each.id !== id)
      return Response.json({ items: store.cards })
    },
  })
  return Object.assign(store, { unbind, release: () => release() })
}

/**
 * The host's realtime socket, reduced to what the store feed needs: it answers a subscribe, and
 * `nudge` delivers a frame the way the host does when something writes the chat's collection.
 */
function bindRealtime() {
  const frames: ((json: string) => void)[] = []
  const unbind = bindMiniAppUiRuntime({
    sessions: { list: () => [], subscribe: () => () => {} },
    realtime: {
      onFrame: (_tag: string, handler: (json: string) => void) => {
        frames.push(handler)
        return () => void frames.splice(frames.indexOf(handler), 1)
      },
      onReconnect: () => () => {},
      onDisconnect: () => () => {},
      request: async () => ({ subscribed: true }),
    },
  } as unknown as MiniAppUiRuntime)
  const nudge = () => {
    const frame = JSON.stringify({ miniApp: APP, sessionId: CHAT })
    for (const handler of frames) handler(frame)
  }
  return { nudge, unbind }
}

/** Mount the board in its chat against the fake backend and socket. */
export async function mount(
  initial: Card[] = fixtureCards(),
  options: Parameters<typeof bindBackend>[1] = {},
) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { App } = await import('./App')
  const server = bindBackend(initial, options)
  const realtime = bindRealtime()
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
  const settle = () =>
    act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))))
  if (!options.hold) await settle()
  return {
    act: (callback: () => unknown) => act(async () => void (await callback())),
    settle,
    container,
    server,
    contexts,
    /** The agent moves a card in the store, and the host nudges the open board. */
    async agentMoves(id: string, stage: Stage) {
      server.cards = server.cards.map((each) => (each.id === id ? { ...each, stage } : each))
      await act(async () => realtime.nudge())
      await settle()
    },
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
      realtime.unbind()
      server.unbind()
    },
  }
}

// DOM helpers: they act the way a person does.
export const byLabel = (label: string, root: ParentNode = document.body): HTMLElement => {
  const found = root.querySelectorAll<HTMLElement>(`[aria-label="${label}"]`)
  if (found.length !== 1) throw new Error(`Expected one "${label}", found ${found.length}`)
  return found[0]!
}
export const byRole = (role: string): HTMLElement[] => [
  ...document.body.querySelectorAll<HTMLElement>(`[role="${role}"]`),
]
export const click = (element: Element) =>
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
export const press = (element: Element, key: string, init: KeyboardEventInit = {}) =>
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
  )
/** Open a Radix menu trigger the way a keyboard does. */
export const openMenu = (trigger: Element) => press(trigger, 'Enter')
export const drag = (element: Element, type: 'dragstart' | 'dragover' | 'drop' | 'dragend') =>
  element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
/** Set a field's value the way typing does, so React sees the change. */
export function setValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
