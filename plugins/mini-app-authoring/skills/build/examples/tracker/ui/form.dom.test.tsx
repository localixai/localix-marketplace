import { expect, test } from 'bun:test'
import { byLabel, byText, choose, click, field, mount, setValue, setupDom } from './test-support'

setupDom()

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const submitButton = (label: string) => byText(label, 'button', dialog()!)
const openNew = (screen: Awaited<ReturnType<typeof mount>>) =>
  screen.act(async () => click(byText('New application', 'button', screen.container)))

test('submitting an empty form shows each field its own sentence, sends nothing and focuses the first', async () => {
  const screen = await mount()
  try {
    await openNew(screen)
    // The dialog opens on its first field, not on the close button.
    expect(document.activeElement).toBe(field('Role'))

    await screen.act(async () => click(submitButton('Add application')))

    const text = dialog()!.textContent
    expect(text).toContain('Name the role.')
    expect(text).toContain('Pick a company.')
    expect(screen.backend.writes).toEqual([])
    expect(document.activeElement).toBe(field('Role'))
    expect(field('Role').getAttribute('aria-invalid')).toBe('true')
    expect(field('Role').getAttribute('aria-describedby')).toContain('error')

    // Typing answers the error on that field only.
    await screen.act(async () => setValue(field('Role'), 'Analyst'))
    expect(dialog()!.textContent).not.toContain('Name the role.')
    expect(dialog()!.textContent).toContain('Pick a company.')
  } finally {
    await screen.unmount()
  }
})

test('the shared schema judges the pay too: a negative amount gets its sentence', async () => {
  const screen = await mount()
  try {
    await openNew(screen)
    await screen.act(async () => setValue(field('Role'), 'Analyst'))
    await choose(screen, field<HTMLElement>('Company'), 'Globex')
    await screen.act(async () => setValue(field('Yearly pay (USD)'), '-5'))
    await screen.act(async () => click(submitButton('Add application')))

    expect(dialog()!.textContent).toContain('Enter an amount above 0.')
    expect(screen.backend.writes).toEqual([])
    expect(document.activeElement).toBe(field('Yearly pay (USD)'))
  } finally {
    await screen.unmount()
  }
})

test('a filled form creates the application, closes and shows it in the list', async () => {
  const screen = await mount()
  try {
    await openNew(screen)
    await screen.act(async () => setValue(field('Role'), 'Data analyst'))
    await choose(screen, field<HTMLElement>('Company'), 'Globex')
    await choose(screen, field<HTMLElement>('Status'), 'Applied')
    await screen.act(async () => setValue(field('Yearly pay (USD)'), '72000'))
    await screen.act(async () => setValue(field('Applied on'), '2026-11-01'))
    await screen.act(async () => click(submitButton('Add application')))
    await screen.settle()

    expect(screen.backend.writes).toEqual([
      {
        method: 'POST',
        path: '/rpc/example-tracker/applications',
        body: {
          companyId: 'c2',
          role: 'Data analyst',
          status: 'applied',
          salary: 72000,
          appliedOn: '2026-11-01',
          note: '',
        },
      },
    ])
    expect(dialog()).toBeNull()
    expect(byLabel('Applications').textContent).toContain('Data analyst')
  } finally {
    await screen.unmount()
  }
})

test('edit opens pre-filled, and a new status goes out with its timeline entry', async () => {
  const screen = await mount()
  try {
    await screen.act(async () =>
      click(screen.container.querySelector('[data-application-id="a1"]')!),
    )
    await screen.act(async () =>
      click(byText('Edit', 'button', byLabel('Application: Product designer'))),
    )
    expect(dialog()!.textContent).toContain('Edit application')
    expect(field('Role').value).toBe('Product designer')
    expect(field('Yearly pay (USD)').value).toBe('90000')
    expect(field('Applied on').value).toBe('2026-10-20')
    expect(field<HTMLElement>('Company').textContent).toContain('Acme')

    await choose(screen, field<HTMLElement>('Status'), 'Offer')
    await screen.act(async () => click(submitButton('Save changes')))
    await screen.settle()

    expect(screen.backend.writes).toHaveLength(1)
    expect(screen.backend.writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/rpc/example-tracker/applications/a1',
      body: {
        role: 'Product designer',
        status: 'offer',
        history: [
          { status: 'wishlist', at: expect.any(String) },
          { status: 'applied', at: expect.any(String) },
          { status: 'offer', at: expect.any(String) },
        ],
      },
    })
    expect(dialog()).toBeNull()
  } finally {
    await screen.unmount()
  }
})

test('a refusal from the server is shown inside the dialog, which stays open with the text intact', async () => {
  const screen = await mount()
  try {
    await openNew(screen)
    await screen.act(async () => setValue(field('Role'), 'Analyst'))
    await choose(screen, field<HTMLElement>('Company'), 'Acme')
    screen.backend.failWrites = 'Another person changed this. Reload and try again.'
    await screen.act(async () => click(submitButton('Add application')))
    await screen.settle()

    expect(dialog()).not.toBeNull()
    expect(dialog()!.textContent).toContain('The application could not be saved')
    expect(dialog()!.textContent).toContain('Another person changed this. Reload and try again.')
    expect(field('Role').value).toBe('Analyst')
  } finally {
    await screen.unmount()
  }
})

test('a company is added from its own dialog, and its name is required', async () => {
  const screen = await mount()
  try {
    await screen.act(async () => click(byText('New company', 'button', screen.container)))
    await screen.act(async () => click(submitButton('Add company')))
    expect(dialog()!.textContent).toContain('Name the company.')
    expect(screen.backend.writes).toEqual([])

    await screen.act(async () => setValue(field('Company name'), 'Initech'))
    await screen.act(async () => click(submitButton('Add company')))
    await screen.settle()
    expect(screen.backend.writes).toEqual([
      {
        method: 'POST',
        path: '/rpc/example-tracker/companies',
        body: { name: 'Initech', website: '', note: '' },
      },
    ])
    expect(dialog()).toBeNull()
  } finally {
    await screen.unmount()
  }
})
