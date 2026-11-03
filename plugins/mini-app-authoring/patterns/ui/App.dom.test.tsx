import { expect, test } from 'bun:test'
import { byText, click, mount, setupDom } from './patterns/test-support'
import { PATTERNS, PATTERN_IDS } from './gallery'

setupDom()

const open = () =>
  mount(async () => {
    const { App } = await import('./App')
    return <App active publishMessageContext={() => {}} />
  })

const tabs = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>(
    '[role="tablist"][aria-label="UI patterns"] [role="tab"]',
  ),
]

test('one tab per pattern, in order, and the first pattern fills the panel', async () => {
  const screen = await open()
  try {
    expect(tabs(screen.container).map((tab) => tab.textContent)).toEqual(
      PATTERN_IDS.map((id) => PATTERNS[id].label),
    )
    expect(tabs(screen.container)[0]!.getAttribute('aria-selected')).toBe('true')
    const panel = screen.container.querySelector('[role="tabpanel"]')!
    expect(panel.className).toContain('min-h-0')
    expect(panel.className).toContain('flex-1')
    expect(panel.textContent).toContain('Pipeline')
    expect(screen.container.textContent).toContain('Copy: page-shell.tsx')
  } finally {
    await screen.unmount()
  }
})

test('every tab opens its pattern against the backend', async () => {
  const screen = await open()
  try {
    const expected: Record<string, string> = {
      'Page shell': 'Pipeline',
      Board: 'Pipeline board',
      'Master-detail': 'Select a deal',
      'Data table': 'Select all shown deals',
      'Form dialog': 'New deal',
      Dashboard: 'At a glance',
      States: 'State to show',
    }
    for (const tab of tabs(screen.container)) {
      await screen.act(async () => click(tab))
      await screen.settle()
      const label = tab.textContent!
      expect(screen.container.querySelector('[role="tabpanel"]')!.innerHTML).toContain(
        expected[label]!,
      )
      expect(tab.getAttribute('aria-selected')).toBe('true')
    }
  } finally {
    await screen.unmount()
  }
})

test('the New deal action of the shell takes the person to the form dialog', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byText('New deal', 'button', screen.container)))
    expect(tabs(screen.container)[4]!.getAttribute('aria-selected')).toBe('true')
    expect(screen.container.textContent).toContain('Copy: form-dialog.tsx')
  } finally {
    await screen.unmount()
  }
})
