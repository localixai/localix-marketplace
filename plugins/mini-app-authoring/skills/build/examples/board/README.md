# Example board

A kanban board that belongs to one chat: cards in four stages (Backlog, In progress, Review, Done),
moved by hand or by the agent, with the open board following the agent live.

## It demonstrates

- A **chat collection** (`scope: 'chat'`): each chat has its own cards, tools take the chat from
  `context.session.id`, the screen is a session work item.
- **Live updates**: a card the agent moves slides across on the open board, through the store feed
  that `useCollection` follows. No polling code of your own.
- **Columns that fill the width** with a floor, a count and a points total each.
- **Three ways to move a card**, none needing a mouse: native drag and drop (the kit's
  `DROP_TARGET_*` look), Alt+Arrow on the focused card, and "Move to …" in its menu.
- **Agent context** published from the screen, so the agent answers from what the person sees.

## Copy from it when

You keep items that pass through a few named stages and the stage is what changes (tasks, a
pipeline, a review queue), or when state belongs to one conversation. For one list shared by every
chat, copy the starter instead (`scope: 'app'`).

## Read in this order

1. `shared/model.ts` — the schemas, the stages and the pure rules (columns, totals, overdue, what the agent is told).
2. `backend/cards.ts` — the chat collection and where defaults live (`create`, never `.default()`).
3. `backend/tools.ts` — show, add and move, each acting on the calling chat.
4. `backend/index.ts` — `register`, which only says what the app has.
5. `backend/index.test.ts` — the tools and routes on one store, chats kept apart, the write feed.
6. `ui/use-board-moves.ts` — the one move write, drag state and the screen-reader announcement.
7. `ui/board-card.tsx` — card anatomy, hover actions, the Alt+Arrow key path and the menu.
8. `ui/board-column.tsx` — a column: header, drop target, skeletons, empty slot.
9. `ui/App.tsx` — the screen: the collection, filters, the agent context and the fill chain.
10. `ui/register.tsx` — the per-chat tab and what the agent is told while it is open.
11. `ui/test-support.tsx` and `ui/App.dom.test.tsx` — the fake routes and socket, and the tests that move cards by menu, key, drag and agent.
12. `guide.md` — how the agent uses the tools.
