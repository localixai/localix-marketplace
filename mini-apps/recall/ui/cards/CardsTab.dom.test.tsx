import { expect, test } from 'bun:test'
import { byLabel, byText, click, fx, mount, openTab, press, setValue, setupDom, type Mounted } from '../test-support'

setupDom()

const fronts = (screen: Mounted) =>
  [...screen.container.querySelectorAll('[data-note-id]')].map((row) => row.querySelector('button[aria-label^="Open"]')!.getAttribute('aria-label')!.replace('Open ', ''))

async function cards(init: Parameters<typeof mount>[0] = {}) {
  const screen = await mount(init)
  await openTab(screen, 'Cards')
  return screen
}

test('the list shows each card with its deck, tags, state and when it is due', async () => {
  const screen = await cards()
  try {
    expect(fronts(screen)).toEqual(['Hola means hello', 'Gracias means thanks', 'Mitosis'])
    const second = screen.container.querySelectorAll('[data-note-id]')[1]!
    expect(second.textContent).toContain('Spanish')
    expect(second.textContent).toContain('#basics')
    expect(second.textContent).toContain('Review')
    expect(second.textContent).toContain('in 2 d')
    expect(screen.container.textContent).toContain('3 cards')
  } finally {
    await screen.unmount()
  }
})

test('searching narrows the list as the person types, and says which way it matched', async () => {
  const screen = await cards()
  try {
    await screen.act(async () => setValue(byLabel<HTMLInputElement>('Search cards'), 'gracias'))
    await screen.settle()
    expect(fronts(screen)).toEqual(['Gracias means thanks'])
    expect(screen.fake.calls.at(-1)!.query.get('q')).toBe('gracias')
    expect(screen.fake.calls.at(-1)!.query.get('mode')).toBe('text')

    await screen.act(async () => click(byText('Meaning', '*', byLabel('Search by'))))
    await screen.settle()
    expect(screen.fake.calls.at(-1)!.query.get('mode')).toBe('meaning')
    expect(screen.container.textContent).toContain('matched by meaning')
  } finally {
    await screen.unmount()
  }
})

test('a search that finds nothing is not the empty state, and Clear filters brings the cards back', async () => {
  const screen = await cards()
  try {
    await screen.act(async () => setValue(byLabel<HTMLInputElement>('Search cards'), 'zzz'))
    await screen.settle()
    expect(screen.container.textContent).toContain('No cards match')
    expect(screen.container.textContent).not.toContain('Paste text or attach a file')
    await screen.act(async () => click([...screen.container.querySelectorAll('button')].find((b) => b.textContent === 'Clear filters')!))
    await screen.settle()
    expect(fronts(screen)).toHaveLength(3)
  } finally {
    await screen.unmount()
  }
})

test('the deck filter and the tag box ask the library for just those cards', async () => {
  const screen = await cards()
  try {
    await screen.act(async () => {
      byLabel('Filter by deck').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      click(byLabel('Filter by deck'))
    })
    const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.startsWith('Biology'))!
    await screen.act(async () => click(option))
    await screen.settle()
    expect(fronts(screen)).toEqual(['Mitosis'])
    expect(screen.fake.calls.at(-1)!.query.get('deckIds')).toBe('d2')

    await screen.act(async () => setValue(byLabel<HTMLInputElement>('Filter by tag'), '#Basics'))
    await screen.settle()
    expect(screen.fake.calls.at(-1)!.query.get('tags')).toBe('basics')
  } finally {
    await screen.unmount()
  }
})

