import { expect, test } from 'bun:test'
import { byLabel, click, fx, mount, press, setValue, setupDom, type Mounted } from '../test-support'

setupDom()

const ratings = (screen: Mounted) =>
  screen.fake.writes.filter((w) => w.name === 'studyGrade').map((w) => w.body.rating)

async function begin(screen: Mounted, button = 'Study') {
  const target = button === 'Study' ? [...byLabel('Study now', screen.container).querySelectorAll('button')].find((b) => b.textContent?.includes('Study'))! : byLabel(button)
  await screen.act(async () => click(target))
  await screen.settle()
  return byLabel('Study session', screen.container)
}

test('Space turns the card over, then Space answers Good and the next card appears', async () => {
  const screen = await mount()
  try {
    const study = await begin(screen)
    expect(study.textContent).toContain('What is the capital of France?')
    expect(study.textContent).toContain('1 of 2')
    expect(study.textContent).not.toContain('Paris')

    await screen.act(async () => press(study, ' '))
    expect(byLabel('Answer', study).textContent).toContain('Paris')
    // Two buttons, each with its interval.
    expect(byLabel('Again, back in 10 min')).toBeTruthy()
    expect(byLabel('Good, back in 3 d')).toBeTruthy()

    await screen.act(async () => press(study, ' '))
    await screen.settle()
    expect(ratings(screen)).toEqual([3])
    expect(study.textContent).toContain('Hola')
    expect(study.textContent).toContain('2 of 2')
    const grade = screen.fake.writes.find((w) => w.name === 'studyGrade')!
    expect(grade.body).toMatchObject({ cardId: 's1', rating: 3, durationMs: expect.any(Number) })
  } finally {
    await screen.unmount()
  }
})

test('1 answers Again, but only once the card is turned over', async () => {
  const screen = await mount()
  try {
    const study = await begin(screen)
    await screen.act(async () => press(study, '1'))
    expect(ratings(screen)).toEqual([])
    await screen.act(async () => press(study, ' '))
    await screen.act(async () => press(study, '1'))
    await screen.settle()
    expect(ratings(screen)).toEqual([1])
  } finally {
    await screen.unmount()
  }
})

test('with four buttons the settings show Again, Hard, Good and Easy, and 4 is Easy', async () => {
  const screen = await mount({ settings: fx.settingsResult({ buttons: 'four' }) })
  try {
    const study = await begin(screen)
    await screen.act(async () => press(study, ' '))
    expect([...byLabel('How well did you remember?', study).querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Again, back in 10 min',
      'Hard, back in 1 d',
      'Good, back in 3 d',
      'Easy, back in 9 d',
    ])
    await screen.act(async () => press(study, '4'))
    await screen.settle()
    expect(ratings(screen)).toEqual([4])
  } finally {
    await screen.unmount()
  }
})

test('Z undoes the last answer and brings that card back to be asked again', async () => {
  const screen = await mount()
  try {
    const study = await begin(screen)
    await screen.act(async () => press(study, ' '))
    await screen.act(async () => press(study, ' '))
    await screen.settle()
    expect(study.textContent).toContain('Hola')

    await screen.act(async () => press(study, 'z'))
    await screen.settle()
    expect(screen.fake.writes.some((w) => w.name === 'studyUndo')).toBe(true)
    expect(study.textContent).toContain('What is the capital of France?')
    expect(study.textContent).toContain('1 of 2')
    expect(study.textContent).toContain('Last answer undone.')
  } finally {
    await screen.unmount()
  }
})

test('a typed card takes an answer, shows how it was judged and proposes the grade', async () => {
  const typed = fx.studyCard('t1', 'Capital of France?', { typed: true, expected: 'Paris' }, { kind: 'typed', back: 'Paris' })
  const screen = await mount({ queue: [typed] })
  try {
    const study = await begin(screen)
    const input = byLabel<HTMLInputElement>('Your answer', study)
    await screen.act(async () => setValue(input, 'paris'))
    await screen.act(async () => press(input, 'Enter'))
    await screen.settle()
    const check = screen.fake.calls.find((c) => c.name === 'studyCheck')!
    expect(check.body).toEqual({ cardId: 't1', answer: 'paris' })
    expect(study.textContent).toContain('You wrote: paris')
    expect(study.textContent).toContain('Correct')
    expect(byLabel('Good, back in 3 d').getAttribute('data-suggested')).toBe('true')
    // Space confirms the suggestion.
    await screen.act(async () => press(study, ' '))
    await screen.settle()
    expect(ratings(screen)).toEqual([3])
  } finally {
    await screen.unmount()
  }
})

