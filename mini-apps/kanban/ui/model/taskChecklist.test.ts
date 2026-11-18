import { expect, test } from 'bun:test'

import { taskChecklist } from './taskChecklist'

const task = (id: string, title: string, status: string, kind = 'task', createdAt = id) =>
  ({ id, title, status, kind, createdAt }) as never

test('counts the chat’s tasks done and lists them as a checklist, in the order they were made', () => {
  const checklist = taskChecklist([
    task('LX-2', 'Login form', 'in_progress'),
    task('LX-1', 'Milestone: Auth', 'ready', 'epic'),
    task('LX-3', 'Validation', 'ready'),
    task('LX-4', 'Schema', 'done', 'task', 'LX-0'),
    task('LX-5', 'Dropped', 'cancelled'),
  ])
  expect(checklist?.text).toBe('1/3 tasks')
  expect(checklist?.items).toEqual([
    { id: 'LX-4', label: 'Schema', done: true, status: 'done' },
    { id: 'LX-2', label: 'Login form', done: false, status: 'in_progress' },
    { id: 'LX-3', label: 'Validation', done: false, status: 'ready' },
  ])
})

test('a board with no tasks shows nothing', () => {
  expect(taskChecklist([task('LX-1', 'Epic only', 'ready', 'epic')])).toBeNull()
})
