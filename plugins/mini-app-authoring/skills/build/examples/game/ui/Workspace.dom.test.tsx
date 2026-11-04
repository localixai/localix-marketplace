import { afterAll, beforeAll, expect, test } from 'bun:test'
import type { PublishedMessageContext } from '@localixai/mini-app-sdk/ui'
import { bindMiniAppUiRuntime, type MiniAppUiRuntime } from '@localixai/mini-app-sdk/ui/runtime'
import { bindMiniAppUiTransport } from '@localixai/mini-app-sdk/ui/transport'
import { WorkItemSessionProvider } from '@localixai/mini-app-sdk/ui/work-item-session'
import { registerDom } from '@localixai/kit/testing'

import { dropChip, newGame, type Game } from '../shared/game'

let teardown: () => Promise<void>
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const priorActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
beforeAll(() => {
  teardown = registerDom()
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})
afterAll(async () => {
  await teardown()
  if (priorActEnvironment === undefined) delete actEnvironment.IS_REACT_ACT_ENVIRONMENT
  else actEnvironment.IS_REACT_ACT_ENVIRONMENT = priorActEnvironment
})

const AT = '2026-11-03T10:00:00.000Z'

/** A game reached by playing columns (0-based), the sides alternating from the person. */
function played(columns: number[]): Game {
  let game = newGame({ id: 'g1', first: 'you', now: AT })
  for (const column of columns) game = dropChip(game, column, game.turn, AT)
  return game
}

/**
 * A backend made of the real rules. A drop from the screen places the person's chip and records
 * that the chat was woken; `agentPlays` is the agent's tool landing between two polls. The ACTIVE
 * session the runtime reports is a different chat from the board's own: the board must never
 * address it.
 */
function fakeBackend(start: Game, failFirstRead = false, unreachable?: string) {
  let game = start
  let readFailed = false
  const requests: { path: string; body?: unknown }[] = []
  const unbindTransport = bindMiniAppUiTransport({
    url: (path) => path,
    request: async (path, init) => {
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      requests.push({ path, ...(body ? { body } : {}) })
      if (failFirstRead && !readFailed && path.startsWith('/rpc/example-game/game?')) {
        readFailed = true
        throw new Error('Temporary read failure')
      }
      if (path.startsWith('/rpc/example-game/game/opponent'))
        game = { ...game, opponent: (body as { opponent: Game['opponent'] }).opponent }
      if (path.startsWith('/rpc/example-game/game/drop')) {
        const since = new Date().toISOString()
        game = {
          ...dropChip(game, (body as { column: number }).column, 'you', AT),
          waiting: unreachable
            ? { since, status: 'unreachable', reason: unreachable }
            : { since, status: 'thinking' },
        }
      }
      return Response.json(game)
    },
  })
  const unbindRuntime = bindMiniAppUiRuntime({
    sessions: { list: () => [], subscribe: () => () => {} },
  } as unknown as MiniAppUiRuntime)
  return {
    requests,
    agentPlays: (column: number) => {
      game = dropChip(game, column, 'agent', AT)
    },
    unbind: () => {
      unbindTransport()
      unbindRuntime()
    },
  }
}

async function mount(
  sessionId: string | null,
  options: { start?: Game; failFirstRead?: boolean; unreachable?: string } = {},
) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { Workspace } = await import('./Workspace')
  const backend = fakeBackend(
    options.start ?? newGame({ id: 'g1', first: 'you', now: AT }),
    options.failFirstRead,
    options.unreachable,
  )
  let context: PublishedMessageContext | null = null
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  // The host wraps every mini app tab in the session it BELONGS to.
  const render = (active = true) =>
    act(async () =>
      root.render(
        <WorkItemSessionProvider sessionId={sessionId}>
          <Workspace active={active} publishMessageContext={(next) => (context = next)} />
        </WorkItemSessionProvider>,
      ),
    )
  await render()
  return {
    act,
    host,
    backend,
    context: () => context,
    column: (number: number) =>
      host.querySelector<HTMLButtonElement>(`[aria-label^="Column ${number},"]`),
    chips: () => Array.from(host.querySelectorAll<HTMLElement>('.example-game-chip')),
    render,
    /** Look again now: the next poll, without waiting for its interval. */
    poll: async () => {
      await render(false)
      await render(true)
    },
    unmount: async () => {
      await act(async () => root.unmount())
      host.remove()
      backend.unbind()
    },
  }
}

