import { lazy } from 'react'
import { Grid3x3 } from 'lucide-react'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { sessionGameUi } from '@localixai/mini-app-sdk/ui/session-game'

import { APP } from '../shared/game'
import { GAME_KIND, sessionOfGameUri } from '../shared/resource'

// The board's code loads when the first board opens, not with the app.
const Workspace = lazy(() =>
  import('./Workspace').then((module) => ({ default: module.Workspace })),
)

/**
 * One board per chat (`sessionGameUi`): the work item with `scope: 'session'`, a launcher in the
 * rail's overflow, and the anchor that the new-game tool's link resolves through, so the board
 * opens in the chat the tool ran in. `agentContext` is what the agent is told while a board is
 * open. The returned function registers once per host, however often the runtime calls it.
 */
export const registerUi = sessionGameUi({
  miniApp: APP,
  kind: GAME_KIND,
  title: 'Connect Four',
  label: 'Connect Four: play against the agent',
  keywords: ['game', 'connect four', 'four in a row', 'play'],
  Icon: Grid3x3,
  Workspace,
  loading: <LoadingHint>Opening Connect Four…</LoadingHint>,
  agentContext: {
    description:
      'This chat’s Connect Four board. The user plays X (red); you play O (amber). When you owe a move, the board wakes this chat with the position.',
    tools: ['example_game'],
    nextSteps: [
      'On your turn, drop with example_game action "drop": the user sees the board.',
      'Read the position with example_game action "state" before you comment on it.',
      'When the user asks to play or to start over, call example_game action "new_game".',
    ],
  },
  sessionOf: sessionOfGameUri,
})
