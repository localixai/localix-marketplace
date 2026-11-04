import { Circle, CircleAlert, Equal, Flag, RefreshCw, RotateCcw, Trophy } from 'lucide-react'
import { ActivityOrb } from '@localixai/kit/activity-orb'
import { Button } from '@localixai/kit/button'
import { GameProblem, GameStatus } from '@localixai/kit/game-status'
import { OTHER_OPPONENT } from '@localixai/mini-app-sdk/opponent'
import { cn } from '@localixai/mini-app-sdk/ui/classes'

import { owesAgentMove, type Game, type Opponent } from '../shared/game'
import { announcement, elapsed, headline, nextOpener, opponentName, scoreLine } from './copy'

/** After this long without the other side's move, the board offers to ask again. */
export const PATIENCE_MS = 20_000

/**
 * Three surfaces for the game's state, none of them under the board and none that moves it:
 *
 * - {@link TurnStatus}: the lines beside the controls. Whose turn, how long the agent has been
 *   thinking, and the score at this table.
 * - {@link TurnProblem}: what stopped the game, over the board. A failed request, an opponent
 *   that did not answer, a move that is taking too long, each with its way out.
 * - {@link GameOver}: the card that rises over the board when a game ends. The board stays
 *   visible behind it, so the winning line is part of the result.
 *
 * Nothing here counts: the time spent thinking is `now` against the moment it was asked, so a
 * hidden pane loses nothing.
 */
export function TurnStatus({ game, now }: { game: Game; now: number }) {
  const waiting = game.waiting
  const thinking = owesAgentMove(game) && (waiting === null || waiting.status === 'thinking')
  return (
    <>
      <GameStatus
        icon={game.status === 'playing' && <StateIcon game={game} thinking={thinking} />}
        title={headline(game)}
        suffix={thinking && waiting ? `· ${elapsed(now - Date.parse(waiting.since))}` : undefined}
        detail={`You play red${scoreLine(game.record)}`}
      />
      {/* Heard, not seen: the move just played and what it means, once per change. */}
      <p aria-live="polite" className="sr-only">
        {announcement(game)}
      </p>
    </>
  )
}

export function TurnProblem({
  game,
  now,
  error,
  sending,
  onRetry,
  onRemind,
  onOpponent,
}: {
  game: Game
  now: number
  error: string | null
  sending: boolean
  onRetry: () => void
  onRemind: () => void
  onOpponent: (opponent: Opponent) => void
}) {
  if (error)
    return (
      <GameProblem
        title={error}
        actions={
          <Button size="sm" variant="secondary" onClick={onRetry}>
            <RefreshCw data-icon="inline-start" />
            Retry
          </Button>
        }
      />
    )
  if (!owesAgentMove(game)) return null
  const waiting = game.waiting
  const askAgain = (
    <Button size="sm" variant="secondary" onClick={onRemind} disabled={sending}>
      <RefreshCw data-icon="inline-start" />
      Ask again
    </Button>
  )
  if (waiting?.status === 'unreachable') {
    const other = OTHER_OPPONENT[game.opponent ?? 'agent']
    return (
      <GameProblem
        title={`${opponentName(game)} did not move`}
        description={waiting.reason}
        actions={
          <>
            {askAgain}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onOpponent(other.opponent)}
              disabled={sending}
            >
              {other.label}
            </Button>
          </>
        }
      />
    )
  }
  if (waiting === null || now - Date.parse(waiting.since) < PATIENCE_MS) return null
  return (
    <GameProblem
      role="status"
      title={`${opponentName(game)} is taking a while`}
      description="Ask again to wake it, or keep waiting."
      actions={askAgain}
    />
  )
}

const RESULT = {
  won: { Icon: Trophy, tone: 'text-status-success' },
  lost: { Icon: Flag, tone: 'text-text-soft' },
  draw: { Icon: Equal, tone: 'text-text-soft' },
} as const

export function GameOver({
  game,
  sending,
  onNewGame,
}: {
  game: Game
  sending: boolean
  onNewGame: () => void
}) {
  if (game.status === 'playing') return null
  const { Icon, tone } = RESULT[game.status]
  const title = headline(game)
  return (
    <div className="example-game-over pointer-events-none absolute inset-0 z-(--z-raised) flex items-center justify-center">
      <div
        role="dialog"
        aria-label={title}
        className="pointer-events-auto flex w-[min(90%,20rem)] flex-col items-center gap-3 rounded-xl border border-border-soft bg-popover/90 px-6 py-5 text-center shadow-(--shadow-popover) backdrop-blur-md"
      >
        <Icon className={cn('size-7', tone)} aria-hidden />
        <div className="space-y-1">
          <h2 className={cn('text-lg font-semibold tracking-tight', game.status === 'won' && tone)}>
            {title}
          </h2>
          <p className="text-xs text-text-soft">
            {game.line ? 'Four in a row.' : 'The board is full.'} Next: {nextOpener(game)}.
          </p>
        </div>
        <Button variant="mono" size="lg" onClick={onNewGame} disabled={sending} autoFocus>
          <RotateCcw data-icon="inline-start" />
          New game
        </Button>
      </div>
    </div>
  )
}

function StateIcon({ game, thinking }: { game: Game; thinking: boolean }) {
  if (game.turn === 'you')
    return <Circle className="size-3.5 fill-(--chart-8) text-(--chart-8)" aria-hidden />
  if (thinking) return <ActivityOrb className="size-4" />
  if (game.waiting?.status === 'unreachable')
    return <CircleAlert className="size-4 shrink-0 text-status-warning" aria-hidden />
  return <Circle className="size-3.5 fill-(--chart-5) text-(--chart-5)" aria-hidden />
}