test('a click drops a chip, wakes the board’s own chat, and the agent’s move lands on the next look', async () => {
  const view = await mount('s1')
  try {
    expect(view.host.querySelector('h1')?.textContent).toBe('Connect Four')
    expect(view.host.textContent).toContain('Your turn')
    // Hover previews where the chip would land.
    expect(view.column(4)?.querySelectorAll('.example-game-ghost')).toHaveLength(1)

    await view.act(async () => view.column(4)!.click())

    // The board's chat, not the one the runtime says is active.
    expect(view.backend.requests.filter(({ path }) => path.includes('/game/drop'))).toEqual([
      { path: '/rpc/example-game/game/drop?sessionId=s1', body: { column: 3 } },
    ])
    expect(view.backend.requests.every(({ path }) => path.endsWith('sessionId=s1'))).toBe(true)
    expect(view.host.textContent).toContain('Thinking')
    // The chip is on the board and animated in; while the agent owes a move no column takes a click.
    expect(view.chips().map((chip) => chip.dataset.by)).toEqual(['you'])
    expect(view.chips()[0]!.dataset.fresh).toBe('true')
    expect(view.column(1)?.getAttribute('aria-disabled')).toBe('true')

    view.backend.agentPlays(3)
    await view.poll()

    expect(view.chips().map((chip) => chip.dataset.by)).toEqual(['agent', 'you'])
    expect(view.column(4)?.getAttribute('aria-label')).toBe('Column 4, 4 free')
    expect(view.host.textContent).toContain('Your turn')
    expect(view.host.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'The agent dropped a chip into column 4.',
    )
    // What the agent reads beside the board is the board on screen.
    expect(JSON.stringify(view.context())).toContain('The user’s turn (X).')
  } finally {
    await view.unmount()
  }
})

test('a game won in front of the person draws its line and celebrates; reopened, it rests', async () => {
  // The person has three on the floor (columns 1–3); the agent has three chips in column 7.
  const before = played([0, 6, 1, 6, 2, 6])
  const view = await mount('s1', { start: before })
  try {
    await view.act(async () => view.column(4)!.click())
    expect(view.host.querySelector('[role="dialog"]')?.textContent).toContain('You won')
    expect(view.host.querySelector('.example-game-line')?.getAttribute('data-fresh')).toBe('true')
    expect(view.host.querySelector('.example-game-confetti')).not.toBeNull()
    expect(view.chips().filter((chip) => chip.dataset.win === 'fresh')).toHaveLength(4)
    expect(view.chips().filter((chip) => chip.dataset.dim === 'true')).toHaveLength(3)
  } finally {
    await view.unmount()
  }

  const reopened = await mount('s1', { start: played([0, 6, 1, 6, 2, 6, 3]) })
  try {
    // The same ended game, shown at rest: the line and the card, but nothing moving.
    expect(reopened.host.querySelector('[role="dialog"]')?.textContent).toContain('You won')
    expect(reopened.host.querySelector('.example-game-line')?.hasAttribute('data-fresh')).toBe(
      false,
    )
    expect(reopened.host.querySelector('.example-game-confetti')).toBeNull()
    expect(reopened.chips().some((chip) => chip.dataset.fresh === 'true')).toBe(false)
  } finally {
    await reopened.unmount()
  }
})

test('a board that belongs to no chat says so, and asks the server nothing', async () => {
  const view = await mount(null)
  try {
    expect(view.host.textContent).toContain('Open the board from a chat')
    expect(view.backend.requests).toEqual([])
  } finally {
    await view.unmount()
  }
})

test('an initial read failure offers a retry that restores the board', async () => {
  const view = await mount('s1', { failFirstRead: true })
  try {
    expect(view.host.textContent).toContain('The board is unavailable')
    const retry = Array.from(view.host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Try again'),
    )
    await view.act(async () => retry!.click())
    expect(view.column(1)).not.toBeNull()
    expect(view.host.textContent).toContain('You play red')
  } finally {
    await view.unmount()
  }
})

test('the arrow keys walk the columns and stop at the edges', async () => {
  const view = await mount('s1')
  try {
    view.column(1)!.focus()
    const press = (key: string) =>
      view.act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      })
    await press('ArrowLeft')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Column 1, 6 free')
    await press('ArrowRight')
    await press('ArrowRight')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Column 3, 6 free')
    for (let i = 0; i < 8; i++) await press('ArrowRight')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Column 7, 6 free')
  } finally {
    await view.unmount()
  }
})

test('an opponent that did not move says why over the board, with a way out', async () => {
  const view = await mount('s1', { unreachable: 'This app cannot wake a chat.' })
  try {
    await view.act(async () => view.column(4)!.click())
    const problem = view.host.querySelector('[data-slot="game-problem"]')!
    expect(problem.getAttribute('role')).toBe('alert')
    expect(problem.textContent).toContain('The agent did not move')
    expect(problem.textContent).toContain('This app cannot wake a chat.')
    // It sits over the board, never in the control row above it.
    expect(view.host.querySelector('[data-slot="game-control-row"]')!.contains(problem)).toBe(false)

    const button = (label: string) =>
      Array.from(problem.querySelectorAll('button')).find((b) => b.textContent?.includes(label))
    expect(button('Ask again')).toBeDefined()
    await view.act(async () => button('Use the decision model')!.click())
    expect(view.backend.requests.some(({ path }) => path.includes('/game/opponent'))).toBe(true)
  } finally {
    await view.unmount()
  }
})
