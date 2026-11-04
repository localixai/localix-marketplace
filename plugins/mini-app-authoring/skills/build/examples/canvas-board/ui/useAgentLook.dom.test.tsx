import { afterAll, beforeAll, expect, test } from 'bun:test'
import { registerDom } from '@localixai/kit/testing'
import { LOOK_TTL_MS, type Look, type Note } from '../shared/model'
import { newestLook } from './useAgentLook'

let teardown: () => Promise<void>
const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
beforeAll(() => {
  teardown = registerDom()
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})
afterAll(() => teardown())

const note = (id: string): Note => ({ id, text: id, x: 0, y: 0, tone: 'neutral' })
const look = (id: string, noteIds: string[], ageMs = 0): Look => ({
  id,
  noteIds,
  at: new Date(Date.now() - ageMs).toISOString(),
})

/** Mount the hook with props that can change, and answer every camera move it makes. */
async function mount(initial: { active: boolean; looks: Look[]; notes: Note[] }) {
  const { act, createElement } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { useAgentLook } = await import('./useAgentLook')
  const moves: string[][] = []
  const go = (ids: string[]) => moves.push(ids)
  function Probe(props: typeof initial) {
    useAgentLook({ ...props, go })
    return null
  }
  const root = createRoot(document.createElement('div'))
  const show = (props: typeof initial) => act(async () => root.render(createElement(Probe, props)))
  await show(initial)
  return { moves, show, unmount: () => act(async () => root.unmount()) }
}

test('the newest request wins', () => {
  expect(newestLook([look('old', ['a'], 5000), look('new', ['b'], 100)])?.id).toBe('new')
  expect(newestLook([])).toBeUndefined()
})

test('a fresh look moves the camera once, to the notes that are there', async () => {
  const board = await mount({
    active: true,
    looks: [look('1', ['a', 'ghost'])],
    notes: [note('a')],
  })
  expect(board.moves).toEqual([['a']])
  // A re-read of the same board does not point again.
  await board.show({
    active: true,
    looks: [look('1', ['a', 'ghost'])],
    notes: [note('a'), note('b')],
  })
  expect(board.moves).toHaveLength(1)
  await board.unmount()
})

test('an old look is dropped, and a hidden board waits to be shown', async () => {
  const stale = await mount({
    active: true,
    looks: [look('s', ['a'], LOOK_TTL_MS + 1000)],
    notes: [note('a')],
  })
  expect(stale.moves).toEqual([])
  await stale.unmount()

  const hidden = await mount({ active: false, looks: [look('h', ['a'])], notes: [note('a')] })
  expect(hidden.moves).toEqual([])
  await hidden.show({ active: true, looks: [look('h', ['a'])], notes: [note('a')] })
  expect(hidden.moves).toEqual([['a']])
  await hidden.unmount()
})

test('a look that arrives before its notes waits for them', async () => {
  const board = await mount({ active: true, looks: [look('w', ['late'])], notes: [] })
  expect(board.moves).toEqual([])
  await board.show({ active: true, looks: [look('w', ['late'])], notes: [note('late')] })
  expect(board.moves).toEqual([['late']])
  await board.unmount()
})
