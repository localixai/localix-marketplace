import { expect, test } from 'bun:test'
import {
  byLabel,
  byRole,
  click,
  drag,
  mount,
  openMenu,
  press,
  setValue,
  setupDom,
} from './test-support'

setupDom()

const column = (screen: { container: HTMLElement }, name: string) =>
  screen.container.querySelector<HTMLElement>(`section[aria-label^="${name},"]`)!
const titles = (section: HTMLElement) =>
  [...section.querySelectorAll('article p.font-medium')].map((p) => p.textContent)

test('each column shows its cards, their count and their points, and the agent is told the same board', async () => {
  const screen = await mount()
  try {
    expect(titles(column(screen, 'In progress'))).toEqual(['Fix the login bug', 'Write the docs'])
    expect(column(screen, 'In progress').getAttribute('aria-label')).toBe('In progress, 2 cards')
    expect(column(screen, 'Backlog').getAttribute('aria-label')).toBe('Backlog, 1 card')
    expect(column(screen, 'In progress').querySelector('header')!.textContent).toContain('11 pts')
    // A column of cards with no points has no total to show.
    expect(column(screen, 'Review').querySelector('header')!.textContent).toContain('—')
    expect(column(screen, 'Done').textContent).toContain('No cards')
    // A late day says so in words as well as in colour.
    const late = byLabel('Fix the login bug').querySelector('time')!
    expect(late.textContent).toBe('2d ago')
    expect(late.className).toContain('text-status-error')
    expect(byLabel('Plan the launch').querySelector('time')!.textContent).toBe('in 3d')

    const published = screen.contexts.at(-1)
    expect(JSON.stringify(published)).toContain('In progress — 2 cards, 11 pts')
  } finally {
    await screen.unmount()
  }
})

test('a card moves to another stage from its menu, and the backend is asked for exactly that', async () => {
  const screen = await mount()
  try {
    await screen.act(async () => openMenu(byLabel('Actions for Plan the launch')))
    expect(byRole('menuitem').map((item) => item.textContent)).toEqual([
      'Move to In progress',
      'Move to Review',
      'Move to Done',
    ])
    await screen.act(async () => click(byRole('menuitem')[1]!))
    await screen.settle()

    expect(screen.server.writes).toEqual([
      {
        method: 'PATCH',
        path: '/rpc/example-board/cards/c1?sessionId=chat-1',
        body: { stage: 'review' },
      },
    ])
    expect(titles(column(screen, 'Review'))).toEqual(['Plan the launch', 'Ship v1'])
    expect(titles(column(screen, 'Backlog'))).toEqual([])
    expect(screen.container.querySelector('[role="status"]')!.textContent).toBe(
      'Moved Plan the launch to Review.',
    )
  } finally {
    await screen.unmount()
  }
})

test('Alt+Arrow moves the focused card one column, and stops at the last', async () => {
  const screen = await mount()
  try {
    await screen.act(async () => press(byLabel('Ship v1'), 'ArrowRight', { altKey: true }))
    await screen.settle()
    expect(screen.server.writes).toEqual([
      {
        method: 'PATCH',
        path: '/rpc/example-board/cards/c4?sessionId=chat-1',
        body: { stage: 'done' },
      },
    ])
    // Done is the last column: nothing further to move to.
    await screen.act(async () => press(byLabel('Ship v1'), 'ArrowRight', { altKey: true }))
    expect(screen.server.writes).toHaveLength(1)
    // Without Alt the arrow keys belong to the page.
    await screen.act(async () => press(byLabel('Ship v1'), 'ArrowLeft'))
    expect(screen.server.writes).toHaveLength(1)
  } finally {
    await screen.unmount()
  }
})

test('dragging a card shows where it can land, and dropping moves it', async () => {
  const screen = await mount()
  try {
    expect(screen.container.textContent).not.toContain('Drop here')
    await screen.act(async () => drag(byLabel('Plan the launch'), 'dragstart'))
    expect(column(screen, 'Done').textContent).toContain('Drop here')
    await screen.act(async () => drag(column(screen, 'Done'), 'dragover'))
    await screen.act(async () => drag(column(screen, 'Done'), 'drop'))
    await screen.settle()

    expect(screen.server.writes).toEqual([
      {
        method: 'PATCH',
        path: '/rpc/example-board/cards/c1?sessionId=chat-1',
        body: { stage: 'done' },
      },
    ])
    expect(titles(column(screen, 'Done'))).toEqual(['Plan the launch'])
    expect(screen.container.textContent).not.toContain('Drop here')
  } finally {
    await screen.unmount()
  }
})

test('dropping a card on its own column changes nothing', async () => {
  const screen = await mount()
  try {
    await screen.act(async () => drag(byLabel('Plan the launch'), 'dragstart'))
    await screen.act(async () => drag(column(screen, 'Backlog'), 'drop'))
    expect(screen.server.writes).toEqual([])
  } finally {
    await screen.unmount()
  }
})

test('a card the agent moves slides to its new column on the open board, with no click', async () => {
  const screen = await mount()
  try {
    expect(titles(column(screen, 'Review'))).toEqual(['Ship v1'])
    // The tool writes the chat's collection; the host nudges the board; the board re-reads.
    await screen.agentMoves('c3', 'review')
    expect(titles(column(screen, 'Review'))).toEqual(['Write the docs', 'Ship v1'])
    expect(titles(column(screen, 'In progress'))).toEqual(['Fix the login bug'])
    expect(screen.server.writes).toEqual([])
    // And the agent is told the board as it now stands.
    expect(JSON.stringify(screen.contexts.at(-1))).toContain('Review — 2 cards, 8 pts')
  } finally {
    await screen.unmount()
  }
})

test('a new card goes to the Backlog from the add form', async () => {
  const screen = await mount()
  try {
    const add = byLabel('Add a card').querySelector('button')!
    expect(add.disabled).toBe(true)
    await screen.act(async () =>
      setValue(byLabel('New card') as HTMLInputElement, 'Book the venue'),
    )
    await screen.act(async () => click(add))
    await screen.settle()
    expect(screen.server.writes).toEqual([
      {
        method: 'POST',
        path: '/rpc/example-board/cards?sessionId=chat-1',
        body: { title: 'Book the venue' },
      },
    ])
    expect((byLabel('New card') as HTMLInputElement).value).toBe('')
  } finally {
    await screen.unmount()
  }
})

test('while the first read is in flight every column shows skeletons, not "No cards"', async () => {
  const screen = await mount(undefined, { hold: true })
  try {
    expect(screen.container.querySelectorAll('section')).toHaveLength(4)
    expect(screen.container.querySelectorAll('article')).toHaveLength(0)
    expect(screen.container.textContent).not.toContain('No cards')
    screen.server.release()
    await screen.settle()
    expect(screen.container.querySelectorAll('article')).toHaveLength(4)
  } finally {
    await screen.unmount()
  }
})

test('an empty board says how to start, and a failed read says it could not load', async () => {
  const empty = await mount([])
  try {
    expect(empty.container.textContent).toContain('Add a card above, or ask in the chat')
  } finally {
    await empty.unmount()
  }
  const failed = await mount([], { failReads: true })
  try {
    expect(failed.container.textContent).toContain('Not loaded')
    expect(failed.container.textContent).not.toContain('Add a card above')
  } finally {
    await failed.unmount()
  }
})
