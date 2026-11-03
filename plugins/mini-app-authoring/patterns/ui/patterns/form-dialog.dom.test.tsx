import { expect, test } from 'bun:test'
import { byLabel, byText, choose, click, field, mount, setValue, setupDom } from './test-support'

setupDom()

const open = () =>
  mount(async () => {
    const { FormDialog } = await import('./form-dialog')
    return <FormDialog active />
  })

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const submitButton = (label: string) => byText(label, 'button', dialog()!)

test('submitting an empty form shows each field its own error, sends nothing and focuses the first', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byText('New deal', 'button', screen.container)))
    expect(dialog()!.textContent).toContain('Add a deal to the pipeline.')
    // The dialog opens on its first field, not on the close button.
    expect(document.activeElement).toBe(field('Deal name'))

    await screen.act(async () => click(submitButton('Add deal')))

    const text = dialog()!.textContent
    for (const message of [
      'Name the deal.',
      'Add the company.',
      'Pick an owner.',
      'Enter an amount.',
    ]) {
      expect(text).toContain(message)
    }
    expect(screen.backend.writes).toEqual([])
    expect(document.activeElement).toBe(field('Deal name'))
    expect(field('Deal name').getAttribute('aria-invalid')).toBe('true')
    expect(field('Company').getAttribute('aria-describedby')).toContain('error')

    // Typing answers the error on that field only.
    await screen.act(async () => setValue(field('Deal name'), 'Renewal'))
    expect(dialog()!.textContent).not.toContain('Name the deal.')
    expect(dialog()!.textContent).toContain('Add the company.')
  } finally {
    await screen.unmount()
  }
})

test('a filled form creates the deal, closes and shows it in the list', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byText('New deal', 'button', screen.container)))
    await screen.act(async () => setValue(field('Deal name'), 'Harbour sensors'))
    await screen.act(async () => setValue(field('Company'), 'Tidewater Marine'))
    await choose(screen, field<HTMLElement>('Owner'), 'Sofia Rossi')
    await screen.act(async () => setValue(field('Amount'), '12500'))
    await choose(screen, field<HTMLElement>('Currency'), 'EUR')
    await choose(screen, field<HTMLElement>('Stage'), 'Qualified')
    await screen.act(async () => setValue(field('Expected close'), '2027-01-15'))
    await screen.act(async () => setValue(field('Note'), 'Wants a pilot first'))
    await screen.act(async () => click(submitButton('Add deal')))
    await screen.settle()

    expect(screen.backend.writes).toEqual([
      {
        method: 'POST',
        path: '/rpc/ui-patterns/deals',
        body: {
          title: 'Harbour sensors',
          company: 'Tidewater Marine',
          owner: 'Sofia Rossi',
          amount: 12500,
          currency: 'EUR',
          stage: 'qualified',
          closeDate: '2027-01-15',
          note: 'Wants a pilot first',
        },
      },
    ])
    expect(dialog()).toBeNull()
    expect(byLabel('Deals').textContent).toContain('Harbour sensors')
    expect(byLabel('Deals').textContent).toContain('€12,500')
  } finally {
    await screen.unmount()
  }
})

test('edit mode opens pre-filled and sends the change to that deal', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byLabel('Edit Clinic scheduling')))
    expect(dialog()!.textContent).toContain('Edit deal')
    expect(field('Deal name').value).toBe('Clinic scheduling')
    expect(field('Company').value).toBe('Halcyon Health')
    expect(field('Amount').value).toBe('127000')
    expect(field('Note', dialog()!).value).toBe('Legal review is open.')
    expect(field<HTMLElement>('Owner').textContent).toContain('Sofia Rossi')
    expect(field<HTMLElement>('Stage').textContent).toContain('Proposal')

    await screen.act(async () => setValue(field('Amount'), '135000'))
    await screen.act(async () => click(submitButton('Save changes')))
    await screen.settle()

    expect(screen.backend.writes).toHaveLength(1)
    expect(screen.backend.writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/rpc/ui-patterns/deals/d3',
      body: { title: 'Clinic scheduling', amount: 135000, stage: 'proposal', owner: 'Sofia Rossi' },
    })
    expect(dialog()).toBeNull()
    expect(byLabel('Deals').textContent).toContain('$135,000')
  } finally {
    await screen.unmount()
  }
})

test('a refusal from the server is shown inside the dialog, which stays open with the text intact', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byLabel('Edit Fleet tracking')))
    screen.backend.failWrites = 'Another person changed this deal. Reload and try again.'
    await screen.act(async () => setValue(field('Deal name'), 'Fleet tracking v2'))
    await screen.act(async () => click(submitButton('Save changes')))
    await screen.settle()

    expect(dialog()).not.toBeNull()
    expect(dialog()!.textContent).toContain('The deal could not be saved')
    expect(dialog()!.textContent).toContain(
      'Another person changed this deal. Reload and try again.',
    )
    expect(field('Deal name').value).toBe('Fleet tracking v2')
  } finally {
    await screen.unmount()
  }
})

test('while saving, the button is busy and the form cannot be sent twice', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byLabel('Edit Fleet tracking')))
    screen.backend.holdWrites()
    await screen.act(async () => click(submitButton('Save changes')))
    const busy = submitButton('Saving…') as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    await screen.act(async () =>
      dialog()!
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    )
    expect(screen.backend.writes).toHaveLength(1)

    screen.backend.releaseWrites()
    await screen.settle()
    expect(dialog()).toBeNull()
  } finally {
    await screen.unmount()
  }
})

test('cancelling closes the dialog without a write', async () => {
  const screen = await open()
  try {
    await screen.act(async () => click(byText('New deal', 'button', screen.container)))
    await screen.act(async () => click(byText('Cancel', 'button', dialog()!)))
    expect(dialog()).toBeNull()
    expect(screen.backend.writes).toEqual([])
  } finally {
    await screen.unmount()
  }
})
