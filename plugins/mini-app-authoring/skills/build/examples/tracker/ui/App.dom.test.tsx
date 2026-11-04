import { expect, test } from 'bun:test'
import { byLabel, byText, click, mount, press, setValue, setupDom } from './test-support'

setupDom()

const rowsOf = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="listitem"]')].map((row) => row.textContent ?? '')

test('lists live applications first, furthest along first, and tells the agent the same search', async () => {
  const screen = await mount()
  try {
    const rows = rowsOf(screen.container)
    expect(rows.map((row) => row.split('Acme')[0]!.split('Globex')[0])).toEqual([
      expect.stringContaining('Design lead'),
      expect.stringContaining('Product designer'),
      expect.stringContaining('Researcher'),
      expect.stringContaining('Illustrator'),
    ])
    expect(rows[0]).toContain('Globex')
    expect(rows[0]).toContain('$130K')
    // The header counts what the agent is told: the same function writes both.
    expect(screen.container.textContent).toContain('4 applications · 3 live')
    const published = JSON.stringify(screen.contexts.at(-1))
    expect(published).toContain('4 applications at 2 companies, 3 still live.')
    expect(published).toContain('Design lead at Globex [interview, $130,000] (id a2)')
  } finally {
    await screen.unmount()
  }
})

test('selecting an application shows its details and its timeline, newest step first', async () => {
  const screen = await mount()
  try {
    expect(screen.container.textContent).toContain('Select an application')
    await screen.act(async () =>
      click(screen.container.querySelector('[data-application-id="a1"]')!),
    )

    const detail = byLabel('Application: Product designer')
    expect(detail.textContent).toContain('Referred by Sam')
    expect(detail.textContent).toContain('$90,000')
    expect(detail.textContent).toContain('Oct 20, 2026')
    const steps = [...byLabel('Timeline', detail).querySelectorAll('li p.font-medium')]
    expect(steps.map((step) => step.textContent)).toEqual(['Applied', 'Wishlist'])
    expect(detail.textContent).toContain('2 applications')
  } finally {
    await screen.unmount()
  }
})

test('arrow keys walk the list and select as they go', async () => {
  const screen = await mount()
  try {
    const first = screen.container.querySelector<HTMLElement>('[data-application-id="a2"]')!
    await screen.act(async () => press(first, 'ArrowDown'))
    expect(byLabel('Application: Product designer')).toBeTruthy()
    await screen.act(async () =>
      press(screen.container.querySelector('[data-application-id="a1"]')!, 'End'),
    )
    expect(byLabel('Application: Illustrator')).toBeTruthy()
  } finally {
    await screen.unmount()
  }
})

test('a status chosen from a row menu sends the change and the timeline entry with it', async () => {
  const screen = await mount()
  try {
    await screen.act(async () => press(byLabel('Actions for Researcher'), 'Enter'))
    const item = [...document.querySelectorAll('[role="menuitem"]')].find(
      (each) => each.textContent === 'Move to Applied',
    )!
    await screen.act(async () => click(item))
    await screen.settle()

    expect(screen.backend.writes).toHaveLength(1)
    expect(screen.backend.writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/rpc/example-tracker/applications/a4',
      body: {
        status: 'applied',
        appliedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        history: [
          { status: 'wishlist', at: expect.any(String) },
          { status: 'applied', at: expect.any(String) },
        ],
      },
    })
  } finally {
    await screen.unmount()
  }
})

test('searching and filtering narrow the list, and a search with no match offers a way out', async () => {
  const screen = await mount()
  try {
    await screen.act(async () =>
      setValue(byLabel<HTMLInputElement>('Search applications'), 'globex'),
    )
    expect(rowsOf(screen.container).map((row) => row.slice(0, 12))).toEqual([
      expect.stringContaining('Design lead'),
      expect.stringContaining('Researcher'),
    ])

    await screen.act(async () => setValue(byLabel<HTMLInputElement>('Search applications'), 'zzz'))
    expect(screen.container.textContent).toContain('No applications match')
    await screen.act(async () => click(byText('Clear filters', 'button', screen.container)))
    expect(rowsOf(screen.container)).toHaveLength(4)
  } finally {
    await screen.unmount()
  }
})

test('an empty tracker says what to do; a tracker with companies only offers the application', async () => {
  const empty = await mount({ companies: [], applications: [] })
  try {
    expect(empty.container.textContent).toContain('No applications yet')
    expect(
      byText('New company', 'button', empty.container.querySelector('[role="tabpanel"]')!),
    ).toBeTruthy()
    expect(JSON.stringify(empty.contexts.at(-1))).toContain('Nothing is tracked yet.')
  } finally {
    await empty.unmount()
  }
  const companiesOnly = await mount({ applications: [] })
  try {
    const panel = companiesOnly.container.querySelector('[role="tabpanel"]')!
    expect(byText('New application', 'button', panel)).toBeTruthy()
  } finally {
    await companiesOnly.unmount()
  }
})

test('loading shows skeletons shaped like the rows, not an empty pane', async () => {
  const screen = await mount({ hold: true })
  try {
    expect(screen.container.querySelectorAll('[aria-hidden]').length).toBeGreaterThan(0)
    expect(screen.container.textContent).toContain('Loading…')
    expect(screen.container.textContent).not.toContain('No applications yet')
    screen.backend.release()
    await screen.settle()
    expect(rowsOf(screen.container)).toHaveLength(4)
  } finally {
    await screen.unmount()
  }
})

test('a failed first read says so and retries on request', async () => {
  const screen = await mount({ failReads: true })
  try {
    const alert = screen.container.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('Applications could not be loaded')
    screen.backend.failReads = false
    await screen.act(async () => click(byText('Try again', 'button', screen.container)))
    await screen.settle()
    expect(rowsOf(screen.container)).toHaveLength(4)
  } finally {
    await screen.unmount()
  }
})
