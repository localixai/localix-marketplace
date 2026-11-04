import { expect, test } from 'bun:test'
import { byLabel, click, fx, mount, openTab, setupDom } from '../test-support'
import { CELL, GAP, MOST_WEEKS, weeksThatFit } from '../today/Heat'

setupDom()

test('Stats says how much was remembered against the target, and how long was studied', async () => {
  const screen = await mount()
  try {
    await openTab(screen, 'Stats')
    const text = screen.container.textContent!
    expect(text).toContain('Remembered91%')
    expect(text).toContain('on target 90%')
    expect(text).toContain('Studied today10 min')
    // Units are small and muted right after the number, not at the figure's size.
    const tile = [...screen.container.querySelectorAll('div')].find((d) => d.textContent === 'Studied today10 min' && d.className.includes('rounded-lg'))!
    const unit = [...tile.querySelectorAll('span')].find((x) => x.textContent === 'min')!
    expect(unit.className).toContain('text-xs')
    expect(unit.className).toContain('text-text-faint')
    // One separator system: sections are headed by spacing, not drawn between rules.
    expect(screen.container.querySelectorAll('section.border-y')).toHaveLength(0)
    expect(text).toContain('Last 30 days2 h')
    // Cards are what the person wrote: 200 notes, not the 230 study items.
    expect(text).toContain('Cards200')
    expect(text).not.toContain('230')
    expect(text).toContain('1,500 answers so far')
    expect(text).toContain('Due in the next 30 days')
    expect(text).toContain('Reviews per day, last 90 days')
    expect(text).toContain('Hard cards')
    expect(JSON.stringify(screen.contexts.at(-1))).toContain('Remembered 91% of 240 reviews')
  } finally {
    await screen.unmount()
  }
})

test('below the target is said plainly', async () => {
  const low = await mount({ stats: fx.stats({ retention: { actual: 0.82, target: 0.9, reviews: 50 } }) })
  try {
    await openTab(low, 'Stats')
    expect(low.container.textContent).toContain('Remembered82%below target 90%')
  } finally {
    await low.unmount()
  }
})

test("today's answers count: a few say they are too few to tell, none say none", async () => {
  const few = await mount({
    stats: fx.stats({
      retention: { actual: null, target: 0.9, reviews: 0 },
      perDay: fx.stats().perDay.map((d, i, all) => (i === all.length - 1 ? { ...d, reviews: 1, correct: 1 } : { ...d, reviews: 0, correct: 0 })),
    }),
  })
  try {
    await openTab(few, 'Stats')
    expect(few.container.textContent).toContain('Remembered—')
    expect(few.container.textContent).toContain('1 answer — too few to tell')
    expect(few.container.textContent).not.toContain('no answers in 30 days')
  } finally {
    await few.unmount()
  }
  const none = await mount({ stats: fx.stats({ retention: { actual: null, target: 0.9, reviews: 0 }, perDay: fx.stats().perDay.map((d) => ({ ...d, reviews: 0, correct: 0 })) }) })
  try {
    await openTab(none, 'Stats')
    expect(none.container.textContent).toContain('no answers in 30 days')
  } finally {
    await none.unmount()
  }
  // With enough answers (new cards included) the percentage is shown even without review-card data.
  const enough = await mount({ stats: fx.stats({ retention: { actual: null, target: 0.9, reviews: 0 }, perDay: fx.stats().perDay.map((d, i, all) => (i >= all.length - 3 ? { ...d, reviews: 4, correct: 3 } : { ...d, reviews: 0, correct: 0 })) }) })
  try {
    await openTab(enough, 'Stats')
    expect(enough.container.textContent).toContain('Remembered75%')
  } finally {
    await enough.unmount()
  }
})

test('Activity is a weekday-by-week grid with today in its place, month labels and square cells', async () => {
  const screen = await mount()
  try {
    await openTab(screen, 'Stats')
    const grid = screen.container.querySelector<HTMLElement>('.recall-heat')!
    const today = grid.querySelector<HTMLElement>('[data-today="true"]')!
    const weekday = (new Date('2026-11-04T00:00:00Z').getUTCDay() + 6) % 7
    // Without a measured width the grid draws 26 weeks: 27 columns with the weekday labels.
    expect(today.style.gridColumn).toBe('27')
    expect(today.style.gridRow).toBe(String(weekday + 2))
    expect(screen.fake.calls.findLast((c) => c.name === 'heatmap')!.query.get('weeks')).toBe('53')
    const cells = [...grid.querySelectorAll<HTMLElement>('.recall-heat-cell')]
    expect(new Set(cells.map((c) => `${c.style.gridColumn}/${c.style.gridRow}`)).size).toBe(26 * 7)
    expect(Math.max(...cells.map((c) => Number(c.style.gridRow)))).toBe(8)
    expect(cells.filter((c) => c.dataset.empty === 'true')).toHaveLength(6 - weekday)
    expect(grid.textContent).toContain('Mon')
    expect(grid.textContent).toContain('Nov')
    expect(grid.getAttribute('aria-label')).toMatch(/^Reviews in the last 26 weeks: \d+ reviews, goal met on \d+ days$/)
  } finally {
    await screen.unmount()
  }
})

test('a hardest card opens in Cards, and the list links to all hard cards', async () => {
  const hard = fx.row('h1', 'Subjunctive trigger', {}, { lapses: 9, leech: true })
  const screen = await mount({ rows: [hard], stats: fx.stats({ hardest: [hard] }) })
  try {
    await openTab(screen, 'Stats')
    const list = byLabel('Hardest cards')
    expect(list.textContent).toContain('Subjunctive trigger')
    expect(list.textContent).toContain('9 misses')
    await screen.act(async () => click([...list.querySelectorAll('button')].find((b) => b.textContent?.includes('Subjunctive'))!))
    await screen.settle()
    expect(screen.container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Cards')
    expect(screen.container.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Subjunctive trigger')
  } finally {
    await screen.unmount()
  }
})

test('nothing studied yet says what will appear; a failed read can be tried again', async () => {
  const empty = await mount({ stats: fx.stats({ totals: { notes: 0, cards: 0, reviews: 0 } }) })
  try {
    await openTab(empty, 'Stats')
    expect(empty.container.textContent).toContain('Nothing to show yet')
  } finally {
    await empty.unmount()
  }
  const screen = await mount()
  try {
    screen.fake.failReads = true
    await openTab(screen, 'Stats')
    expect(screen.container.querySelector('[role="alert"]')?.textContent).toContain('The numbers could not be loaded')
    screen.fake.failReads = false
    await screen.act(async () => click([...screen.container.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!))
    await screen.settle()
    expect(screen.container.textContent).toContain('Remembered91%')
  } finally {
    await screen.unmount()
  }
})

test('the grid draws small fixed cells and as many weeks as fit, from 4 up to a year', () => {
  expect(CELL).toBeLessThanOrEqual(13)
  expect(GAP).toBe(3)
  expect(weeksThatFit(null)).toBe(26)
  expect(weeksThatFit(60)).toBe(4)
  expect(weeksThatFit(400)).toBe(Math.floor((400 - 28) / (CELL + GAP)))
  expect(weeksThatFit(5000)).toBe(MOST_WEEKS)
})
