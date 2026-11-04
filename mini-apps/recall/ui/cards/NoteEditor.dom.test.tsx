import { expect, test } from 'bun:test'
import { PRIMARY, byLabel, byText, click, field, fx, mount, openTab, press, setValue, setupDom, type Mounted } from '../test-support'

setupDom()

const save = (screen: Mounted, from: HTMLElement) =>
  screen.act(async () => press(from, 'Enter', PRIMARY))
const front = () => field<HTMLTextAreaElement>('Front')
const back = () => field<HTMLTextAreaElement>('Back')

async function open(init: Parameters<typeof mount>[0] = {}, label = 'Open Hola means hello') {
  const screen = await mount(init)
  await openTab(screen, 'Cards')
  await screen.act(async () => click(byLabel(label)))
  await screen.settle()
  return screen
}

test('opening a card shows its fields, a preview and its history', async () => {
  const hola = fx.row('a', 'Hola means hello', { tags: ['basics'], extra: 'Greeting' })
  const detail = fx.detail(hola)
  detail.history = [
    { ...fx.detail(hola).history[0]!, id: 'r1', cardId: 'c-a', noteId: 'a', rating: 3, state: 2, due: '2026-11-07T09:00:00.000Z', stability: 1, difficulty: 1, scheduledDays: 3, elapsedDays: 1, reviewedAt: '2026-11-04T09:00:00.000Z', durationMs: 3000, source: 'screen', prev: null },
    { id: 'r0', cardId: 'c-a', noteId: 'a', rating: 1, state: 1, due: '2026-11-03T09:10:00.000Z', stability: 1, difficulty: 1, scheduledDays: 0, elapsedDays: 0, reviewedAt: '2026-11-03T09:00:00.000Z', durationMs: 3000, source: 'chat', prev: null },
  ]
  const screen = await open({ rows: [hola] })
  try {
    expect(front().value).toBe('Hola means hello')
    expect(back().value).toBe('Answer to Hola means hello')
    expect(field('Tags').value).toBe('basics')
    expect(byLabel('Preview').textContent).toContain('Hola means hello')
    expect(byLabel('Preview').textContent).toContain('Greeting')
    expect(screen.container.textContent).toContain('recall 92%')
  } finally {
    await screen.unmount()
  }
})

test('an empty front is refused with a sentence under the field and nothing is sent', async () => {
  const screen = await open()
  try {
    await screen.act(async () => setValue(front(), '   '))
    await save(screen, front())
    expect(screen.container.textContent).toContain('Write the front.')
    expect(screen.fake.writes).toHaveLength(0)
    await screen.act(async () => setValue(front(), 'Hola'))
    expect(screen.container.textContent).not.toContain('Write the front.')
  } finally {
    await screen.unmount()
  }
})

test('a cloze needs a mark, and a basic card needs a back', async () => {
  const screen = await open()
  try {
    await screen.act(async () => setValue(back(), ''))
    await save(screen, back())
    expect(screen.container.textContent).toContain('Write the back.')

    await screen.act(async () => click(byText('Cloze', '*', byLabel('Card type'))))
    const text = () => field<HTMLTextAreaElement>('Text')
    await screen.act(async () => setValue(text(), 'No marks here'))
    await save(screen, text())
    expect(screen.container.textContent).toContain('A cloze card needs at least one {{c1::…}} mark')
    expect(screen.fake.writes).toHaveLength(0)

    await screen.act(async () => setValue(text(), 'Paris is the capital of {{c1::France}}'))
    expect(byLabel('Preview').textContent).toContain('[…]')
    await save(screen, text())
    await screen.settle()
    expect(screen.fake.writes[0]).toMatchObject({ name: 'noteUpdate', body: { kind: 'cloze', front: 'Paris is the capital of {{c1::France}}' } })
  } finally {
    await screen.unmount()
  }
})

