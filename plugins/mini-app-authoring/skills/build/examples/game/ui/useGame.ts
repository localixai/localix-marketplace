import { useTableGame } from '@localixai/mini-app-sdk/ui/game-table'

import { APP, gameSchema, owesAgentMove, type Opponent, type Player } from '../shared/game'
import { ROUTE_PATH } from '../shared/resource'

/**
 * The board's state and the four things a person can do to it. `useTableGame` does the rest: it
 * names the chat the board BELONGS to on every request (never whichever chat is active), follows
 * the store feed so the agent's move lands the moment it is made, and polls only while that feed
 * is down, quickly while the other side owes a move.
 */
export function useGame(active: boolean) {
  const game = useTableGame({
    miniApp: APP,
    route: ROUTE_PATH,
    schema: gameSchema,
    active,
    quick: owesAgentMove,
    failureMessage: 'The board could not be read. Check that Localix is running, then retry.',
  })
  const { act } = game
  return {
    ...game,
    drop: (column: number) => act('drop', { column }),
    newGame: (first?: Player) => act('new', first ? { first } : {}),
    remind: () => act('remind', {}),
    setOpponent: (opponent: Opponent) => act('opponent', { opponent }),
  }
}
