import { expect, test } from 'bun:test'
import { insightsOf } from './dashboard-parts'
import { byLabel, click, deal, fixtureDeals, mount, setupDom } from './test-support'
import { summarize } from '../../shared/model'

setupDom()

const open = (options: Parameters<typeof mount>[1] = {}) =>
  mount(async () => {
    const { Dashboard } = await import('./dashboard')
    return <Dashboard active />
  }, options)

/** Month-relative days, so the figures that depend on "this month" hold on any day of the year. */
const day = (offsetMonths: number, date: number) => {
  const at = new Date()
  at.setDate(1)
  at.setMonth(at.getMonth() + offsetMonths)
  if (date === 0) at.setMonth(at.getMonth() + 1)
  at.setDate(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}
const deals = () =>
  fixtureDeals().map((item) => {
    if (item.id === 'd1') return { ...item, closeDate: day(0, 0) } // last day of this month
    if (item.id === 'd3') return { ...item, closeDate: day(0, 0) }
    if (item.id === 'd2') return { ...item, closeDate: day(1, 15) } // next month
    if (item.id === 'd5') return { ...item, closeDate: day(0, 1) } // first of this month
    return item
  })

test('the KPI cards show formatted figures, not raw numbers', async () => {
  const screen = await open({ deals: deals() })
  try {
    const text = screen.container.textContent!
    expect(text).toContain('Pipeline value$377.7K')
    expect(text).toContain('4 open deals')
    expect(text).toContain('Win rate50%')
    expect(text).toContain('1 won · 1 lost')
    expect(text).toContain('Average deal$89.8K')
    expect(text).toContain('Closing this month2')
    expect(text).not.toContain('377740')
  } finally {
    await screen.unmount()
  }
})

test('the stage distribution names each stage and formats its value', async () => {
  const screen = await open({ deals: deals() })
  try {
    const text = screen.container.textContent!
    for (const [stage, value] of [
      ['Lead', '$121.9K'],
      ['Qualified', '$44.8K'],
      ['Proposal', '$211K'],
      ['Won', '$72K'],
      ['Lost', '$89K'],
    ]) {
      expect(text).toContain(`${stage}${value}`)
    }
  } finally {
    await screen.unmount()
  }
})

test('the monthly trend says "month", never "day"', async () => {
  const screen = await open({ deals: deals() })
  try {
    const text = screen.container.textContent!
    expect(text).toContain('peak $72K/month')
    expect(text).not.toContain('/day')
  } finally {
    await screen.unmount()
  }
})

test('targets pair a coloured bar with a number and a word', async () => {
  const screen = await open({ deals: deals() })
  try {
    // 72,000 of 350,000 won this quarter; 377,740 of 600,000 in the pipeline; 50% of 40%.
    expect(screen.container.textContent).toContain('$72K of $350K')
    expect(screen.container.textContent).toContain('21% · Behind')
    expect(screen.container.textContent).toContain('63% · Getting there')
    expect(screen.container.textContent).toContain('125% · On target')
    expect(byLabel('Won this quarter: 21% of target').getAttribute('role')).toBe('progressbar')
    const labels = [...screen.container.querySelectorAll('p.text-2xs.font-medium')]
    expect(labels.map((el) => el.className.match(/text-status-\w+/)?.[0])).toEqual([
      'text-status-error',
      'text-status-warning',
      'text-status-success',
    ])
  } finally {
    await screen.unmount()
  }
})

test('the insights explain the numbers in words', async () => {
  const screen = await open({ deals: deals() })
  try {
    const text = screen.container.textContent!
    expect(text).toContain('Proposal holds the most open value: $211K, 56% of the pipeline.')
    expect(text).toContain('Win rate is 50%: 1 deal won and 1 lost.')
    expect(text).toContain('2 open deals are due to close this month, worth $211K.')
  } finally {
    await screen.unmount()
  }
})

test('with nothing decided the dashboard says so instead of showing 0%', async () => {
  const none = summarize([deal({ id: 'a', stage: 'lead' })], new Date())
  expect(insightsOf(none)).toContain(
    'No deal has been won or lost yet, so there is no win rate to read.',
  )
  const screen = await open({ deals: [deal({ id: 'a', stage: 'lead' })] })
  try {
    expect(screen.container.textContent).toContain('Win rate—')
    expect(screen.container.textContent).toContain('Not measurable yet')
  } finally {
    await screen.unmount()
  }
})

test('a failed read offers a retry that brings the numbers back', async () => {
  const screen = await open({ failReads: true })
  try {
    expect(screen.container.textContent).toContain('The numbers are not available')
    screen.backend.failReads = false
    const retry = [...screen.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Try again',
    )!
    await screen.act(async () => click(retry))
    await screen.settle()
    expect(screen.container.textContent).toContain('Pipeline value')
  } finally {
    await screen.unmount()
  }
})

test('while the first read is in flight it shows a skeleton shaped like the dashboard', async () => {
  const screen = await open({ hold: true })
  try {
    expect(screen.container.textContent).not.toContain('Pipeline value')
    expect(screen.container.querySelector('[aria-hidden="true"]')).not.toBeNull()
    screen.backend.release()
    await screen.settle()
    expect(screen.container.textContent).toContain('Pipeline value')
  } finally {
    await screen.unmount()
  }
})
