import { elapsed } from '@localixai/mini-app-sdk/agent-wait'
import { opponentName } from '@localixai/mini-app-sdk/opponent'
import { columnList } from '../shared/describe'
import type { Game, GameRecord, Move } from '../shared/game'

/** Shared by every game: the wait's clock and the opponent in the person's words. */
export { elapsed, opponentName }

/**
 * The game in the PERSON's words: the headline and what a screen reader announces.
 * `shared/describe.ts` speaks to the agent ("Your turn (O)"); this speaks to whoever is looking at
 * the board ("Your turn", "The agent won"). Pure, so every state the board can be in has a
 * sentence a test can read.
 */

/** "The agent dropped a chip into column 4." */
export const moveSentence = (move: Move, game: Pick<Game, 'opponent'>) =>
  `${move.by === 'you' ? 'You' : opponentName(game)} dropped a chip into ${columnList([move.column])}.`

/** The headline beside the board. */
export function headline(game: Game): string {
  if (game.status === 'won') return 'You won'
  if (game.status === 'lost') return `${opponentName(game)} won`
  if (game.status === 'draw') return 'Draw'
  if (game.turn === 'you') return 'Your turn'
  return game.waiting?.status === 'unreachable' ? 'No answer' : 'Thinking'
}

/** What a screen reader hears when the board changes: the last move, then what it means now. */
export function announcement(game: Game): string {
  const last = game.moves.at(-1)
  return [last ? moveSentence(last, game) : 'New game.', `${headline(game)}.`].join(' ')
}

/** Who opens the next game: the side that did not open this one. */
export const nextOpener = (game: Game): string =>
  game.first === 'agent' ? 'you start' : `${opponentName(game).toLowerCase()} starts`

/** " · Score 2–1, 3 draws": the table's running score, empty before the first game ends. */
export function scoreLine(record: GameRecord): string {
  if (record.won + record.lost + record.draw === 0) return ''
  const draws = record.draw === 1 ? '1 draw' : `${record.draw} draws`
  return ` · Score ${record.won}–${record.lost}, ${draws}`
}
