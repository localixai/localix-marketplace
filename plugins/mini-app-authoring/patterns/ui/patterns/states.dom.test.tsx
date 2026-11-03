import { expect, test } from 'bun:test'
import { viewState } from './states-parts'
import { byLabel, byText, click, mount, setValue, setupDom } from './test-support'

setupDom()

const open = (options: Parameters<typeof mount>[1] = {}, onNewDeal?: () => void) =>
  mount(async () => {
    const { States } = await import('./states')
    return <States active onNewDeal={onNewDeal} />
  }, options)

const show = async (screen: Awaited<ReturnType<typeof open>>, label: string) => {
  const radio = [
    ...screen.container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ].find((el) => el.closest('label')?.textContent === label)
  if (!radio) throw new Error(`No state "${label}"`)
  await screen.act(async () => click(radio))
}

test('live data with deals shows the rows', async () => {
  const screen = await open()
  try {
    expect(screen.container.querySelectorAll('ul[aria-label="Deals"] li')).toHaveLength(6)
    expect(screen.container.textContent).not.toContain('No deals')
  } finally {
    await screen.unmount()
  }
})

test('loading shows skeleton rows in a busy region, not a message or a spinner', async () => {
  const screen = await open()
  try {
    await show(screen, 'Loading')
    const region = byLabel('Loading deals')
    expect(region.getAttribute('aria-busy')).toBe('true')
    expect(region.children).toHaveLength(5)
    expect(screen.container.textContent).not.toContain('No deals')
  } finally {
    await screen.unmount()
  }
})

test('empty explains what to do and offers the primary action', async () => {
  let asked = 0
  const screen = await open({}, () => (asked += 1))
  try {
    await show(screen, 'Empty')
    expect(screen.container.textContent).toContain('No deals yet')
    expect(screen.container.textContent).toContain('Add the first deal')
    await screen.act(async () => click(byText('New deal', 'button', screen.container)))
    expect(asked).toBe(1)
    expect(byText('Reload', 'button', screen.container)).toBeTruthy()
  } finally {
    await screen.unmount()
  }
})

test('a real empty pipeline is the empty state without the switch', async () => {
  const screen = await open({ deals: [] })
  try {
    expect(screen.container.textContent).toContain('No deals yet')
  } finally {
    await screen.unmount()
  }
})

test('filtered to nothing says "No deals match" and clearing brings the rows back', async () => {
  const screen = await open()
  try {
    await screen.act(async () => setValue(byLabel<HTMLInputElement>('Search deals'), 'zzz'))
    expect(screen.container.textContent).toContain('No deals match')
    expect(screen.container.textContent).toContain('Nothing matches “zzz”')
    await screen.act(async () => click(byText('Clear filters', 'button', screen.container)))
    expect(screen.container.querySelectorAll('ul[aria-label="Deals"] li')).toHaveLength(6)
    expect(byLabel<HTMLInputElement>('Search deals').value).toBe('')

    await show(screen, 'No matches')
    expect(screen.container.textContent).toContain('No deals match')
  } finally {
    await screen.unmount()
  }
})

test('a load error says why and retrying reads again', async () => {
  const screen = await open({ failReads: true })
  try {
    expect(screen.container.textContent).toContain('Deals could not be loaded')
    expect(screen.container.querySelector('[role="alert"]')).not.toBeNull()
    screen.backend.failReads = false
    await screen.act(async () => click(byText('Try again', 'button', screen.container)))
    await screen.settle()
    expect(screen.container.querySelectorAll('ul[aria-label="Deals"] li')).toHaveLength(6)
  } finally {
    await screen.unmount()
  }
})

test('the simulated error shows the error state and its retry returns to live data', async () => {
  const screen = await open()
  try {
    await show(screen, 'Load error')
    expect(screen.container.textContent).toContain('The pipeline service did not answer in time.')
    await screen.act(async () => click(byText('Try again', 'button', screen.container)))
    await screen.settle()
    expect(screen.container.querySelectorAll('ul[aria-label="Deals"] li')).toHaveLength(6)
  } finally {
    await screen.unmount()
  }
})

test('the transient notice sits above the content and can be dismissed', async () => {
  const screen = await open()
  try {
    expect(screen.container.textContent).not.toContain('Showing the last loaded deals')
    const toggle = screen.container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    await screen.act(async () => click(toggle))
    expect(screen.container.textContent).toContain('Showing the last loaded deals')
    expect(screen.container.querySelectorAll('ul[aria-label="Deals"] li')).toHaveLength(6)
    await screen.act(async () => click(byLabel('Dismiss the notice')))
    expect(screen.container.textContent).not.toContain('Showing the last loaded deals')
  } finally {
    await screen.unmount()
  }
})

test('viewState picks exactly one state, and stale rows beat an error', () => {
  const base = { loading: false, error: null, total: 3, shown: 3, filtering: false }
  expect(viewState({ ...base, loading: true })).toBe('loading')
  expect(viewState({ ...base, error: 'x', total: 0, shown: 0 })).toBe('error')
  expect(viewState({ ...base, error: 'x' })).toBe('ready')
  expect(viewState({ ...base, total: 0, shown: 0 })).toBe('empty')
  expect(viewState({ ...base, shown: 0, filtering: true })).toBe('filtered')
  expect(viewState(base)).toBe('ready')
})
