import { lazy } from 'react'
import { Kanban } from 'lucide-react'
import { screenUi } from '@localixai/mini-app-sdk/ui/app'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { APP } from '../shared/model'

const App = lazy(() => import('./App').then((module) => ({ default: module.App })))

/**
 * The screen's registration: its tab, its launcher, and what the agent is told while it is open.
 * `scope: 'chat'` gives every chat its own tab, whose screen is handed that chat; it matches the
 * collection's `scope: 'chat'` and `useCollection({ scope: 'chat' })`.
 */
export const registerUi = screenUi({
  app: APP,
  title: 'Board',
  label: 'Board — this chat’s kanban, kept by you and the agent',
  keywords: ['board', 'kanban', 'cards', 'tasks'],
  Icon: Kanban,
  Screen: App,
  scope: 'chat',
  loading: <LoadingHint>Opening the board…</LoadingHint>,
  agentContext: {
    description: 'Board: this chat’s cards by column, each with its id, points and due day.',
    tools: ['example_board_show', 'example_board_add_card', 'example_board_move_card'],
    nextSteps: [
      'When the person asks to add a task or move one, call the matching tool with the id from the published board.',
      'Answer questions about the board from the published context; call example_board_show for a fresh read.',
    ],
  },
})
