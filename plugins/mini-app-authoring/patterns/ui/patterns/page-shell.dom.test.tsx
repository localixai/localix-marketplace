import { expect, test } from 'bun:test'
import { byLabel, byRole, byText, choose, click, mount, setValue, setupDom } from './test-support'

setupDom()

const open = (onNewDeal?: () => void, options: Parameters<typeof mount>[1] = {}) =>
  mount(async () => {
    const { PageShell } = await import('./page-shell')
    return <PageShell active onNewDeal={onNewDeal} />
  }, options)

const rows = (screen: { container: HTMLElement }) =>
  [...screen.container.querySelectorAll('ul[aria-label$="deals"] li')].map(
    (row) => row.querySelector('p')!.textContent,
  )

test('the header says how much is in play, and the stats follow the current view', async () => {
  const screen = await open()
  try {
    expect(screen.container.textContent).toContain('4 open deals')
    expect(screen.container.textContent).toContain('$377.7K in play')
    expect(rows(screen)).toHaveLength(6)
    expect(screen.container.textContent).toContain('6 deals shown')
  } finally {
    await screen.unmount()
  }
})

test('the tabs split open from closed deals and count them', async () => {
  const screen = await open()
  try {
    const tabs = byRole('tab', screen.container)
    expect(tabs.map((tab) => tab.textContent)).toEqual(['All deals6', 'Open4', 'Closed2'])
    await screen.act(async () => click(tabs[2]!))
    expect(rows(screen)).toEqual(['Platform renewal', 'Warehouse robotics'])
  } finally {
    await screen.unmount()
  }
})

test('searching narrows the list, and a search that finds nothing offers to clear it', async () => {
  const screen = await open()
  try {
    const search = byLabel<HTMLInputElement>('Search deals')
    await screen.act(async () => setValue(search, 'clinic'))
    expect(rows(screen)).toEqual(['Clinic scheduling'])

    await screen.act(async () => setValue(search, 'zzz'))
    expect(screen.container.textContent).toContain('No deals here')
    expect(screen.container.textContent).toContain('Nothing matches these filters.')
    await screen.act(async () => click(byText('Clear filters', 'button', screen.container)))
    expect(rows(screen)).toHaveLength(6)
    expect(search.value).toBe('')
  } finally {
    await screen.unmount()
  }
})

test('a stage filter and the primary action', async () => {
  let asked = 0
  const screen = await open(() => (asked += 1))
  try {
    await choose(screen, byLabel('Filter by stage'), 'Proposal')
    expect(rows(screen)).toEqual(['Fleet tracking', 'Clinic scheduling'])
    await screen.act(async () => click(byText('New deal', 'button', screen.container)))
    expect(asked).toBe(1)
  } finally {
    await screen.unmount()
  }
})

test('a failed first read says so and retries on request', async () => {
  const screen = await open(undefined, { failReads: true })
  try {
    expect(screen.container.textContent).toContain('Deals could not be loaded')
    expect(rows(screen)).toEqual([])
    screen.backend.failReads = false
    await screen.act(async () => click(byText('Try again', 'button', screen.container)))
    await screen.settle()
    expect(rows(screen)).toHaveLength(6)
    expect(screen.container.textContent).not.toContain('could not be loaded')
  } finally {
    await screen.unmount()
  }
})
