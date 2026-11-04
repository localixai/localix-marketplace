import { expect, test } from 'bun:test'
import type { Link, Note } from '../shared/model'
import { toFlow } from './flow'

const note = (id: string, x: number): Note => ({ id, text: id, x, y: 0, tone: 'info' })
const link: Link = { id: 'l', from: 'a', to: 'b', label: 'then', tone: 'warning' }

test('nodes follow the saved board unless a card is being dragged', () => {
  const live = new Map([['a', { x: 99, y: 7 }]])
  const { nodes } = toFlow([note('a', 0), note('b', 10)], [], live, null)
  expect(nodes.map((node) => node.position)).toEqual([
    { x: 99, y: 7 },
    { x: 10, y: 0 },
  ])
})

test('an edge is themed through its data, and a link to a gone note is not drawn', () => {
  const dangling: Link = { ...link, id: 'x', to: 'gone' }
  const { edges } = toFlow([note('a', 0), note('b', 10)], [link, dangling], new Map(), null)
  expect(edges).toHaveLength(1)
  expect(edges[0]?.data).toMatchObject({
    tone: 'warning',
    label: 'then',
    arrow: 'always',
    emphasis: 'idle',
  })
})

test('selecting a note focuses its links and dims the rest', () => {
  const other: Link = { id: 'm', from: 'b', to: 'c', label: '', tone: 'neutral' }
  const notes = [note('a', 0), note('b', 10), note('c', 20)]
  const { nodes, edges } = toFlow(notes, [link, other], new Map(), { kind: 'note', id: 'a' })
  expect(nodes.map((node) => node.selected)).toEqual([true, false, false])
  expect(edges.map((edge) => edge.data?.emphasis)).toEqual(['focus', 'dimmed'])
})