test('when no grade is proposed the person chooses, and Space does not guess', async () => {
  const typed = fx.studyCard('t1', 'Capital of France?', { typed: true }, { kind: 'typed', back: 'Paris' })
  const screen = await mount({ queue: [typed], check: { verdict: 'unsure', rating: null, by: 'none', expected: 'Paris' } })
  try {
    const study = await begin(screen)
    const input = byLabel<HTMLInputElement>('Your answer', study)
    await screen.act(async () => setValue(input, 'Lyon'))
    await screen.act(async () => press(input, 'Enter'))
    await screen.settle()
    expect(study.textContent).toContain('Not sure — you decide')
    await screen.act(async () => press(study, ' '))
    expect(ratings(screen)).toEqual([])
    await screen.act(async () => press(study, '1'))
    await screen.settle()
    expect(ratings(screen)).toEqual([1])
  } finally {
    await screen.unmount()
  }
})

test('a cloze card shows its blank, and fills it when turned over', async () => {
  const cloze = fx.studyCard('c1', 'The capital of France is {{c1::Paris::city}}', { cloze: 1, prompt: 'The capital of France is [city]', answer: 'The capital of France is **Paris**' }, { kind: 'cloze', front: 'The capital of France is {{c1::Paris::city}}', back: '' })
  const screen = await mount({ queue: [cloze] })
  try {
    const study = await begin(screen)
    expect(study.querySelector('.recall-blank')?.textContent).toBe('city')
    expect(study.textContent).not.toContain('Paris')
    await screen.act(async () => press(study, ' '))
    expect(study.querySelector('.recall-filled')?.textContent).toBe('Paris')
    expect(study.querySelector('.recall-blank')).toBeNull()
  } finally {
    await screen.unmount()
  }
})

