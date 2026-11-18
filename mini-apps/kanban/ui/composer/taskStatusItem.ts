import { useMemo } from 'react'
import { CheckCircle2, Circle, ListChecks } from 'lucide-react'
import type { MenuEntry, StatusItemState } from '@localixai/mini-app-sdk/ui'

import { KANBAN_STATUS_LABEL } from '../model/kanbanStatus'
import { taskChecklist } from '../model/taskChecklist'
import { useBoardTasks } from '../model/useBoard'
import { openBoard, openTask } from '../navigation'

/**
 * The status bar's "3/7 tasks": the chat's board as a checklist. Opening it lists every task,
 * ticked once done, and moves as the person or an agent (Claude Code, over MCP) works the cards.
 */
export function useTaskStatusItem(sessionId: string | null): StatusItemState | null {
  const { tasks } = useBoardTasks(sessionId)
  return useMemo(() => {
    if (!sessionId) return null
    const checklist = taskChecklist(tasks)
    if (!checklist) return null
    const menu: MenuEntry[] = [
      { header: `Tasks — ${checklist.done} of ${checklist.total} done` },
      ...checklist.items.map(
        (item): MenuEntry => ({
          id: `kanban:check:${item.id}`,
          label: item.label,
          icon: item.done ? CheckCircle2 : Circle,
          checked: item.done,
          hint: KANBAN_STATUS_LABEL[item.status],
          onSelect: () => openTask(sessionId, { id: item.id, title: item.label }),
        }),
      ),
      { separator: true },
      { id: 'kanban:open-board', label: 'Open the board', onSelect: () => openBoard(sessionId) },
    ]
    return {
      label: `Board tasks: ${checklist.done} of ${checklist.total} done`,
      Icon: ListChecks,
      text: checklist.text,
      tone: checklist.done === checklist.total ? 'success' : undefined,
      menu,
    }
  }, [sessionId, tasks])
}
