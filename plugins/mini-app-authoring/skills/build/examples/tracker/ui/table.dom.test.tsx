import { expect, test } from 'bun:test'
import {
  application,
  byLabel,
  byText,
  click,
  fixtureApplications,
  mount,
  setupDom,
} from './test-support'

setupDom()

// A confirmation is an `alertdialog`: it interrupts, and must be answered.
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]')
const openTable = async (options?: Parameters<typeof mount>[0]) => {
  const screen = await mount(options)
  // The tab's name carries its count badge, so match it by its start.
  const tab = [...screen.container.querySelectorAll('[role="tab"]')].find((t) =>
    t.textContent?.startsWith('Table'),
  )!
  await screen.act(async () => click(tab))
  return screen
}
const roles = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr')].map(
    (row) => row.querySelector('td:nth-child(2) button')?.textContent,
  )
const sortOf = (container: HTMLElement) =>
  Object.fromEntries(
    [...container.querySelectorAll('th[aria-sort]')].map((th) => [
      th.textContent?.trim(),
      th.getAttribute('aria-sort'),
    ]),
  )

test('sorts by a column, flips on a second press, and says so to a screen reader', async () => {
  const screen = await openTable()
  try {
    // Newest day applied first; rows without a day come last in either direction.
    expect(roles(screen.container)[0]).toBe('Product designer')
    await screen.act(async () => click(byText('Role', 'th button', screen.container)))
    expect(roles(screen.container)).toEqual([
      'Design lead',
      'Illustrator',
      'Product designer',
      'Researcher',
    ])
    expect(sortOf(screen.container)).toMatchObject({ Role: 'ascending', Pay: 'none' })

    await screen.act(async () => click(byText('Role', 'th button', screen.container)))
    expect(roles(screen.container)[0]).toBe('Researcher')

    await screen.act(async () => click(byText('Pay', 'th button', screen.container)))
    expect(roles(screen.container).slice(0, 2)).toEqual(['Design lead', 'Product designer'])
    expect(screen.container.querySelector('caption')!.textContent).toContain(
      'sorted by pay, descending',
    )
  } finally {
    await screen.unmount()
  }
})

test('selecting rows shows the bulk bar, and select-all becomes indeterminate', async () => {
  const screen = await openTable()
  try {
    const all = byLabel<HTMLInputElement>('Select all shown applications')
    await screen.act(async () => click(byLabel('Select Illustrator')))
    expect(screen.container.textContent).toContain('1 selected')
    expect(all.indeterminate).toBe(true)

    await screen.act(async () => click(all))
    expect(all.checked).toBe(true)
    expect(screen.container.textContent).toContain('4 selected')
    await screen.act(async () => click(byText('Clear selection', 'button', screen.container)))
    expect(screen.container.textContent).not.toContain('selected')
  } finally {
    await screen.unmount()
  }
})

test('bulk delete asks first, then sends one delete per selected row', async () => {
  const screen = await openTable()
  try {
    await screen.act(async () => click(byLabel('Select Illustrator')))
    await screen.act(async () => click(byLabel('Select Researcher')))
    await screen.act(async () => click(byText('Delete 2 applications', 'button', screen.container)))

    expect(dialog()!.textContent).toContain('Delete 2 applications?')
    expect(screen.backend.writes).toEqual([])

    await screen.act(async () => click(byText('Delete', 'button', dialog()!)))
    await screen.settle()

    // One request per row, in list order (live applications first).
    expect(screen.backend.writes.map((write) => [write.method, write.path])).toEqual([
      ['DELETE', '/rpc/example-tracker/applications/a4'],
      ['DELETE', '/rpc/example-tracker/applications/a3'],
    ])
    expect(roles(screen.container).sort()).toEqual(['Design lead', 'Product designer'])
    expect(screen.container.textContent).not.toContain('selected')
  } finally {
    await screen.unmount()
  }
})

test('cancelling the confirmation deletes nothing and keeps the selection', async () => {
  const screen = await openTable()
  try {
    await screen.act(async () => click(byLabel('Select Illustrator')))
    await screen.act(async () => click(byText('Delete 1 application', 'button', screen.container)))
    await screen.act(async () => click(byText('Cancel', 'button', dialog()!)))
    expect(screen.backend.writes).toEqual([])
    expect(screen.container.textContent).toContain('1 selected')
  } finally {
    await screen.unmount()
  }
})

test('a long table is capped, says how much is hidden, and shows more on request', async () => {
  const many = [
    ...fixtureApplications(),
    ...Array.from({ length: 8 }, (_, i) => application({ id: `x${i}`, role: `Extra ${i}` })),
  ]
  const screen = await openTable({ applications: many })
  try {
    expect(roles(screen.container)).toHaveLength(10)
    expect(screen.container.textContent).toContain('Showing 10 of 12')
    await screen.act(async () => click(byText('Show more', 'button', screen.container)))
    expect(roles(screen.container)).toHaveLength(12)
    expect(screen.container.textContent).not.toContain('Show more')
  } finally {
    await screen.unmount()
  }
})

test('removing a company asks first, says how many applications go with it, and removes them all', async () => {
  const screen = await mount()
  try {
    await screen.act(async () =>
      click(screen.container.querySelector('[data-application-id="a2"]')!),
    )
    await screen.act(async () => click(byText('Remove company…', 'button', screen.container)))
    expect(dialog()!.textContent).toContain('Remove Globex?')
    expect(dialog()!.textContent).toContain('This also deletes its 2 applications.')
    expect(screen.backend.writes).toEqual([])

    await screen.act(async () => click(byText('Remove company', 'button', dialog()!)))
    await screen.settle()

    expect(screen.backend.writes).toEqual([
      {
        method: 'DELETE',
        path: '/rpc/example-tracker/companies/c2/with-applications',
        body: undefined,
      },
    ])
    expect(byLabel('Applications').textContent).not.toContain('Design lead')
    expect(byLabel('Applications').textContent).toContain('Product designer')
    // The removed application's detail is gone with it, not left showing a stale copy.
    expect(screen.container.textContent).toContain('Select an application')
  } finally {
    await screen.unmount()
  }
})
