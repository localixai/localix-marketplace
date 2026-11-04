import { expect, test } from 'bun:test'
import { formatMoment } from '../../shared/format'
import { byLabel, byText, click, fx, mount, press, setValue, setupDom } from '../test-support'

setupDom()

const buttonNamed = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text))!

test('Today leads with one study button that says how much waits and for how long', async () => {
  const screen = await mount()
  try {
    const study = byLabel('Study now', screen.container)
    expect(buttonNamed(study, 'Study').className).toContain('bg-foreground')
    expect(study.textContent).toContain('17cards to study')
    expect(study.textContent).toContain('12 due · 5 new · ~4 min')
    expect(study.textContent).toContain('6 of 20 today')
    expect(study.textContent).toContain('3 days in a row')
    // Cards are what the person wrote: the header counts notes, not study items.
    expect(screen.container.textContent).toContain('17 to study · 25 cards')
    expect(JSON.stringify(screen.contexts.at(-1))).toContain('Recall is open on the Today tab.')
  } finally {
    await screen.unmount()
  }
})

test('with nothing due the button is disabled and says when the next card comes', async () => {
  const next = '2026-11-04T18:40:00.000Z'
  const screen = await mount({
    today: fx.today({ due: { learning: 0, review: 0, new: 0, total: 0 }, nextDueAt: next }),
  })
  try {
    const hero = byLabel('Study now', screen.container)
    const button = buttonNamed(hero, 'All done')
    expect(button.disabled).toBe(true)
    const when = formatMoment(next, new Date(), -new Date().getTimezoneOffset())
    expect(button.textContent).toContain(when.includes(':') && /^\d\d:\d\d$/.test(when) ? `next at ${when}` : `next ${when}`)
  } finally {
    await screen.unmount()
  }
})

test('drafts and the Inbox wait for the person: Review opens the drafts, Sort suggests a deck', async () => {
  const inbox = fx.row('i1', 'Photosynthesis', { deckId: null })
  const screen = await mount({
    today: fx.today({ drafts: 12, inbox: 7 }),
    rows: [inbox, fx.row('d', 'A draft card', { status: 'draft' })],
    placement: [{ noteId: 'i1', deck: { id: 'd2', name: 'Biology', color: 2 }, tags: ['plants'], by: 'meaning' }],
  })
  try {
    const banners = byLabel('Waiting for you', screen.container)
    expect(banners.textContent).toContain('12 cards to review')
    expect(banners.textContent).toContain('7 cards without a deck')

    await screen.act(async () => click(buttonNamed(banners, 'Sort')))
    await screen.settle()
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Photosynthesis')
    expect(dialog.textContent).toContain('Biology')
    await screen.act(async () => click(buttonNamed(dialog, 'Accept all')))
    await screen.settle()
    const bulk = screen.fake.writes.filter((w) => w.name === 'bulk').map((w) => w.body)
    expect(bulk).toEqual([
      { ids: ['i1'], action: 'move', deckId: 'd2' },
      { ids: ['i1'], action: 'tag-add', tags: ['plants'] },
    ])
  } finally {
    await screen.unmount()
  }
})