test('the end screen counts the session, shows when the next card is, and takes the misses to the chat', async () => {
  const screen = await mount({ queue: [fx.studyCard('s1', 'Capital of France?'), fx.studyCard('s2', 'Hola')] })
  try {
    const study = await begin(screen)
    await screen.act(async () => press(study, ' '))
    await screen.act(async () => press(study, '1'))
    await screen.settle()
    await screen.act(async () => press(study, ' '))
    await screen.act(async () => press(study, ' '))
    await screen.settle()

    const summary = byLabel('Session summary', study)
    expect(summary.textContent).toContain('Reviewed2')
    expect(summary.textContent).toContain('Remembered50%')
    expect(summary.textContent).toContain('Missed (1)')
    expect(summary.textContent).toContain('Capital of France?')
    const explain = [...summary.querySelectorAll('button')].find((b) => b.textContent === 'Explain my misses in the chat')!
    await screen.act(async () => click(explain))
    expect(screen.fake.composer).toHaveLength(1)
    expect(screen.fake.composer[0]!.text).toContain('Capital of France?')
    expect(screen.fake.composer[0]!.text).toContain('n-s1')

    await screen.act(async () => click([...summary.querySelectorAll('button')].find((b) => b.textContent === 'Done')!))
    expect(screen.container.querySelector('[aria-label="Study session"]')).toBeNull()
    expect(screen.container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Today')
  } finally {
    await screen.unmount()
  }
})

test('Esc ends the session: the summary first when something was answered, then back where you were', async () => {
  const screen = await mount()
  try {
    const study = await begin(screen)
    await screen.act(async () => press(study, 'Escape'))
    expect(screen.container.querySelector('[aria-label="Study session"]')).toBeNull()

    const again = await begin(screen)
    await screen.act(async () => press(again, ' '))
    await screen.act(async () => press(again, ' '))
    await screen.settle()
    await screen.act(async () => press(again, 'Escape'))
    expect(byLabel('Session summary', again).textContent).toContain('Session paused')
    await screen.act(async () => press(again, 'Escape'))
    expect(screen.container.querySelector('[aria-label="Study session"]')).toBeNull()
  } finally {
    await screen.unmount()
  }
})

test('P pauses and S skips the card until tomorrow, each answered with the next card', async () => {
  const screen = await mount({ queue: [fx.studyCard('s1', 'One'), fx.studyCard('s2', 'Two'), fx.studyCard('s3', 'Three')] })
  try {
    const study = await begin(screen)
    await screen.act(async () => press(study, 'p'))
    await screen.settle()
    expect(study.textContent).toContain('Two')
    expect(study.textContent).toContain('Card paused.')
    await screen.act(async () => press(study, 's'))
    await screen.settle()
    expect(study.textContent).toContain('Three')
    expect(screen.fake.writes.map((w) => w.name).filter((n) => n === 'studyPause' || n === 'studySkip')).toEqual(['studyPause', 'studySkip'])
  } finally {
    await screen.unmount()
  }
})

test('a card that just became hard says so and offers a rewrite in the chat', async () => {
  const screen = await mount({ becameHard: true })
  try {
    const study = await begin(screen)
    await screen.act(async () => press(study, ' '))
    await screen.act(async () => press(study, '1'))
    await screen.settle()
    expect(study.textContent).toContain('That is a hard card now.')
    const rewrite = [...study.querySelectorAll('button')].find((b) => b.textContent?.includes('Rewrite with the agent'))!
    await screen.act(async () => click(rewrite))
    expect(screen.fake.composer[0]!.text).toContain('What is the capital of France?')
    expect(screen.fake.composer[0]!.text).toContain('recall_update_card')
    expect(screen.fake.composer[0]!.submit).toBeUndefined()
  } finally {
    await screen.unmount()
  }
})

test('E edits the card in place and the changed text shows without leaving the session', async () => {
  const screen = await mount()
  try {
    const study = await begin(screen)
    await screen.act(async () => press(study, 'e'))
    await screen.settle()
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Edit card')
    // The dialog's keys do not reach the session.
    const dialog = document.body.querySelector('[role="dialog"]')!
    await screen.act(async () => press(dialog.querySelector('textarea')!, 'p'))
    expect(screen.fake.writes.some((w) => w.name === 'studyPause')).toBe(false)
  } finally {
    await screen.unmount()
  }
})

test('nothing to study says so instead of an empty card, and when the next one comes', async () => {
  const screen = await mount({
    queue: [],
    today: fx.today({ due: { learning: 0, review: 0, new: 0, total: 0 }, nextDueAt: new Date(Date.now() + 10 * 60_000).toISOString() }),
  })
  try {
    const study = await begin(screen, 'Study Spanish')
    expect(study.textContent).toContain('Nothing to study right now')
    expect(study.textContent).toMatch(/Next card: (tomorrow |\d+ \w+ )?\d\d:\d\d\./)
  } finally {
    await screen.unmount()
  }
})

test('the summary stops the clock and the progress, and offers what is still waiting today', async () => {
  const screen = await mount({ queue: [fx.studyCard('s1', 'One')], today: fx.today({ due: { learning: 0, review: 0, new: 13, total: 13 } }) })
  try {
    const study = await begin(screen)
    expect(study.querySelector('[aria-label="Time studied"]')).not.toBeNull()
    expect(study.textContent).toContain('1 of 1')
    await screen.act(async () => press(study, ' '))
    await screen.act(async () => press(study, ' '))
    await screen.settle()
    const summary = byLabel('Session summary', study)
    expect(study.querySelector('[aria-label="Time studied"]')).toBeNull()
    expect(study.textContent).not.toContain('1 of 1')
    expect(study.textContent).toContain('Finished')
    expect(summary.textContent).toContain('13 more today')
    expect(summary.textContent).not.toContain('Next—')
    expect([...summary.querySelectorAll('button')].some((b) => b.textContent === 'Keep studying')).toBe(true)
  } finally {
    await screen.unmount()
  }
})

test('with a learning card due soon the summary says when, not a dash', async () => {
  const soon = new Date(Date.now() + 10 * 60_000).toISOString()
  const screen = await mount({ queue: [fx.studyCard('s1', 'One')], today: fx.today({ due: { learning: 0, review: 0, new: 0, total: 0 }, nextDueAt: soon }) })
  try {
    const study = await begin(screen, 'Study Spanish')
    await screen.act(async () => press(study, ' '))
    await screen.act(async () => press(study, ' '))
    await screen.settle()
    expect(byLabel('Session summary', study).textContent).toMatch(/Nextin (9|10) min/)
  } finally {
    await screen.unmount()
  }
})
