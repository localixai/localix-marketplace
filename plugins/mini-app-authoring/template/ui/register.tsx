import { lazy } from 'react'
import { ListTodo } from 'lucide-react'
import { screenUi } from '@localixai/mini-app-sdk/ui/app'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { APP } from '../shared/model'

const App = lazy(() => import('./App').then((module) => ({ default: module.App })))

/**
 * The screen's registration: its tab, its launcher in the rail's overflow, and what the agent is
 * told while it is open. `scope: 'chat'` would give every chat its own tab (for a chat collection).
 */
export const registerUi = screenUi({
  app: APP,
  title: 'Starter',
  label: 'Starter — a list the agent and you keep together',
  keywords: ['list', 'items'],
  Icon: ListTodo,
  Screen: App,
  loading: <LoadingHint>Opening Starter…</LoadingHint>,
  agentContext: {
    description: 'Starter: the list on screen, each item with its id and whether it is done.',
    tools: [
      'template_add_item',
      'template_list_items',
      'template_update_item',
      'template_remove_item',
      'template_find_items',
    ],
    nextSteps: [
      'When the person asks to add, change or remove something, call the matching tool with the id from the published list.',
      'Answer questions about the list from the published context; call template_list_items for a fresh read.',
    ],
  },
})