test('Cmd/Ctrl+Enter saves the change, and the Save button stays off until there is one', async () => {
  const screen = await open()
  try {
    const saveButton = () => [...screen.container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Save changes'))!
    expect(saveButton().disabled).toBe(true)
    await screen.act(async () => setValue(back(), 'Hello!'))
    await screen.act(async () => setValue(field('Tags'), 'Greetings, #Basics'))
    expect(saveButton().disabled).toBe(false)
    expect(byLabel('Preview').textContent).toContain('Hello!')

    await save(screen, back())
    await screen.settle()
    expect(screen.fake.writes).toHaveLength(1)
    expect(screen.fake.writes[0]).toMatchObject({
      name: 'noteUpdate',
      path: '/rpc/recall/notes/a',
      body: { kind: 'basic', front: 'Hola means hello', back: 'Hello!', deckId: 'd1', tags: ['greetings', 'basics'] },
    })
    expect(saveButton().disabled).toBe(true)
  } finally {
    await screen.unmount()
  }
})

test('a new card is made from the button, lands in the list and opens', async () => {
  const screen = await mount()
  try {
    await openTab(screen, 'Cards')
    await screen.act(async () => click([...screen.container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('New card'))!))
    await screen.act(async () => setValue(front(), 'Bonjour'))
    await screen.act(async () => setValue(back(), 'Hello in French'))
    await screen.act(async () => click([...screen.container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Add card'))!))
    await screen.settle()
    expect(screen.fake.writes[0]).toMatchObject({ name: 'noteCreate', body: { front: 'Bonjour', back: 'Hello in French', deckId: null } })
    expect(screen.container.querySelector('[data-note-id^="new-"]')?.textContent).toContain('Bonjour')
    expect(screen.container.textContent).toContain('Save changes')
  } finally {
    await screen.unmount()
  }
})

test('a card like one you already have gets a warning while typing, and saving is still allowed', async () => {
  const screen = await open({ similar: [{ noteId: 'b', front: 'Gracias means thanks', deck: 'Spanish', score: 0.93, exact: false }] })
  try {
    await screen.act(async () => setValue(front(), 'Gracias means thank you'))
    await screen.settle()
    const warning = screen.container.querySelector('[role="status"]')!
    expect(warning.textContent).toContain('Looks like cards you already have')
    expect(warning.textContent).toContain('Gracias means thanks')
    expect(warning.textContent).toContain('93%')
    expect(screen.fake.calls.findLast((c) => c.name === 'similar')!.body).toMatchObject({ front: 'Gracias means thank you', excludeId: 'a' })
    // Opening the similar card goes there.
    await screen.act(async () => click(byText('Gracias means thanks', 'button', warning)))
    await screen.settle()
    expect(front().value).toBe('Gracias means thanks')
  } finally {
    await screen.unmount()
  }
})

test('an exact duplicate says so', async () => {
  const screen = await open({ similar: [{ noteId: 'b', front: 'Hola', deck: null, score: 1, exact: true }] })
  try {
    await screen.act(async () => setValue(front(), 'Hola'))
    await screen.settle()
    expect(screen.container.textContent).toContain('You already have this card')
  } finally {
    await screen.unmount()
  }
})

test('a card in the Inbox shows a suggested deck and tags; choosing fills the form without saving', async () => {
  const inbox = fx.row('i1', 'Photosynthesis', { deckId: null })
  const screen = await open(
    { rows: [inbox], placement: [{ noteId: 'i1', deck: { id: 'd2', name: 'Biology', color: 2 }, tags: ['plants'], by: 'meaning' }] },
    'Open Photosynthesis',
  )
  try {
    expect(byLabel('Suggestions').textContent).toContain('Biology')
    await screen.act(async () => click(byLabel('Put in Biology')))
    await screen.act(async () => click(byLabel('Add the tag plants')))
    expect(field('Tags').value).toBe('plants')
    expect(byLabel('Deck', document.body).textContent).toContain('Biology')
    expect(screen.fake.writes).toHaveLength(0)
  } finally {
    await screen.unmount()
  }
})

test('a draft can be accepted from its card, and a deleted card asks first', async () => {
  const draft = fx.row('d', 'A draft', { status: 'draft' })
  const screen = await open({ rows: [draft] }, 'Open A draft')
  try {
    expect(screen.container.textContent).toContain('This is a draft')
    await screen.act(async () => click([...screen.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Accept'))!))
    await screen.settle()
    expect(screen.fake.writes[0]).toMatchObject({ name: 'drafts', body: { action: 'accept', ids: ['d'] } })

    await screen.act(async () => click([...screen.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Delete'))!))
    expect(document.body.textContent).toContain('Delete this card?')
    await screen.act(async () => click(byText('Delete card', 'button')))
    await screen.settle()
    expect(screen.fake.writes.at(-1)).toMatchObject({ name: 'noteRemove', method: 'DELETE' })
  } finally {
    await screen.unmount()
  }
})

test('a card removed elsewhere shows as gone, never as its last copy', async () => {
  const screen = await open()
  try {
    expect(front().value).toBe('Hola means hello')
    // The agent deletes it; the next change of the collection makes the open card read again.
    screen.fake.rows = screen.fake.rows.filter((r) => r.note.id !== 'a')
    await screen.act(async () => click(byLabel('Select Gracias means thanks')))
    await screen.act(async () => press(byLabel('More actions on the selection'), 'Enter'))
    await screen.act(async () => click([...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent === 'Pause')!))
    await screen.settle()
    expect(screen.container.textContent).toContain('This card is gone')
    expect(screen.container.querySelector('textarea')).toBeNull()
  } finally {
    await screen.unmount()
  }
})
