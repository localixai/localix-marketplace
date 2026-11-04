import { expect, test } from 'bun:test'
import { byLabel, byText, click, fx, mount, setupDom, type Mounted } from '../test-support'
import { takeLaunch } from '../launch'

setupDom()

const PATH = '/Users/me/Downloads/Learning_Greek.apkg'
const open = (init: Parameters<typeof mount>[0] = {}) => mount(init, { file: PATH })
const text = (screen: Mounted) => screen.container.textContent ?? ''
const button = (screen: Mounted, label: string) =>
  [...screen.container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!
const call = (screen: Mounted, name: string) => screen.fake.calls.filter((c) => c.name === name)

test('it reads the file by its path and shows what is inside before anything is imported', async () => {
  const screen = await open()
  try {
    expect(call(screen, 'importFilePreview').map((c) => c.body)).toEqual([{ path: PATH }])
    expect(screen.fake.writes).toHaveLength(0)
    expect(screen.container.querySelector('h1')?.textContent).toBe('Learning Greek for Beginners')
    expect(byLabel('About this file').textContent).toBe(
      'Anki deck · 2,524 cards · with sound · 103 MB',
    )

    const sample = byLabel('A look inside')
    expect(
      [...sample.querySelectorAll('li')].map((li) =>
        [...li.querySelectorAll('.recall-md')].map((md) => md.textContent),
      ),
    ).toEqual([
      ['1. να', 'so (that), to'],
      ['2. ο', 'the'],
      ['3. δε(ν)', 'no, not'],
      ['4. και', 'and'],
      ['5. η', 'the (feminine)'],
    ])
    expect(byLabel('Decks the cards go to').textContent).toContain('Learning Greek for Beginners')
    expect(byLabel('Decks the cards go to').textContent).toContain('2,524')
    expect(byLabel('Decks the cards go to').textContent).toContain('new')
    // Information is a muted notice, not an amber warning.
    expect(byLabel('Notes about the file').textContent).toContain(
      'A silent clip on every card was left out.',
    )
    expect(byLabel('Notes about the file').textContent).toContain(
      'No study history in the file, so every card starts as new.',
    )
    expect(screen.container.querySelector('[aria-label="Warnings"]')).toBeNull()
    expect(button(screen, 'Import 2,524 cards')).toBeTruthy()
  } finally {
    await screen.unmount()
  }
})

test('several decks, or none, title the tab with the file name; a deck already here says so', async () => {
  const screen = await open({
    filePreview: fx.ankiPreview({
      decks: [
        { name: 'Verbs', notes: 100, exists: true },
        { name: 'Nouns', notes: 200, exists: false },
      ],
      withProgress: 40,
    }),
  })
  try {
    expect(screen.container.querySelector('h1')?.textContent).toBe('Learning_Greek.apkg')
    expect(byLabel('About this file').textContent).toContain('with review history')
    const decks = byLabel('Decks the cards go to')
    expect(decks.textContent).toContain('already in Recall')
    expect(decks.textContent).toContain('new')
  } finally {
    await screen.unmount()
  }
})

test('a file with no sound and no history says neither', async () => {
  const screen = await open({
    filePreview: fx.ankiPreview({ sounds: 0, media: 0, notes: 3, cards: 3, warnings: [] }),
  })
  try {
    expect(byLabel('About this file').textContent).toBe('Anki deck · 3 cards · 103 MB')
    expect(screen.container.querySelector('[aria-label="Warnings"]')).toBeNull()
    expect(screen.container.querySelector('[aria-label="Keep Anki progress"]')).toBeNull()
    expect(screen.container.querySelector('[aria-label="Skip cards I already have"]')).toBeNull()
  } finally {
    await screen.unmount()
  }
})

test('the options are the request: ready to study by default, a deck of your own, progress, duplicates', async () => {
  const screen = await open({ filePreview: fx.ankiPreview({ withProgress: 40, duplicates: 312 }) })
  try {
    expect(text(screen)).toContain('312 of these are already in your cards')
    expect(button(screen, 'Import 2,212 cards')).toBeTruthy()

    await screen.act(async () => click(byLabel('Skip cards I already have')))
    expect(button(screen, 'Import 2,524 cards')).toBeTruthy()
    await screen.act(async () => click(byLabel('Keep Anki progress')))
    await screen.act(async () => click(byText('Drafts to look over first', '*', byLabel('Add as'))))
    await screen.act(async () => {
      byLabel('Put cards into').dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
      )
      click(byLabel('Put cards into'))
    })
    await screen.act(async () =>
      click(
        [...document.querySelectorAll('[role="option"]')].find((o) =>
          o.textContent?.startsWith('Biology'),
        )!,
      ),
    )
    await screen.act(async () => click(button(screen, 'Import 2,524 cards')))
    await screen.settle()

    expect(call(screen, 'importFileCommit').map((c) => c.body)).toEqual([
      { path: PATH, deckId: 'd2', status: 'draft', keepProgress: false, skipDuplicates: false },
    ])
  } finally {
    await screen.unmount()
  }
})

