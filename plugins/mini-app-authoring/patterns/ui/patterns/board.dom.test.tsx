import { expect, test } from 'bun:test'
import {
  byLabel,
  byRole,
  byText,
  click,
  drag,
  mount,
  openMenu,
  press,
  setValue,
  setupDom,
} from './test-support'

setupDom()

const open = (options: Parameters<typeof mount>[1] = {}) =>
  mount(async () => {
    const { Board } = await import('./board')
    return <Board active />
  }, options)

const column = (screen: { container: HTMLElement }, name: string) =>
  screen.container.querySelector<HTMLElement>(`section[aria-label^="${name},"]`)!
const titles = (section: HTMLElement) =>
  [...section.querySelectorAll('article p.line-clamp-2')].map((p) => p.textContent)

test('each column shows its cards, their count and the total of its deals in USD', async () => {
  const screen = await open()
  try {
    expect(titles(column(screen, 'Proposal'))).toEqual(['Fleet tracking', 'Clinic scheduling'])
    expect(column(screen, 'Proposal').getAttribute('aria-label')).toBe('Proposal, 2 deals')
    expect(column(screen, 'Lead').getAttribute('aria-label')).toBe('Lead, 1 deal')
    // 84,000 + 127,000 USD
    expect(column(screen, 'Proposal').querySelector('header')!.textContent).toContain('$211K')
    // €41,500 at the demo rate
    expect(column(screen, 'Qualified').querySelector('header')!.textContent).toContain('$44.8K')
    const card = column(screen, 'Proposal').querySelector('article')!
    expect(card.textContent).toContain('$84,000')
    expect(card.querySelector('time')!.textContent).toBe('in 5d')
  } finally {
    await screen.unmount()
  }
})

test('a card moves to another stage from its menu, and the backend is asked for exactly that', async () => {
  const screen = await open()
  try {
    await screen.act(async () => openMenu(byLabel('Actions for Fleet tracking')))
    const choices = byRole('menuitem').map((item) => item.textContent)
    expect(choices).toEqual(['Move to Lead', 'Move to Qualified', 'Move to Won', 'Move to Lost'])
    await screen.act(async () => click(byText('Move to Qualified', '[role="menuitem"]')))
    await screen.settle()

    expect(screen.backend.writes).toEqual([
      { method: 'PATCH', path: '/rpc/ui-patterns/deals/d1', body: { stage: 'qualified' } },
    ])
    expect(titles(column(screen, 'Qualified'))).toContain('Fleet tracking')
    expect(titles(column(screen, 'Proposal'))).toEqual(['Clinic scheduling'])
    expect(screen.container.querySelector('[role="status"]')!.textContent).toBe(
      'Moved Fleet tracking to Qualified.',
    )
  } finally {
    await screen.unmount()
  }
})

test('Alt+Arrow moves the focused card one column, and stops at the last', async () => {
  const screen = await open()
  try {
    const card = byLabel('Platform renewal, Quartz, $72,000')
    await screen.act(async () => press(card, 'ArrowRight', { altKey: true }))
    await screen.settle()
    expect(screen.backend.writes).toEqual([
      { method: 'PATCH', path: '/rpc/ui-patterns/deals/d5', body: { stage: 'lost' } },
    ])
    // Lost is the last column: nothing further to move to.
    await screen.act(async () =>
      press(byLabel('Platform renewal, Quartz, $72,000'), 'ArrowRight', { altKey: true }),
    )
    expect(screen.backend.writes).toHaveLength(1)
  } finally {
    await screen.unmount()
  }
})

test('dragging a card shows where it can land, and dropping moves it', async () => {
  const screen = await open()
  try {
    await screen.act(async () => setValue(byLabel<HTMLInputElement>('Search the board'), 'clinic'))
    expect(screen.container.textContent).not.toContain('Drop here')
    expect(column(screen, 'Won').textContent).toContain('No deals')

    await screen.act(async () =>
      drag(byLabel('Clinic scheduling, Halcyon Health, $127,000'), 'dragstart'),
    )
    expect(column(screen, 'Won').textContent).toContain('Drop here')
    await screen.act(async () => drag(column(screen, 'Won'), 'dragover'))
    await screen.act(async () => drag(column(screen, 'Won'), 'drop'))
    await screen.settle()

    expect(screen.backend.writes).toEqual([
      { method: 'PATCH', path: '/rpc/ui-patterns/deals/d3', body: { stage: 'won' } },
    ])
    expect(titles(column(screen, 'Won'))).toEqual(['Clinic scheduling'])
    expect(screen.container.textContent).not.toContain('Drop here')
  } finally {
    await screen.unmount()
  }
})

test('dropping a card on its own column changes nothing', async () => {
  const screen = await open()
  try {
    await screen.act(async () => drag(byLabel('Fleet tracking, Brightwave, $84,000'), 'dragstart'))
    await screen.act(async () => drag(column(screen, 'Proposal'), 'drop'))
    expect(screen.backend.writes).toEqual([])
  } finally {
    await screen.unmount()
  }
})

test('while the first read is in flight every column shows card-shaped skeletons, not "No deals"', async () => {
  const screen = await open({ hold: true })
  try {
    expect(screen.container.querySelectorAll('section')).toHaveLength(5)
    expect(screen.container.querySelectorAll('article')).toHaveLength(0)
    expect(screen.container.textContent).not.toContain('No deals')
    screen.backend.release()
    await screen.settle()
    expect(screen.container.querySelectorAll('article')).toHaveLength(6)
  } finally {
    await screen.unmount()
  }
})
