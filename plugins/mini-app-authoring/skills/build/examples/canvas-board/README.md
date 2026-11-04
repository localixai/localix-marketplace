# Example: Canvas Board

A whiteboard of notes and arrows for one chat, drawn on the host's canvas (`@localixai/kit/canvas`).
The person drags notes and draws arrows between them; the agent adds, connects and arranges the same
board, and can say "look at this" so the open board pans to what it points at.

Copy from it when the app is a board, a diagram, a map or a graph, or when the agent must be able to
direct the person's camera. For a plain list use the starter instead.

## What it demonstrates

- The canvas in `edit` interaction, with a camera that is placed once and moved by the agent.
- Three chat-scoped collections (`scope: 'chat'`): one board per chat, deleted with the chat.
- Agent tools that edit a board and one that moves the person's view, through a collection.
- Live updates: the agent's edit appears while the person watches.
- Edges themed through `data`, and a derived `toFlow` so the screen keeps no second copy.

## Read the files in this order

1. `shared/model.ts` — the schemas (no `.default()`) and `describeBoard`, what both sides say.
2. `shared/layout.ts` — free slots and the `grid` / `layers` arrangements, pure.
3. `backend/collections.ts` — the three chat-scoped collections and their defaults.
4. `backend/board.ts` — the operations: cascade on removal, no twin links, one newest look.
5. `backend/tools.ts` — the agent's eight tools, including `canvas_board_look`.
6. `backend/index.ts` — the wiring: `createMiniApp`, `registration`.
7. `ui/flow.ts` — notes and links to nodes and edges, with the edge `data` theme.
8. `ui/useAgentLook.ts` — how a look becomes one camera move, safely.
9. `ui/Board.tsx` — `CanvasProvider`, `useCanvasCamera`, `useCameraPlacement`, drag and connect.
10. `ui/NoteNode.tsx` — a node with `Handle`s from the kit.
11. `ui/Toolbar.tsx`, `ui/App.tsx` — the controls, states and message context.
12. `ui/register.tsx` — the per-chat tab (`scope: 'chat'`).
13. `backend/index.test.ts`, `ui/App.dom.test.tsx`, `ui/useAgentLook.dom.test.tsx` — how each is
    tested.