test('selecting cards shows what can be done to them; deleting asks first and sends the ids', async () => {
  const screen = await cards()
  try {
    expect(screen.container.querySelector('[aria-label="Actions on selected cards"]')).toBeNull()
    await screen.act(async () => click(byLabel('Select Hola means hello')))
    await screen.act(async () => click(byLabel('Select Mitosis')))
    const bar = byLabel('Actions on selected cards')
    expect(bar.textContent).toContain('2 cards selected')

    await screen.act(async () => click([...bar.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!))
    const confirm = document.body.querySelector('[role="alertdialog"], [role="dialog"]')!
    expect(confirm.textContent).toContain('Delete 2 cards?')
    expect(screen.fake.writes).toHaveLength(0)
    await screen.act(async () => click(byText('Delete', 'button', confirm)))
    await screen.settle()

    expect(screen.fake.writes).toHaveLength(1)
    expect(screen.fake.writes[0]).toMatchObject({ name: 'bulk', body: { action: 'delete', ids: ['a', 'c'] } })
    expect(fronts(screen)).toEqual(['Gracias means thanks'])
    expect(screen.container.querySelector('[aria-label="Actions on selected cards"]')).toBeNull()
  } finally {
    await screen.unmount()
  }
})

test('cancelling the delete confirm changes nothing', async () => {
  const screen = await cards()
  try {
    await screen.act(async () => click(byLabel('Select all shown cards')))
    expect(byLabel('Actions on selected cards').textContent).toContain('3 cards selected')
    await screen.act(async () => click([...byLabel('Actions on selected cards').querySelectorAll('button')].find((b) => b.textContent === 'Delete')!))
    const confirm = document.body.querySelector('[role="alertdialog"], [role="dialog"]')!
    await screen.act(async () => click(byText('Cancel', 'button', confirm)))
    expect(screen.fake.writes).toHaveLength(0)
    expect(fronts(screen)).toHaveLength(3)
  } finally {
    await screen.unmount()
  }
})

test('moving selected cards to a deck sends the deck', async () => {
  const screen = await cards()
  try {
    await screen.act(async () => click(byLabel('Select Hola means hello')))
    await screen.act(async () => click([...byLabel('Actions on selected cards').querySelectorAll('button')].find((b) => b.textContent?.includes('Move to deck'))!))
    const dialog = document.body.querySelector('[role="dialog"]')!
    await screen.act(async () => {
      const select = dialog.querySelector<HTMLElement>('[aria-label="Deck"]')!
      select.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      click(select)
    })
    await screen.act(async () => click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.startsWith('Biology'))!))
    await screen.act(async () => click(byText('Move', 'button', dialog)))
    await screen.settle()
    expect(screen.fake.writes[0]).toMatchObject({ name: 'bulk', body: { action: 'move', ids: ['a'], deckId: 'd2' } })
  } finally {
    await screen.unmount()
  }
})

test('a long list shows a page and Show more reads the next one', async () => {
  const many = Array.from({ length: 60 }, (_, i) => fx.row(`n${i}`, `Card ${i}`))
  const screen = await cards({ rows: many })
  try {
    expect(fronts(screen)).toHaveLength(50)
    expect(screen.container.textContent).toContain('60 cards')
    await screen.act(async () => click([...screen.container.querySelectorAll('button')].find((b) => b.textContent === 'Show more')!))
    await screen.settle()
    expect(fronts(screen)).toHaveLength(60)
    expect([...screen.container.querySelectorAll('button')].some((b) => b.textContent === 'Show more')).toBe(false)
  } finally {
    await screen.unmount()
  }
})

test('no cards at all points to the chat; a failed read offers a retry', async () => {
  const empty = await cards({ rows: [] })
  try {
    expect(empty.container.textContent).toContain('Paste text or attach a file in the chat')
  } finally {
    await empty.unmount()
  }
  const screen = await mount()
  try {
    screen.fake.failReads = true
    await openTab(screen, 'Cards')
    expect(screen.container.querySelector('[role="alert"]')?.textContent).toContain('Cards could not be loaded')
    screen.fake.failReads = false
    await screen.act(async () => click([...screen.container.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!))
    await screen.settle()
    expect(fronts(screen)).toHaveLength(3)
  } finally {
    await screen.unmount()
  }
})

test('N opens a new card, and what the agent is told names the filters and the open card', async () => {
  const screen = await cards()
  try {
    await screen.act(async () => press(screen.container.querySelector('[role="list"]')!, 'n'))
    expect(screen.container.textContent).toContain('New card')
    await screen.act(async () => click(byLabel('Open Hola means hello')))
    await screen.settle()
    const told = JSON.stringify(screen.contexts.at(-1))
    expect(told).toContain('Recall is open on the Cards tab.')
    expect(told).toContain('Open card:')
    expect(told).toContain('Hola means hello')
  } finally {
    await screen.unmount()
  }
})

test('with no card open the list has the whole width under one full-width toolbar; a card opens beside it', async () => {
  const screen = await cards()
  try {
    const root = screen.container.querySelector('[aria-label="Card filters"]')!.parentElement!.parentElement!
    // No empty placeholder pane: nothing but the list below the toolbar.
    expect(screen.container.textContent).not.toContain('Select a card')
    expect(screen.container.querySelector('textarea')).toBeNull()
    const listColumn = screen.container.querySelector('[role="list"]')!.parentElement!
    expect(listColumn.className).toContain('flex-1')
    expect(listColumn.className).not.toContain('w-(--cards-width)')
    // The toolbar is above both columns, not inside the list column.
    expect(listColumn.contains(byLabel('Card filters'))).toBe(false)
    expect(root.contains(listColumn)).toBe(true)

    await screen.act(async () => click(byLabel('Open Hola means hello')))
    await screen.settle()
    const narrowed = screen.container.querySelector('[role="list"]')!.parentElement!
    expect(narrowed.className).toContain('@3xl:w-(--cards-width)')
    expect(narrowed.className).toContain('hidden')
    const cardsRoot = narrowed.parentElement!.parentElement as HTMLElement
    expect(cardsRoot.style.getPropertyValue('--cards-width')).toBe('45%')
    expect(byLabel('Back to cards').className).toContain('@3xl:hidden')
  } finally {
    await screen.unmount()
  }
})
