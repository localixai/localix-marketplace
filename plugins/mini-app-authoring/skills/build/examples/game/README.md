# Example: Game

Connect Four against the agent, one board per chat. The person drops red chips by clicking a
column; the agent in that chat (or a decision model the person picks) answers with amber ones. The
board animates the drop, the winning line and a celebration, in its own stylesheet.

Copy from it for any turn-based game against the agent: chess, checkers, a card game, a word game.
Keep `shared/game.ts` as the pattern for the rules (pure, one file), and replace the board.

## What it demonstrates

- A per-chat table with `createTurnTable`: one game in the chat's own folder, deleted with the chat.
- The agent's move through a wake, once per position (`ask.ts`); a decision model as the fallback,
  asked a `choice` question over the open columns, with the facts code can see put in the state.
- `sessionGameUi`, `useTableGame` and the kit's game controls (`OpponentMenu`, `GameStatus`).
- The agent's tool: one tool with an `action`, a `terminate` that ends a woken turn, `isError` only
  when nothing was done, and `classifyByAction` so reading the board stays a read.
- A hand-written look in `ui/board.css` and `ui/ending.css`: colours mixed from host tokens, `drop`, `draw` and
  confetti keyframes, a `prefers-reduced-motion` block, every class prefixed `example-game-`.

## Read the files in this order

1. `shared/game.ts` - the rules and the schema, pure; `shared/game.test.ts` pins them.
2. `shared/describe.ts` - the game as text for the agent, one module for tool, wake and context.
3. `backend/ask.ts` - how the board asks the agent (a wake) and the decision model (a question).
4. `backend/game-service.ts` - `createTurnTable` and what is Connect Four's own on top of it.
5. `backend/tools.ts` - the agent's tool and its result rules.
6. `backend/routes.ts`, `backend/index.ts` - the screen's routes and the wiring with the store feed.
7. `backend/index.test.ts`, `backend/decision.test.ts` - the backend tested as a person and the
   agent use it, with the wake and the decision model faked.
8. `ui/register.tsx` - `sessionGameUi`: the tab, the launcher, the link the tool offers.
9. `ui/useGame.ts`, `ui/Workspace.tsx` - state and actions, then the layout and message context.
10. `ui/Board.tsx` - what is drawn and which `data-*` state each piece is in.
11. `ui/board.css`, `ui/ending.css` - the look and the motion, with the reasons in their comments.
12. `ui/TurnPanel.tsx`, `ui/Confetti.tsx`, `ui/copy.ts` - status, problems, result, wording.
13. `ui/Workspace.dom.test.tsx`, `ui/register.test.tsx` - the screen and registrations under test.
