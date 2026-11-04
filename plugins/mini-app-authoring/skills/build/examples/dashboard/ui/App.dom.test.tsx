import { afterAll, beforeAll, expect, test } from 'bun:test'
import { registerDom } from '@localixai/kit/testing'
import type { PublishedMessageContext } from '@localixai/mini-app-sdk/ui'
import { bindMiniAppUiTestDoubles } from '@localixai/mini-app-sdk/ui/testing'
import { bindMiniAppUiTransport } from '@localixai/mini-app-sdk/ui/transport'
import { NOW, fixtureExpenses } from '../shared/fixtures'
import { summarize, type Expense } from '../shared/model'
import { describeSummary } from '../shared/report'

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

/**
 * Mount the screen against a fake `/summary` route. The route answers with the real `summarize` at
 * a fixed "now", so the figures a test states are the figures the backend would compute.
 * `hold` keeps the first read waiting (the loading state); `failReads` makes reads answer 500.
 */
async function open(options: { expenses?: Expense[]; hold?: boolean; failReads?: boolean } = {}) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { App } = await import('./App')
  const state = { failReads: options.failReads ?? false, release: () => {} }
  const gate = options.hold ? new Promise<void>((resolve) => (state.release = resolve)) : null
  const expenses = options.expenses ?? fixtureExpenses()
  const unbind = bindMiniAppUiTransport({
    url: (path) => path,
    request: async (path) => {
      if (gate) await gate
      if (state.failReads) return Response.json({ error: 'Backend is down.' }, { status: 500 })
      if (path.endsWith('/summary')) return Response.json(summarize(expenses, NOW))
      return Response.json({ error: 'No such route.' }, { status: 404 })
    },
  })
  const contexts: (PublishedMessageContext | null)[] = []
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))))
  await act(async () =>
    root.render(<App active publishMessageContext={(context) => contexts.push(context)} />),
  )
  if (!options.hold) await settle()
  return {
    act,
    container,
    contexts,
    state,
    settle,
    text: () => container.textContent ?? '',
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
      unbind()
    },
  }
}

test('the stat cards show formatted figures, not raw numbers', async () => {
  const screen = await open()
  try {
    expect(screen.text()).toContain('Spent$2.3K')
    expect(screen.text()).toContain('4 expenses')
    expect(screen.text()).toContain('Against last month+28%')
    expect(screen.text()).toContain('On pace for$4.6K')
    expect(screen.text()).toContain('Largest$1.5K')
    expect(screen.text()).not.toContain('2300')
  } finally {
    await screen.unmount()
  }
})

test('the category chart names each category and formats its value', async () => {
  const screen = await open()
  try {
    for (const [category, value] of [
      ['Housing', '$1.5K'],
      ['Food', '$500'],
      ['Fun', '$300'],
    ]) {
      expect(screen.text()).toContain(`${category}${value}`)
    }
  } finally {
    await screen.unmount()
  }
})

test('the monthly trend says "month", never "day"', async () => {
  const screen = await open()
  try {
    expect(screen.text()).toContain('peak $2.3K/month')
    expect(screen.text()).not.toContain('/day')
  } finally {
    await screen.unmount()
  }
})

test('budgets pair a coloured bar with a number and a word', async () => {
  const screen = await open()
  try {
    expect(screen.text()).toContain('$300 of $250')
    expect(screen.text()).toContain('120% · Over budget')
    expect(screen.text()).toContain('83% · Close to the limit')
    expect(screen.text()).toContain('79% · Within budget')
    const bar = document.querySelector('[aria-label="Fun: 120% of budget"]')
    expect(bar?.getAttribute('role')).toBe('progressbar')
    // This month, Housing, Food, Transport, Health, Fun, Other.
    const verdicts = [...screen.container.querySelectorAll('p.text-2xs.font-medium')]
    expect(verdicts.map((el) => el.className.match(/text-status-(\w+)/)?.[1])).toEqual([
      'success',
      'error',
      'warning',
      'success',
      'success',
      'error',
      'success',
    ])
  } finally {
    await screen.unmount()
  }
})

test('the insights explain the numbers in words', async () => {
  const screen = await open()
  try {
    expect(screen.text()).toContain('$2,300 spent in November 2026, +28% against October.')
    expect(screen.text()).toContain('Fun is $50 over its $250 budget.')
  } finally {
    await screen.unmount()
  }
})

test('the agent is told what the screen shows, in the words of its report tool', async () => {
  const screen = await open()
  try {
    const published = screen.contexts.findLast((context) => context !== null)
    expect(published?.bindings[0]?.target.attributes?.content).toBe(
      describeSummary(summarize(fixtureExpenses(), NOW)),
    )
  } finally {
    await screen.unmount()
  }
})

test('with nothing recorded it says how to start instead of drawing empty charts', async () => {
  const screen = await open({ expenses: [] })
  try {
    expect(screen.text()).toContain('No spending yet')
    expect(screen.text()).not.toContain('Budgets')
  } finally {
    await screen.unmount()
  }
})

test('a failed read offers a retry that brings the numbers back', async () => {
  const screen = await open({ failReads: true })
  try {
    expect(screen.text()).toContain('The numbers are not available')
    screen.state.failReads = false
    const retry = [...screen.container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Try again',
    )!
    await screen.act(async () => {
      retry.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    await screen.settle()
    expect(screen.text()).toContain('This month')
    expect(screen.text()).toContain('Spent$2.3K')
  } finally {
    await screen.unmount()
  }
})

test('while the first read is in flight it shows a skeleton shaped like the dashboard', async () => {
  const screen = await open({ hold: true })
  try {
    expect(screen.text()).not.toContain('Spent$')
    expect(screen.container.querySelector('[aria-hidden="true"]')).not.toBeNull()
    screen.state.release()
    await screen.settle()
    expect(screen.text()).toContain('Spent$2.3K')
  } finally {
    await screen.unmount()
  }
})
