import { useEffect } from 'react'
import { Grid3x3, MessageSquareOff, RotateCcw } from 'lucide-react'
import type { PublishMessageContext } from '@localixai/mini-app-sdk/ui'
import { useNow } from '@localixai/mini-app-sdk/ui/now'
import { useElementVisible } from '@localixai/mini-app-sdk/ui/visibility'
import { Button } from '@localixai/kit/button'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { GameControlRow } from '@localixai/kit/game-status'
import { IconButton } from '@localixai/kit/icon-button'
import { OpponentMenu } from '@localixai/kit/opponent-menu'
import { StateNotice } from '@localixai/kit/state-notice'

import { owesAgentMove } from '../shared/game'
import { Board } from './Board'
import { GameOver, TurnProblem, TurnStatus } from './TurnPanel'
import { gameMessageContext } from './bindings'
import { useGame } from './useGame'

/** The board follows the pane's width and stops where seven columns still read as one object. */
const BOARD_SIZE = 'min(100%, 36rem)'

/**
 * This chat's table: a compact control row, the board, and the result over it.
 *
 * The row keeps one height in every state and what stopped the game floats over the board
 * ({@link TurnProblem}), so the board never moves. The screen publishes EXACTLY the game on
 * screen as message context and clears it the moment the surface goes inactive, so a question
 * typed beside the board is about this position.
 */
export function Workspace({
  active = true,
  publishMessageContext,
}: {
  active?: boolean
  publishMessageContext?: PublishMessageContext
}) {
  const [ref, visible] = useElementVisible<HTMLDivElement>()
  const state = useGame(active && visible)
  const game = state.snapshot
  const now = useNow(1000, active && visible && owesAgentMove(game))

  useEffect(() => {
    if (!active || !game) {
      publishMessageContext?.(null)
      return
    }
    publishMessageContext?.(gameMessageContext(game))
    return () => publishMessageContext?.(null)
  }, [active, game, publishMessageContext])

  return (
    <div ref={ref} className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
      <h1 className="sr-only">Connect Four</h1>
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6">
        {!game ? (
          <div
            className="flex aspect-[7/6] items-center justify-center"
            style={{ width: BOARD_SIZE }}
          >
            {!state.hasTable ? (
              <StateNotice
                icon={MessageSquareOff}
                title="Open the board from a chat"
                body="Each chat has its own board, played with the agent in that chat."
              />
            ) : state.loading ? (
              <LoadingHint>Setting up the board…</LoadingHint>
            ) : (
              <StateNotice
                icon={Grid3x3}
                title="The board is unavailable"
                body={state.error ?? 'Try again in a moment.'}
                actions={
                  <Button size="sm" variant="secondary" onClick={() => state.refresh()}>
                    Try again
                  </Button>
                }
                role="alert"
              />
            )}
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-3" style={{ maxWidth: BOARD_SIZE }}>
            <GameControlRow
              status={<TurnStatus game={game} now={now} />}
              controls={
                <>
                  <OpponentMenu
                    heading="Who plays against you"
                    value={game.opponent ?? 'agent'}
                    disabled={state.sending}
                    onChange={(opponent) => void state.setOpponent(opponent)}
                  />
                  <IconButton
                    aria-label="New game"
                    tooltip="New game"
                    size="lg"
                    disabled={state.sending || game.moves.length === 0}
                    onClick={() => void state.newGame()}
                  >
                    <RotateCcw />
                  </IconButton>
                </>
              }
            />
            <Board
              game={game}
              playable={game.status === 'playing' && game.turn === 'you' && !state.sending}
              onDrop={(column) => void state.drop(column)}
            >
              <TurnProblem
                game={game}
                now={now}
                error={state.error}
                sending={state.sending}
                onRetry={() => state.refresh()}
                onRemind={() => void state.remind()}
                onOpponent={(opponent) => void state.setOpponent(opponent)}
              />
              <GameOver
                game={game}
                sending={state.sending}
                onNewGame={() => void state.newGame()}
              />
            </Board>
          </div>
        )}
      </div>
    </div>
  )
}
