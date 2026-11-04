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
    expect(byLabel('Actions on selected cards').textContent).toContain('All 3 selected')
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


const many = (count: number) => Array.from({ length: count }, (_, index) => fx.row(`r${index + 1}`, `Card ${index + 1}`))
const bar = () => byLabel('Actions on selected cards')
const barButton = (label: string) => [...bar().querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
const shownMore = async (screen: Mounted) =>
  screen.act(async () => click([...screen.container.querySelectorAll('button')].find((b) => b.textContent === 'Show more')!))

test('the header checkbox picks the cards shown, says how many of all, and offers every match', async () => {
  const screen = await cards({ rows: many(120) })
  try {
    expect(fronts(screen)).toHaveLength(50)
    await screen.act(async () => click(byLabel('Select all shown cards')))
    expect(bar().textContent).toContain('50 of 120 selected')
    expect(barButton('Select all 120 cards')).toBeTruthy()
  } finally {
    await screen.unmount()
  }
})

test('taking the offer selects all 120, including the cards that load later; deleting sends the match, not ids', async () => {
  const screen = await cards({ rows: many(120) })
  try {
    await screen.act(async () => click(byLabel('Select all shown cards')))
    await screen.act(async () => click(barButton('Select all 120 cards')!))
    expect(bar().textContent).toContain('All 120 cards selected')
    expect(barButton('Select all 120 cards')).toBeUndefined()
    expect(barButton('Clear selection')).toBeTruthy()
    await shownMore(screen)
    await screen.settle()
    expect(screen.container.querySelectorAll('[data-note-id] input[type="checkbox"]:checked').length).toBe(100)

    await screen.act(async () => click(barButton('Delete')!))
    const confirm = document.body.querySelector('[role="alertdialog"], [role="dialog"]')!
    expect(confirm.textContent).toContain('Delete 120 cards?')
    await screen.act(async () => click(byText('Delete', 'button', confirm)))
    await screen.settle()
    const write = screen.fake.writes.find((w) => w.name === 'bulk')!
    expect(write.body.ids).toBeUndefined()
    expect(write.body).toMatchObject({ action: 'delete', expect: 120, match: { sort: 'newest' } })
  } finally {
    await screen.unmount()
  }
})

test('unticking one card leaves all mode: the cards read stay picked, as ids, minus that one', async () => {
  const screen = await cards({ rows: many(120) })
  try {
    await screen.act(async () => click(byLabel('Select all shown cards')))
    await screen.act(async () => click(barButton('Select all 120 cards')!))
    await screen.act(async () => click(byLabel('Select Card 3')))
    expect(bar().textContent).toContain('49 of 120 selected')
    expect(barButton('Select all 120 cards')).toBeTruthy()
    await screen.act(async () => click(barButton('Delete')!))
    const confirm = document.body.querySelector('[role="alertdialog"], [role="dialog"]')!
    expect(confirm.textContent).toContain('Delete 49 cards?')
    await screen.act(async () => click(byText('Delete', 'button', confirm)))
    await screen.settle()
    const body = screen.fake.writes.find((w) => w.name === 'bulk')!.body
    expect(body.match).toBeUndefined()
    expect(body.ids).toHaveLength(49)
    expect(body.ids).not.toContain('r3')
  } finally {
    await screen.unmount()
  }
})

test('when everything is loaded and picked it says All, with nothing more to offer', async () => {
  const screen = await cards()
  try {
    await screen.act(async () => click(byLabel('Select all shown cards')))
    expect(bar().textContent).toContain('All 3 selected')
    expect(barButton('Select all 3 cards')).toBeUndefined()
  } finally {
    await screen.unmount()
  }
})

test('a new search, filter, deck or sort clears the selection, and so does Esc and Clear selection', async () => {
  const screen = await cards({ rows: many(120) })
  try {
    const pickAll = async () => {
      await screen.act(async () => click(byLabel('Select all shown cards')))
      await screen.act(async () => click(barButton('Select all 120 cards')!))
    }
    await pickAll()
    await screen.act(async () => setValue(byLabel<HTMLInputElement>('Search cards'), 'Card 1'))
    await screen.settle()
    expect(screen.container.querySelector('[aria-label="Actions on selected cards"]')).toBeNull()

    await screen.act(async () => setValue(byLabel<HTMLInputElement>('Search cards'), ''))
    await screen.settle()
    await pickAll()
    await screen.act(async () => click(barButton('Clear selection')!))
    expect(screen.container.querySelector('[aria-label="Actions on selected cards"]')).toBeNull()

    await pickAll()
    await screen.act(async () => press(screen.container.querySelector('[role="list"]')!, 'Escape'))
    expect(screen.container.querySelector('[aria-label="Actions on selected cards"]')).toBeNull()

    await pickAll()
    await screen.act(async () => {
      byLabel('Filter by deck').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      click(byLabel('Filter by deck'))
    })
    await screen.act(async () => click([...document.querySelectorAll('[role="option"]')].find((o) => o.textContent?.startsWith('Biology'))!))
    await screen.settle()
    expect(screen.container.querySelector('[aria-label="Actions on selected cards"]')).toBeNull()
  } finally {
    await screen.unmount()
  }
})

test('the agent is told how many cards are selected, and that it is all of them', async () => {
  const screen = await cards({ rows: many(120) })
  try {
    await screen.act(async () => click(byLabel('Select all shown cards')))
    expect(JSON.stringify(screen.contexts.at(-1))).toContain('120 cards match; 50 selected')
    await screen.act(async () => click(barButton('Select all 120 cards')!))
    expect(JSON.stringify(screen.contexts.at(-1))).toContain('All 120 matching cards selected')
  } finally {
    await screen.unmount()
  }
})

test('a refused bulk action (the list changed) shows the sentence and keeps the selection', async () => {
  const screen = await cards({ rows: many(120) })
  try {
    await screen.act(async () => click(byLabel('Select all shown cards')))
    await screen.act(async () => click(barButton('Select all 120 cards')!))
    screen.fake.refuse.bulk = 'The list changed — look again before you do this to every card.'
    await screen.act(async () => click(barButton('Delete')!))
    await screen.act(async () => click(byText('Delete', 'button', document.body.querySelector('[role="alertdialog"], [role="dialog"]')!)))
    await screen.settle()
    expect(screen.container.textContent).toContain('The list changed — look again before you do this to every card.')
    expect(bar().textContent).toContain('All 120 cards selected')
  } finally {
    await screen.unmount()
  }
})

test('Accept drafts in all mode is offered when the server says the matches hold drafts', async () => {
  const draft = fx.row('d1', 'A draft', { status: 'draft' })
  const screen = await cards({ rows: [draft, ...many(120)] })
  try {
    await screen.act(async () => click(byLabel('Select all shown cards')))
    await screen.act(async () => click(barButton('Select all 121 cards')!))
    await screen.settle()
    expect(barButton('Accept drafts')).toBeTruthy()
    const ask = screen.fake.calls.filter((c) => c.name === 'library').at(-1)!
    expect(ask.query.get('status')).toBe('draft')
  } finally {
    await screen.unmount()
  }
})

// Every bulk action in all mode: the request carries the list's match and the count shown, never ids,
// and the question the person answers says how many cards it acts on.
const dialog = () => document.body.querySelector('[role="alertdialog"], [role="dialog"]')!
const openMore = async (screen: Mounted, item: string) => {
  await screen.act(async () => {
    byLabel('More actions on the selection').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    click(byLabel('More actions on the selection'))
  })
  await screen.act(async () => click([...document.querySelectorAll('[role="menuitem"]')].find((o) => o.textContent === item)!))
}
const ALL_ACTIONS: {
  name: string
  start: (screen: Mounted) => Promise<void>
  finish?: (screen: Mounted) => Promise<void>
  title?: string
  body: Record<string, unknown>
}[] = [
  {
    name: 'Add a tag',
    start: (s) => openMore(s, 'Add a tag'),
    finish: async (s) => {
      await s.act(async () => setValue(dialog().querySelector('input')!, 'fresh'))
      await s.act(async () => click(byText('Add tag', 'button', dialog())))
    },
    title: 'Add a tag to 120 cards',
    body: { action: 'tag-add', tags: ['fresh'] },
  },
  {
    name: 'Remove a tag',
    start: (s) => openMore(s, 'Remove a tag'),
    finish: async (s) => {
      await s.act(async () => setValue(dialog().querySelector('input')!, 'old'))
      await s.act(async () => click(byText('Remove tag', 'button', dialog())))
    },
    title: 'Remove a tag from 120 cards',
    body: { action: 'tag-remove', tags: ['old'] },
  },
  {
    name: 'Move to deck',
    start: async (s) => s.act(async () => click(barButton('Move to deck')!)),
    finish: (s) => s.act(async () => click(byText('Move', 'button', dialog()))),
    title: 'Move 120 cards to…',
    body: { action: 'move', deckId: null },
  },
  { name: 'Pause', start: (s) => openMore(s, 'Pause'), body: { action: 'pause' } },
  { name: 'Resume', start: (s) => openMore(s, 'Resume'), body: { action: 'resume' } },
  {
    name: 'Reset progress',
    start: (s) => openMore(s, 'Reset progress'),
    finish: (s) => s.act(async () => click(byText('Reset progress', 'button', dialog()))),
    title: 'Reset progress on 120 cards?',
    body: { action: 'reset' },
  },
  {
    name: 'Delete',
    start: async (s) => s.act(async () => click(barButton('Delete')!)),
    finish: (s) => s.act(async () => click(byText('Delete', 'button', dialog()))),
    title: 'Delete 120 cards?',
    body: { action: 'delete' },
  },
]

test.each(ALL_ACTIONS)('all mode: $name sends the match and the count, and the question says 120', async (item) => {
  const screen = await cards({ rows: many(120) })
  try {
    await screen.act(async () => click(byLabel('Select all shown cards')))
    await screen.act(async () => click(barButton('Select all 120 cards')!))
    await item.start(screen)
    if (item.title) expect(dialog().textContent).toContain(item.title)
    await item.finish?.(screen)
    await screen.settle()
    const write = screen.fake.writes.find((w) => w.name === 'bulk')!
    expect(write.body.ids).toBeUndefined()
    expect(write.body).toMatchObject({ ...item.body, expect: 120, match: { sort: 'newest' } })
  } finally {
    await screen.unmount()
  }
})

test('all mode: Accept drafts sends the match and the count', async () => {
  const draft = fx.row('d1', 'A draft', { status: 'draft' })
  const screen = await cards({ rows: [draft, ...many(120)] })
  try {
    await screen.act(async () => click(byLabel('Select all shown cards')))
    await screen.act(async () => click(barButton('Select all 121 cards')!))
    await screen.settle()
    await screen.act(async () => click(barButton('Accept drafts')!))
    await screen.settle()
    const write = screen.fake.writes.find((w) => w.name === 'bulk')!
    expect(write.body.ids).toBeUndefined()
    expect(write.body).toMatchObject({ action: 'accept', expect: 121, match: { sort: 'newest' } })
  } finally {
    await screen.unmount()
  }
})

test('once all mode is entered and the screen has settled, nothing more is asked or published', async () => {
  const screen = await cards({ rows: many(120) })
  try {
    await screen.act(async () => click(byLabel('Select all shown cards')))
    await screen.act(async () => click(barButton('Select all 120 cards')!))
    await screen.settle()
    const asked = screen.fake.calls.length
    const published = screen.contexts.length
    // Longer than any debounce or poll the screen has: a loop would show as more requests or publishes.
    for (let second = 0; second < 4; second += 1) {
      await screen.act(async () => void (await new Promise((resolve) => setTimeout(resolve, 250))))
    }
    expect(screen.fake.calls.length).toBe(asked)
    expect(screen.contexts.length).toBe(published)
  } finally {
    await screen.unmount()
  }
})
