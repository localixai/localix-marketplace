import { lazy } from 'react'
import { Waypoints } from 'lucide-react'
import { screenUi } from '@localixai/mini-app-sdk/ui/app'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { APP } from '../shared/model'

const App = lazy(() => import('./App').then((module) => ({ default: module.App })))

/**
 * The screen's registration. `scope: 'chat'` gives every chat its own tab, because the board is the
 * chat's (the collections are `scope: 'chat'` too). The agent is told what is on the board while
 * the tab is open, and which tools change it.
 */
export const registerUi = screenUi({
  app: APP,
  scope: 'chat',
  title: 'Canvas Board',
  label: 'Canvas Board — notes and links you and the agent arrange together',
  keywords: ['whiteboard', 'canvas', 'notes', 'diagram', 'mind map'],
  Icon: Waypoints,
  Screen: App,
  loading: <LoadingHint>Opening Canvas Board…</LoadingHint>,
  agentContext: {
    description:
      'Canvas Board: this chat’s whiteboard, each note with its id, tone and position, and the links between them.',
    tools: [
      'canvas_board_add_note',
      'canvas_board_update_note',
      'canvas_board_remove_note',
      'canvas_board_connect',
      'canvas_board_disconnect',
      'canvas_board_arrange',
      'canvas_board_look',
      'canvas_board_list',
    ],
    nextSteps: [
      'To change the board, call the matching tool with the ids from the published board.',
      'To point the person at something, call canvas_board_look: their open board pans to it.',
    ],
  },
})
