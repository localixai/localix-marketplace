import { expect, test } from 'bun:test'
import { byLabel, click, field, mount, openTab, setupDom, type Mounted } from './test-support'

setupDom()

/** Every control a person can reach has a name a screen reader can say. */
function unnamed(root: ParentNode): string[] {
  const controls = [...root.querySelectorAll<HTMLElement>('button, [role="button"], [role="tab"], input:not([type="hidden"]), select, textarea, [role="combobox"]')]
  return controls
    .filter((el) => {
      const labelled = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')
      const labels = (el as HTMLInputElement).labels?.length
      return !labelled && !labels && !el.textContent?.trim()
    })
    .map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 50)}`)
}

const everywhere = (screen: Mounted) => [...unnamed(screen.container), ...unnamed(document.body)]

test('every control on Today, Cards with a card open, Stats and Settings has a name', async () => {
  const screen = await mount()
  try {
    expect(everywhere(screen)).toEqual([])
    await openTab(screen, 'Cards')
    await screen.act(async () => click(byLabel('Open Hola means hello')))
    await screen.settle()
    expect(byLabel('Back to cards')).toBeTruthy()
    expect(everywhere(screen)).toEqual([])
    await openTab(screen, 'Stats')
    expect(everywhere(screen)).toEqual([])
    await openTab(screen, 'Settings')
    expect(everywhere(screen)).toEqual([])
  } finally {
    await screen.unmount()
  }
})

test('every control in a study session has a name', async () => {
  const screen = await mount()
  try {
    const hero = byLabel('Study now', screen.container)
    await screen.act(async () => click([...hero.querySelectorAll('button')].find((b) => b.textContent?.includes('Study'))!))
    await screen.settle()
    expect(everywhere(screen)).toEqual([])
  } finally {
    await screen.unmount()
  }
})

test('the card editor is one scrolling page: every field and the history share a scroller with Save', async () => {
  const screen = await mount()
  try {
    await openTab(screen, 'Cards')
    await screen.act(async () => click(byLabel('Open Hola means hello')))
    await screen.settle()
    const scroller = (el: Element) => el.parentElement!.closest('.overflow-y-auto')
    const save = [...screen.container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Save changes'))!
    expect(save.parentElement!.className).toContain('sticky')
    const history = screen.container.querySelector('[aria-label="History"]')!
    for (const element of [field('Front'), field('Tags'), byLabel('Deck'), byLabel('Preview'), history]) {
      expect(scroller(element) === scroller(save)).toBe(true)
    }
    // The bar sits after the fields in the same column, so it cannot cover them at the end.
    const editor = save.parentElement!.parentElement!
    expect(editor.contains(byLabel('Preview'))).toBe(true)
    expect(editor.contains(history)).toBe(false)
  } finally {
    await screen.unmount()
  }
})
