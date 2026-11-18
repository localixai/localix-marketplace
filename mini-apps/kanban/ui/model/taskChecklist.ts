import type { KanbanTask } from '../../shared/contracts'

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
  status: KanbanTask['status']
}

/**
 * The chat's tasks as a checklist — what the status bar and the bell show: done out of all, and
 * each task ticked once it is done. Epics are milestones, not work, and a cancelled card is no
 * longer part of the plan, so neither counts.
 */
export function taskChecklist(
  tasks: readonly KanbanTask[],
): { text: string; done: number; total: number; items: ChecklistItem[] } | null {
  const open = tasks
    .filter((task) => task.kind === 'task' && task.status !== 'cancelled')
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (open.length === 0) return null
  const items = open.map((task) => ({
    id: task.id,
    label: task.title,
    done: task.status === 'done',
    status: task.status,
  }))
  const done = items.filter((item) => item.done).length
  return { text: `${done}/${items.length} tasks`, done, total: items.length, items }
}
