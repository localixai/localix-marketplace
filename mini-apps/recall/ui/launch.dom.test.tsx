import { expect, test } from 'bun:test'
import { byLabel, mount, setupDom } from './test-support'
import { requestLaunch } from './launch'

setupDom()

test('a request made before the screen exists is acted on when it opens', async () => {
  requestLaunch({ show: 'study', target: { deckIds: ['d1'], label: 'Spanish' } })
  const screen = await mount()
  try {
    expect(byLabel('Study session', screen.container).textContent).toContain('Study · Spanish')
    const next = screen.fake.calls.find((c) => c.name === 'studyNext')!
    expect(next.query.get('deckIds')).toBe('d1')
  } finally {
    await screen.unmount()
  }
})

test('a request made while the screen is open shows the imported cards, once', async () => {
  const screen = await mount()
  try {
    expect(
      screen.container.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toContain('Today')
    await screen.act(async () =>
      requestLaunch({ show: 'cards', preset: { deck: 'd1', state: 'draft' } }),
    )
    await screen.settle()
    expect(
      screen.container.querySelector('[role="tab"][aria-selected="true"]')?.textContent,
    ).toContain('Cards')
    const library = screen.fake.calls.filter((c) => c.name === 'library').at(-1)!
    expect(library.query.get('deckIds')).toBe('d1')
    expect(library.query.get('states')).toBe('draft')
  } finally {
    await screen.unmount()
  }
})
