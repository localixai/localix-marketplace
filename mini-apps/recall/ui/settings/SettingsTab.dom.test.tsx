import { expect, test } from 'bun:test'
import { byLabel, byText, fx, mount, openTab, press, setValue, setupDom, click } from '../test-support'

setupDom()

async function openSettings(init: Parameters<typeof mount>[0] = {}) {
  const screen = await mount(init)
  await openTab(screen, 'Settings')
  return screen
}
const page = (screen: Awaited<ReturnType<typeof mount>>) => screen.container.querySelector<HTMLElement>('[role="tabpanel"][aria-labelledby$="settings"], [role="tabpanel"]:not(:empty)')!

test('Settings is a tab with grouped rows in plain words and the estimate for the chosen level', async () => {
  const screen = await openSettings()
  try {
    const text = page(screen).textContent!
    for (const word of ['Studying', 'Goal', 'AI help', 'How much do you want to remember?', 'New cards a day', 'Answer buttons', 'Day starts at', 'Daily goal', 'Check typed answers with AI', 'Uses your Decisions budget', 'Suggest decks and tags']) {
      expect(text).toContain(word)
    }
    expect(text).toContain('About 20 reviews a day at 90%')
    expect(byLabel<HTMLInputElement>('New cards a day').value).toBe('20')
    // No gear dialog and no Save button: each change is saved as it is made.
    expect(screen.container.querySelector('[aria-label="Settings"]')).toBeNull()
    expect([...page(screen).querySelectorAll('button')].some((b) => /save/i.test(b.textContent ?? ''))).toBe(false)
  } finally {
    await screen.unmount()
  }
})

test('choosing a level saves at once, shows Saved and updates the estimate', async () => {
  const screen = await openSettings()
  try {
    await screen.act(async () => click(byText('95%', '*', byLabel('How much do you want to remember?'))))
    await screen.settle()
    expect(screen.fake.writes).toHaveLength(1)
    expect(screen.fake.writes[0]).toMatchObject({ name: 'settingsUpdate', method: 'PATCH', body: { retention: 0.95 } })
    expect(page(screen).textContent).toContain('About 34 reviews a day at 95%')
    expect(page(screen).querySelector('[role="status"]')?.textContent).toBe('Saved')
  } finally {
    await screen.unmount()
  }
})

test('buttons, switches and the day start each save just that setting', async () => {
  const screen = await openSettings()
  try {
    await screen.act(async () => click(byText('Four buttons', '*', byLabel('Answer buttons'))))
    await screen.act(async () => click(byLabel('Check typed answers with AI')))
    await screen.act(async () => click(byLabel('Suggest decks and tags')))
    await screen.settle()
    expect(screen.fake.writes.map((w) => w.body)).toEqual([{ buttons: 'four' }, { typedAnswerCheck: true }, { suggestPlacement: false }])
  } finally {
    await screen.unmount()
  }
})

test('Studying has "Play sounds by themselves", on by default, and turning it off saves just that', async () => {
  const screen = await openSettings()
  try {
    const studying = page(screen).querySelector('section[aria-labelledby="settings-studying"]')!
    const sounds = byLabel<HTMLInputElement>('Play sounds by themselves')
    expect(sounds.checked).toBe(true)
    expect(studying.contains(sounds)).toBe(true)
    await screen.act(async () => click(sounds))
    await screen.settle()
    expect(screen.fake.writes.map((w) => w.body)).toEqual([{ autoplaySounds: false }])
    expect(byLabel<HTMLInputElement>('Play sounds by themselves').checked).toBe(false)
  } finally {
    await screen.unmount()
  }
})

test('a number saves when its field is left, and a bad one is explained and not sent', async () => {
  const screen = await openSettings()
  try {
    const goal = () => byLabel<HTMLInputElement>('Daily goal')
    await screen.act(async () => setValue(goal(), '50'))
    expect(screen.fake.writes).toHaveLength(0)
    await screen.act(async () => press(goal(), 'Enter'))
    await screen.settle()
    expect(screen.fake.writes[0]).toMatchObject({ name: 'settingsUpdate', body: { dailyGoal: 50 } })

    await screen.act(async () => setValue(goal(), '0'))
    await screen.act(async () => press(goal(), 'Enter'))
    expect(page(screen).textContent).toContain('Use a whole number from 1 to 5000.')
    expect(screen.fake.writes).toHaveLength(1)
  } finally {
    await screen.unmount()
  }
})

test('a refused change says why and goes back to what is stored', async () => {
  const screen = await openSettings({ settings: fx.settingsResult({ buttons: 'two' }) })
  try {
    screen.fake.refuse.settingsUpdate = 'Settings are locked right now.'
    await screen.act(async () => click(byText('Four buttons', '*', byLabel('Answer buttons'))))
    await screen.settle()
    expect(page(screen).querySelector('[role="alert"]')?.textContent).toContain('Settings are locked right now.')
    expect(page(screen).textContent).toContain('Again and Good.')
    expect(page(screen).textContent).not.toContain('Saved')
  } finally {
    await screen.unmount()
  }
})