test('Review opens Cards already filtered to drafts', async () => {
  const screen = await mount({
    today: fx.today({ drafts: 1 }),
    rows: [fx.row('d', 'A draft card', { status: 'draft' }), fx.row('x', 'Not a draft')],
  })
  try {
    await screen.act(async () => click(buttonNamed(byLabel('Waiting for you', screen.container), 'Review')))
    await screen.settle()
    expect(screen.container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Cards')
    expect(byLabel('Filter by state').textContent).toContain('Drafts')
    expect(screen.container.querySelectorAll('[data-note-id]')).toHaveLength(1)
  } finally {
    await screen.unmount()
  }
})

test('decks are rows with due counts and a Study button each; a deck with nothing due cannot start', async () => {
  const screen = await mount()
  try {
    expect(screen.container.textContent).toContain('1 due · 2 new')
    expect(screen.container.textContent).toContain('Nothing due')
    expect((byLabel('Study Biology') as HTMLButtonElement).disabled).toBe(true)
    await screen.act(async () => click(byLabel('Study Spanish')))
    await screen.settle()
    expect(screen.container.querySelector('[aria-label="Study session"]')).toBeTruthy()
    const first = screen.fake.calls.find((c) => c.name === 'studyNext')!
    expect(first.query.get('deckIds')).toBe('d1')
  } finally {
    await screen.unmount()
  }
})

test('a new deck is named and coloured; removing a deck asks what happens to its cards', async () => {
  const screen = await mount()
  try {
    await screen.act(async () => click(buttonNamed(screen.container, 'New deck')))
    await screen.act(async () => click(buttonNamed(document.body.querySelector('[role="dialog"]')!, 'Create deck')))
    expect(document.body.textContent).toContain('Name the deck.')
    expect(screen.fake.writes).toHaveLength(0)

    const dialog = document.body.querySelector('[role="dialog"]')!
    await screen.act(async () => setValue(dialog.querySelector('input')!, 'Chemistry'))
    await screen.act(async () => click(byLabel('Colour 4')))
    await screen.act(async () => click(buttonNamed(dialog, 'Create deck')))
    await screen.settle()
    expect(screen.fake.writes[0]).toMatchObject({ name: 'deckCreate', body: { name: 'Chemistry', color: 4 } })

    await screen.act(async () => press(byLabel('Actions for Spanish'), 'Enter'))
    await screen.act(async () => click([...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent === 'Remove deck')!))
    const remove = document.body.querySelector('[role="dialog"]')!
    expect(remove.textContent).toContain('Move cards to Inbox')
    expect(remove.textContent).toContain('Delete them')
    await screen.act(async () => click(byText('Delete them', '*', remove)))
    await screen.act(async () => click(buttonNamed(remove, 'Remove deck and cards')))
    await screen.settle()
    expect(screen.fake.writes.at(-1)).toMatchObject({ name: 'deckRemove', body: { cards: 'delete' } })
  } finally {
    await screen.unmount()
  }
})

test('zero parts are left out of the line under the number', async () => {
  const screen = await mount({ today: fx.today({ due: { learning: 0, review: 0, new: 15, total: 15 }, minutes: 4 }) })
  try {
    const hero = byLabel('Study now', screen.container)
    expect(hero.textContent).toContain('15 new · ~4 min')
    expect(hero.textContent).not.toContain('0 due')
    expect(screen.container.textContent).toContain('15 new')
  } finally {
    await screen.unmount()
  }
})

test('Today has no heatmap: the goal sits in the hero and the decks follow', async () => {
  const screen = await mount()
  try {
    expect(screen.container.querySelector('.recall-heat')).toBeNull()
    expect(byLabel('Daily goal', screen.container).textContent).toContain('6 of 20 today')
    // The bar is drawn on the 0–100 scale: 6 of 20 is 30%.
    const bar = byLabel('Daily goal', screen.container).querySelector<HTMLElement>('[role="progressbar"]')!
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('30%')
    expect(bar.className).toContain('h-1.5')
    expect(screen.fake.calls.some((c) => c.name === 'heatmap')).toBe(false)
    const newDeck = [...screen.container.querySelectorAll('button')].find((b) => b.textContent?.includes('New deck'))!
    expect(newDeck.className).toContain('border-control-border')
  } finally {
    await screen.unmount()
  }
})

test('an empty collection says to use the chat, and offers Add a card and Import', async () => {
  const screen = await mount({ today: fx.today({ decks: [], totals: { notes: 0, cards: 0 }, due: { learning: 0, review: 0, new: 0, total: 0 } }), decks: [] })
  try {
    const text = screen.container.textContent!
    expect(text).toContain('No cards yet')
    expect(text).toContain('Paste text or attach a file in the chat')
    expect(buttonNamed(screen.container, 'Add a card')).toBeTruthy()
    await screen.act(async () => click(buttonNamed(screen.container, 'Import')))
    expect(document.body.textContent).toContain('Drop a file here')
  } finally {
    await screen.unmount()
  }
})

test('a failed first read says so and tries again on request', async () => {
  const screen = await mount({ failReads: true })
  try {
    expect(screen.container.querySelector('[role="alert"]')?.textContent).toContain('Today could not be loaded')
    screen.fake.failReads = false
    await screen.act(async () => click(buttonNamed(screen.container, 'Try again')))
    await screen.settle()
    expect(screen.container.textContent).toContain('17cards to study')
  } finally {
    await screen.unmount()
  }
})

test('a deck with nothing to study says why: drafts to review, paused cards, or all done until later', async () => {
  const next = new Date(Date.now() + 3 * 3_600_000).toISOString()
  const decks = [
    fx.deck('a', 'Astronomy', { notes: 6, cards: 6, due: 0, new: 0, drafts: 6 }),
    fx.deck('b', 'Botany', { notes: 4, cards: 4, due: 0, new: 0, paused: 4 }),
    fx.deck('c', 'Chemistry', { notes: 4, cards: 4, due: 0, new: 0, nextDueAt: next }),
  ]
  const screen = await mount({ today: fx.today({ decks, inbox: 0, inboxDue: 0 }) })
  try {
    const rowOf = (name: string) => screen.container.querySelector(`[aria-label^="Show cards in ${name},"]`)!.closest('li')!
    expect(rowOf('Astronomy').textContent).toContain('6 drafts')
    expect(rowOf('Astronomy').textContent).not.toContain('Nothing due')
    expect(rowOf('Botany').textContent).toContain('4 paused')
    expect(rowOf('Chemistry').textContent).toContain('All done · next in 3 h')
    expect(screen.container.querySelector('[aria-label="Study Astronomy"]')).toBeNull()

    await screen.act(async () => click(byLabel('Review drafts in Astronomy')))
    await screen.settle()
    expect(screen.container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Cards')
    expect(byLabel('Filter by state').textContent).toContain('Drafts')
  } finally {
    await screen.unmount()
  }
})

test('a deck row names its card count for assistive tech even where the count is not drawn', async () => {
  const screen = await mount({ today: fx.today({ decks: [fx.deck('a', 'Astronomy', { notes: 10 })] }) })
  try {
    const button = byLabel('Show cards in Astronomy, 10 cards')
    expect(button.textContent).toContain('Astronomy')
  } finally {
    await screen.unmount()
  }
})
