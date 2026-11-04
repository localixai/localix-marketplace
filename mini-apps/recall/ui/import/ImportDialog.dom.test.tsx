import { expect, test } from 'bun:test'
import { byLabel, byText, click, fx, mount, press, setupDom, type Mounted } from '../test-support'

setupDom()

async function openImport(init: Parameters<typeof mount>[0] = {}) {
  const screen = await mount(init)
  await screen.act(async () => click(byLabel('Import cards')))
  await screen.settle()
  return { screen, dialog: () => document.body.querySelector('[role="dialog"]')! as HTMLElement }
}

async function choose(screen: Mounted, name: string, bytes = 'front,back\nHola,Hello') {
  const input = byLabel<HTMLInputElement>('Choose a file to import')
  const file = new File([bytes], name, { type: 'text/csv' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await screen.act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })))
  await screen.settle()
}

test('choosing a file shows what is in it before anything is imported', async () => {
  const { screen, dialog } = await openImport()
  try {
    expect(dialog().textContent).toContain('Drop a file here')
    expect(byLabel<HTMLInputElement>('Choose a file to import').accept).toBe('.apkg,.colpkg,.csv,.tsv,.txt,.md,.json')
    await choose(screen, 'spanish.csv')

    const text = dialog().textContent!
    expect(text).toContain('spanish.csv')
    expect(text).toContain('Cards3')
    expect(text).toContain('Duplicates1')
    expect(text).toContain('Spanish')
    expect(text).toContain('One row had no back.')
    expect(text).toContain('Hola')
    expect(screen.fake.calls.find((c) => c.name === 'importPreview')!.query.get('name')).toBe('spanish.csv')
    expect(screen.fake.writes).toHaveLength(0)
  } finally {
    await screen.unmount()
  }
})

test('Import sends the options, shows the result and Open imported cards lands on the drafts', async () => {
  const draft = fx.row('d', 'Imported draft', { status: 'draft' })
  const { screen, dialog } = await openImport({ rows: [draft, fx.row('x', 'Not a draft')] })
  try {
    await choose(screen, 'spanish.csv')
    // Defaults: drafts, skip duplicates. Choose the deck and ready cards.
    await screen.act(async () => click(byText('Ready to study', '*', byLabel('Start as', dialog()))))
    await screen.act(async () => click(byText('Import 3 notes', 'button', dialog())))
    await screen.settle()

    const commit = screen.fake.calls.find((c) => c.name === 'importCommit')!
    expect(commit.method).toBe('POST')
    expect(commit.query.get('name')).toBe('spanish.csv')
    expect(commit.query.get('status')).toBe('active')
    expect(commit.query.get('skipDuplicates')).toBe('true')
    expect(commit.query.get('deckId')).toBeNull()
    expect(commit.body).toEqual({ bytes: true, name: 'spanish.csv' })

    expect(dialog().textContent).toContain('Imported 2 notes (2 cards)')
    expect(dialog().textContent).toContain('Skipped 1 duplicate')
    await screen.act(async () => click(byText('Open imported cards', 'button', dialog())))
    await screen.settle()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(screen.container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Cards')
  } finally {
    await screen.unmount()
  }
})

test('an Anki file offers to keep its progress; the choice is sent', async () => {
  const { screen, dialog } = await openImport({ preview: { ...fx_preview(), withProgress: 40, format: 'apkg' } })
  try {
    await choose(screen, 'deck.apkg')
    await screen.act(async () => click(byLabel('Keep Anki progress', dialog())))
    await screen.act(async () => click(byText('Import 3 notes', 'button', dialog())))
    await screen.settle()
    expect(screen.fake.calls.find((c) => c.name === 'importCommit')!.query.get('keepProgress')).toBe('false')
  } finally {
    await screen.unmount()
  }
})

test('a file that cannot be read says why and lets the person choose another', async () => {
  const { screen, dialog } = await openImport()
  try {
    screen.fake.refuse.importPreview = 'That is not a deck file.'
    await choose(screen, 'notes.png')
    expect(dialog().textContent).toContain('That is not a deck file.')
    expect(dialog().textContent).toContain('Drop a file here')
  } finally {
    await screen.unmount()
  }
})

test('export offers JSON, CSV and Markdown through the host save flow', async () => {
  const screen = await mount()
  try {
    await screen.act(async () => press(byLabel('Export cards'), 'Enter'))
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)
    expect(items).toEqual(['Backup (JSON)', 'Spreadsheet (CSV)', 'Notes (Markdown)'])
    await screen.act(async () => click([...document.querySelectorAll('[role="menuitem"]')][1]!))
    await screen.settle()
    expect(screen.fake.calls.find((c) => c.name === 'export')!.query.get('format')).toBe('csv')
    expect(screen.fake.saved).toEqual(['recall.csv'])
  } finally {
    await screen.unmount()
  }
})

function fx_preview() {
  return {
    source: 'deck.apkg',
    format: 'csv' as const,
    notes: 3,
    cards: 3,
    decks: [{ name: 'Spanish', notes: 3, exists: true }],
    duplicates: 0,
    withProgress: 0,
    media: 0,
    warnings: [],
    sample: [],
  }
}
