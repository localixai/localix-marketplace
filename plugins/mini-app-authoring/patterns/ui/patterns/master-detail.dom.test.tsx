import { expect, test } from 'bun:test'
import {
  byLabel,
  field,
  byRole,
  byText,
  choose,
  click,
  mount,
  openMenu,
  press,
  setValue,
  setupDom,
} from './test-support'

setupDom()

const open = () =>
  mount(async () => {
    const { MasterDetail } = await import('./master-detail')
    return <MasterDetail active />
  })

const row = (id: string) => document.querySelector<HTMLElement>(`[data-deal-id="${id}"]`)!
const detail = () => document.querySelector('section[aria-label^="Deal:"]')

test('with nothing selected the detail pane says what to do', async () => {
  const screen = await open()
  try {
    expect(document.querySelectorAll('[data-deal-id]')).toHaveLength(6)
    expect(screen.container.textContent).toContain('Select a deal')
    expect(detail()).toBeNull()
  } finally {
    await screen.unmount()
  }
})

test('selecting a row shows its details and its activity, newest first, with the full date behind each time', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(row('d1')))
    const pane = detail()!
    expect(pane.getAttribute('aria-label')).toBe('Deal: Fleet tracking')
    expect(pane.textContent).toContain('Owner:Maya Chen')
    expect(pane.textContent).toContain('Amount:$84,000')
    expect(row('d1').getAttribute('aria-current')).toBe('true')

    const items = [...pane.querySelectorAll('ol[aria-label="Activity"] li')]
    expect(items.map((item) => item.querySelector('p:last-child')!.textContent)).toEqual([
      'Walked through the pilot plan.',
      'Sent the revised proposal.',
    ])
    const time = items[0]!.querySelector('time')!
    expect(time.textContent).toBe('2d ago')
    expect(time.getAttribute('datetime')).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect(time.getAttribute('title')).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}/)
  } finally {
    await screen.unmount()
  }
})

test('arrow keys, Home and End walk the list and select as they go', async () => {
  const screen = await open()
  try {
    await screen.act(async () => row('d1').focus())
    await screen.act(async () => press(row('d1'), 'ArrowDown'))
    expect(detail()!.getAttribute('aria-label')).toBe('Deal: Cold-chain monitoring')
    expect(document.activeElement).toBe(row('d2'))
    expect(row('d2').tabIndex).toBe(0)
    expect(row('d1').tabIndex).toBe(-1)

    await screen.act(async () => press(row('d2'), 'ArrowUp'))
    expect(detail()!.getAttribute('aria-label')).toBe('Deal: Fleet tracking')
    await screen.act(async () => press(row('d1'), 'End'))
    expect(detail()!.getAttribute('aria-label')).toBe('Deal: Warehouse robotics')
    // At the end, ArrowDown stays put.
    await screen.act(async () => press(row('d6'), 'ArrowDown'))
    expect(detail()!.getAttribute('aria-label')).toBe('Deal: Warehouse robotics')
  } finally {
    await screen.unmount()
  }
})

test('logging an activity asks the backend for exactly that and shows it at once', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(row('d1')))
    const note = field('What happened')

    // Empty: the shared schema's sentence, and nothing is sent.
    await screen.act(async () =>
      byLabel('Log an activity').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      ),
    )
    expect(detail()!.textContent).toContain('Write what happened.')
    expect(screen.backend.writes).toEqual([])
    expect(document.activeElement).toBe(note)

    await choose(screen, field<HTMLElement>('Kind'), 'Email')
    await screen.act(async () => setValue(note, 'Sent the order form'))
    await screen.act(async () => click(byText('Log activity', 'button', detail()!)))
    await screen.settle()

    expect(screen.backend.writes).toEqual([
      {
        method: 'POST',
        path: '/rpc/ui-patterns/activities',
        body: { dealId: 'd1', kind: 'email', note: 'Sent the order form' },
      },
    ])
    const first = detail()!.querySelector('ol[aria-label="Activity"] li p:last-child')!
    expect(first.textContent).toBe('Sent the order form')
    expect(note.value).toBe('')
  } finally {
    await screen.unmount()
  }
})

test('a refused activity keeps the text and shows the server sentence next to the field', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(row('d1')))
    screen.backend.failWrites = 'Activities are read-only right now.'
    await screen.act(async () => setValue(field('What happened'), 'Left a voicemail'))
    await screen.act(async () => click(byText('Log activity', 'button', detail()!)))
    await screen.settle()
    expect(detail()!.textContent).toContain('Activities are read-only right now.')
    expect(field('What happened').value).toBe('Left a voicemail')
  } finally {
    await screen.unmount()
  }
})

test('the row menu changes the stage, and the menu offers only what still applies', async () => {
  const screen = await open()
  try {
    await screen.act(async () => openMenu(byLabel('Actions for Platform renewal')))
    const disabled = byRole('menuitem').filter(
      (item) => item.getAttribute('aria-disabled') === 'true',
    )
    expect(disabled.map((item) => item.textContent)).toEqual(['Mark as won'])
    await screen.act(async () => press(document.body, 'Escape'))

    await screen.act(async () => openMenu(byLabel('Actions for Fleet tracking')))
    await screen.act(async () => click(byText('Mark as won', '[role="menuitem"]')))
    await screen.settle()
    expect(screen.backend.writes).toEqual([
      { method: 'PATCH', path: '/rpc/ui-patterns/deals/d1', body: { stage: 'won' } },
    ])
  } finally {
    await screen.unmount()
  }
})

test('the divider is a named, keyboard-reachable separator', async () => {
  const screen = await open()
  try {
    const sash = byLabel('Resize the deal list')
    expect(sash.getAttribute('aria-orientation')).toBe('vertical')
    expect(sash.tabIndex).toBe(0)
    const [min, now, max] = ['aria-valuemin', 'aria-valuenow', 'aria-valuemax'].map((name) =>
      Number(sash.getAttribute(name)),
    )
    expect(now).toBeGreaterThanOrEqual(min!)
    expect(now).toBeLessThanOrEqual(max!)
    // The sash is a keyboard control: arrows and Home/End are handled by `usePaneResize`.
    expect(sash.getAttribute('aria-keyshortcuts')).toContain('ArrowLeft')
  } finally {
    localStorage.clear()
    await screen.unmount()
  }
})
