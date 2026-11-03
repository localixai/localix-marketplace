import { expect, test } from 'bun:test'
import {
  byLabel,
  byText,
  click,
  deal,
  field,
  fixtureDeals,
  mount,
  setValue,
  setupDom,
} from './test-support'

setupDom()

const open = (options: Parameters<typeof mount>[1] = {}) =>
  mount(async () => {
    const { DataTable } = await import('./data-table')
    return <DataTable active />
  }, options)

const titles = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr')].map(
    (row) => row.querySelector('td:nth-child(2) button')?.textContent,
  )
const sortOf = (container: HTMLElement) =>
  Object.fromEntries(
    [...container.querySelectorAll('thead th[aria-sort]')].map((th) => [
      th.textContent,
      th.getAttribute('aria-sort'),
    ]),
  )
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]')

test('rows start sorted by value in one currency, with money right-aligned in tabular figures', async () => {
  const screen = await open()
  try {
    // 127,000 USD; 96,000 GBP (121,920 USD); 89,000; 84,000; 72,000; 41,500 EUR (44,820 USD).
    expect(titles(screen.container)).toEqual([
      'Clinic scheduling',
      'Treasury reporting',
      'Warehouse robotics',
      'Fleet tracking',
      'Platform renewal',
      'Cold-chain monitoring',
    ])
    expect(sortOf(screen.container).Amount).toBe('descending')
    const money = screen.container.querySelector('tbody tr td:last-child')!
    expect(money.textContent).toBe('$127,000')
    expect(money.className).toContain('text-right')
    expect(money.className).toContain('tabular-nums')
  } finally {
    await screen.unmount()
  }
})

test('a header button sorts by its column, and a second press reverses it', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byText('Deal', 'th button', screen.container)))
    expect(titles(screen.container)[0]).toBe('Clinic scheduling')
    expect(titles(screen.container).at(-1)).toBe('Warehouse robotics')
    expect(sortOf(screen.container)).toMatchObject({ Deal: 'ascending', Amount: 'none' })

    await screen.act(async () => click(byText('Deal', 'th button', screen.container)))
    expect(titles(screen.container)[0]).toBe('Warehouse robotics')
    expect(sortOf(screen.container).Deal).toBe('descending')
  } finally {
    await screen.unmount()
  }
})

test('selecting two rows shows the bulk bar, and select-all becomes indeterminate', async () => {
  const screen = await open()
  try {
    const all = byLabel<HTMLInputElement>('Select all shown deals')
    expect(all.checked).toBe(false)
    await screen.act(async () => click(byLabel('Select Clinic scheduling')))
    await screen.act(async () => click(byLabel('Select Fleet tracking')))

    expect(screen.container.textContent).toContain('2 selected')
    expect(all.indeterminate).toBe(true)
    expect(all.checked).toBe(false)

    await screen.act(async () => click(all))
    expect(all.indeterminate).toBe(false)
    expect(all.checked).toBe(true)
    expect(screen.container.textContent).toContain('6 selected')

    await screen.act(async () => click(byText('Clear selection', 'button', screen.container)))
    expect(screen.container.textContent).not.toContain('selected')
    expect(byLabel('Search the table')).toBeTruthy()
  } finally {
    await screen.unmount()
  }
})

test('bulk delete asks first, then sends one delete per selected row', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byLabel('Select Clinic scheduling')))
    await screen.act(async () => click(byLabel('Select Fleet tracking')))
    await screen.act(async () => click(byText('Delete 2 deals', 'button', screen.container)))

    expect(dialog()!.textContent).toContain('Delete 2 deals?')
    expect(screen.backend.writes).toEqual([])

    await screen.act(async () => click(byText('Delete', 'button', dialog()!)))
    await screen.settle()

    // One request per row, in list order (the SDK sends an empty JSON body with a DELETE).
    expect(screen.backend.writes).toEqual([
      { method: 'DELETE', path: '/rpc/ui-patterns/deals/d1', body: {} },
      { method: 'DELETE', path: '/rpc/ui-patterns/deals/d3', body: {} },
    ])
    expect(titles(screen.container)).not.toContain('Clinic scheduling')
    expect(titles(screen.container)).toHaveLength(4)
    expect(screen.container.textContent).not.toContain('selected')
  } finally {
    await screen.unmount()
  }
})

test('cancelling the confirmation deletes nothing and keeps the selection', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byLabel('Select Clinic scheduling')))
    await screen.act(async () => click(byText('Delete 1 deal', 'button', screen.container)))
    await screen.act(async () => click(byText('Cancel', 'button', dialog()!)))
    expect(screen.backend.writes).toEqual([])
    expect(screen.container.textContent).toContain('1 selected')
  } finally {
    await screen.unmount()
  }
})

test('clicking a row opens it for editing; the checkbox does not', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byLabel('Select Fleet tracking')))
    expect(dialog()).toBeNull()

    await screen.act(async () => click(screen.container.querySelectorAll('tbody tr')[3]!))
    expect(dialog()!.textContent).toContain('Edit deal')
    expect(field('Deal name').value).toBe('Fleet tracking')
    await screen.act(async () => setValue(field('Deal name'), 'Fleet tracking, phase 2'))
    await screen.act(async () => click(byText('Save changes', 'button', dialog()!)))
    await screen.settle()

    expect(screen.backend.writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/rpc/ui-patterns/deals/d1',
      body: { title: 'Fleet tracking, phase 2' },
    })
    expect(titles(screen.container)).toContain('Fleet tracking, phase 2')
  } finally {
    await screen.unmount()
  }
})

test('a long list is capped, says how much is hidden, and shows more on request', async () => {
  const many = [
    ...fixtureDeals(),
    ...Array.from({ length: 8 }, (_, i) =>
      deal({ id: `x${i}`, title: `Extra ${i}`, amount: 1000 + i }),
    ),
  ]
  const screen = await open({ deals: many })
  try {
    expect(titles(screen.container)).toHaveLength(10)
    expect(screen.container.textContent).toContain('Showing 10 of 14')
    await screen.act(async () => click(byText('Show more', 'button', screen.container)))
    expect(titles(screen.container)).toHaveLength(14)
    expect(screen.container.textContent).not.toContain('Show more')
  } finally {
    await screen.unmount()
  }
})

test('a search that matches nothing says so and offers to clear it', async () => {
  const screen = await open()
  try {
    await screen.act(async () => setValue(byLabel<HTMLInputElement>('Search the table'), 'zzz'))
    expect(screen.container.textContent).toContain('No deals match')
    await screen.act(async () => click(byText('Clear search', 'button', screen.container)))
    expect(titles(screen.container)).toHaveLength(6)
  } finally {
    await screen.unmount()
  }
})