test("with the defaults it imports ready to study, into the file's decks, skipping what is already here", async () => {
  const screen = await open({ filePreview: fx.ankiPreview({ duplicates: 10 }) })
  try {
    await screen.act(async () => click(button(screen, 'Import 2,514 cards')))
    await screen.settle()
    expect(call(screen, 'importFileCommit').map((c) => c.body)).toEqual([
      { path: PATH, status: 'active', skipDuplicates: true },
    ])
  } finally {
    await screen.unmount()
  }
})

test('when everything is already here it says so, and offers nothing to import until duplicates are let in', async () => {
  const screen = await open({
    filePreview: fx.ankiPreview({ notes: 40, cards: 80, duplicates: 40 }),
  })
  try {
    expect(text(screen)).toContain('Everything here is already in Recall')
    expect(text(screen)).not.toContain('of these are already')
    expect(button(screen, 'Nothing new to import').hasAttribute('disabled')).toBe(true)
    await screen.act(async () => click(byLabel('Skip cards I already have')))
    expect(button(screen, 'Import 40 cards').hasAttribute('disabled')).toBe(false)
  } finally {
    await screen.unmount()
  }
})

test('importing says it can take a minute, then shows what was added and where, and opens Recall', async () => {
  const screen = await open()
  try {
    let release: () => void = () => {}
    screen.fake.hold = new Promise<void>((resolve) => (release = resolve))
    await screen.act(async () => click(button(screen, 'Import 2,524 cards')))
    const progress = screen.container.querySelector('[role="status"]')!
    expect(progress.textContent).toContain('Importing…')
    expect(progress.textContent).toContain('a deck with sound can take a minute')
    expect(button(screen, 'Import 2,524 cards')).toBeUndefined()
    release()
    await screen.settle()

    const done = byLabel('Imported')
    expect(done.textContent).toContain('Added 2,524 cards')
    expect(done.textContent).toContain('Into Learning Greek for Beginners (2,524).')
    expect(done.textContent).toContain('They are ready to study.')

    await screen.act(async () => click(button(screen, 'Open in Recall')))
    expect(screen.fake.opened).toEqual([
      { workKind: 'recall:screen', id: 'recall:screen', title: 'Recall', scope: null },
    ])
    expect(takeLaunch()).toEqual({ show: 'cards', preset: { deck: 'd7' } })
  } finally {
    await screen.unmount()
  }
})

test('Study now asks the screen to study the imported decks, and is offered only for ready cards', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(button(screen, 'Import 2,524 cards')))
    await screen.settle()
    await screen.act(async () => click(button(screen, 'Study now')))
    expect(takeLaunch()).toEqual({
      show: 'study',
      target: { deckIds: ['d7'], label: 'Learning Greek for Beginners' },
    })
    expect(screen.fake.opened).toHaveLength(1)
  } finally {
    await screen.unmount()
  }
  const drafts = await open({ fileImported: fx.ankiImported({ status: 'draft' }) })
  try {
    await drafts.act(async () => click(button(drafts, 'Import 2,524 cards')))
    await drafts.settle()
    expect(text(drafts)).toContain('drafts')
    expect(button(drafts, 'Study now')).toBeUndefined()
    await drafts.act(async () => click(button(drafts, 'Open in Recall')))
    expect(takeLaunch()).toEqual({ show: 'cards', preset: { deck: 'd7', state: 'draft' } })
  } finally {
    await drafts.unmount()
  }
})

test('skipped duplicates, progress and warnings are told in the result', async () => {
  const screen = await open({
    fileImported: fx.ankiImported({
      added: 2212,
      skippedDuplicates: 312,
      reviewsReplayed: 90,
      warnings: ['1 sound is not in the file and was dropped.'],
    }),
  })
  try {
    await screen.act(async () => click(button(screen, 'Import 2,524 cards')))
    await screen.settle()
    const done = byLabel('Imported').textContent!
    expect(done).toContain('Added 2,212 cards')
    expect(done).toContain('Skipped 312 you already had')
    expect(done).toContain('Kept 90 past answers')
    expect(done).toContain('1 sound is not in the file')
  } finally {
    await screen.unmount()
  }
})

for (const [message, title] of [
  ['This is not an Anki package: it holds no collection.', 'This is not an Anki file'],
  ['That file is larger than 512 MB.', 'This file is too big'],
  ['The Anki collection in this file is not readable.', 'This is not an Anki file'],
  ['There is no file at /Users/me/Downloads/Learning_Greek.apkg.', 'The file could not be read'],
] as const) {
  test(`"${message}" is shown with its message and Try again`, async () => {
    const screen = await mount({ refuse: { importFilePreview: message } }, { file: PATH })
    try {
      const alert = screen.container.querySelector('[role="alert"]')!
      expect(alert.textContent).toContain(title)
      expect(alert.textContent).toContain(message)
      expect(button(screen, 'Try again')).toBeTruthy()
      expect(button(screen, 'Import 2,524 cards')).toBeUndefined()
    } finally {
      await screen.unmount()
    }
  })
}

test('Try again reads the file again and shows it when it works', async () => {
  const screen = await mount(
    { refuse: { importFilePreview: 'The Anki collection in this file is not readable.' } },
    { file: PATH },
  )
  try {
    expect(call(screen, 'importFilePreview')).toHaveLength(1)
    screen.fake.refuse = {}
    await screen.act(async () => click(button(screen, 'Try again')))
    await screen.settle()
    expect(call(screen, 'importFilePreview')).toHaveLength(2)
    expect(button(screen, 'Import 2,524 cards')).toBeTruthy()
  } finally {
    await screen.unmount()
  }
})

test('an import that fails keeps the person where they were and Try again sends it once more', async () => {
  const screen = await open()
  try {
    screen.fake.refuse = { importFileCommit: 'The disk is full.' }
    await screen.act(async () => click(button(screen, 'Import 2,524 cards')))
    await screen.settle()
    expect(screen.container.querySelector('[role="alert"]')?.textContent).toContain(
      'The disk is full.',
    )
    screen.fake.refuse = {}
    await screen.act(async () => click(button(screen, 'Try again')))
    await screen.settle()
    expect(call(screen, 'importFileCommit')).toHaveLength(2)
    expect(text(screen)).toContain('Added 2,524 cards')
  } finally {
    await screen.unmount()
  }
})

test('the agent is told which deck is open, how big it is, and what it holds', async () => {
  const screen = await open({ filePreview: fx.ankiPreview({ withProgress: 40 }) })
  try {
    const told = JSON.stringify(screen.contexts.filter(Boolean).at(-1))
    expect(told).toContain('An Anki deck is open: Learning Greek for Beginners, 2,524 cards')
    expect(told).toContain('2,524 cards')
    expect(told).not.toContain('5,048')
    expect(told).toContain('with sound')
    expect(told).toContain('review history')
    expect(told).toContain(PATH)
    expect(told).toContain('recall_import_file')
  } finally {
    await screen.unmount()
  }
})

test('warnings keep the amber box and notices of the result stay muted; a result without notices still reads', async () => {
  const screen = await open({
    filePreview: fx.ankiPreview({
      warnings: ['3 notes without a front or back skipped'],
      notices: [],
    }),
    fileImported: {
      ...fx.ankiImported({ warnings: ['1 sound is not in the file and was dropped.'] }),
      notices: undefined as unknown as string[],
    },
  })
  try {
    expect(byLabel('Warnings').textContent).toContain('3 notes without a front')
    expect(screen.container.querySelector('[aria-label="Notes about the file"]')).toBeNull()
    await screen.act(async () => click(button(screen, 'Import 2,524 cards')))
    await screen.settle()
    expect(byLabel('Imported').textContent).toContain('1 sound is not in the file')
  } finally {
    await screen.unmount()
  }
})

test('the result sentence names the deck with the count and one full stop, no space before it', async () => {
  const screen = await open({
    fileImported: fx.ankiImported({
      notices: ['No study history in the file, so every card starts as new.'],
      decks: [
        {
          id: 'd7',
          name: 'Learning Greek for Beginners: 2500 Most Common Greek Words',
          color: 3,
          notes: 2524,
        },
      ],
    }),
  })
  try {
    await screen.act(async () => click(button(screen, 'Import 2,524 cards')))
    await screen.settle()
    const lines = [...byLabel('Imported').querySelectorAll('li')].map((li) => li.textContent)
    expect(lines).toContain(
      'Into Learning Greek for Beginners: 2500 Most Common Greek Words (2,524).',
    )
    expect(lines).toContain('They are ready to study.')
    expect(lines).toContain('No study history in the file, so every card starts as new.')
  } finally {
    await screen.unmount()
  }
})
