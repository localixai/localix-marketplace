import {
  createMiniApp,
  type MiniAppContext,
  type MiniAppRegistration,
} from '@localixai/mini-app-sdk/backend'
import { createBoard } from './board'
import { linksSpec, looksSpec, notesSpec } from './collections'
import { createTools } from './tools'

/**
 * The backend: three chat-scoped collections and the agent's tools over them. `createMiniApp` does
 * the wiring (routes, and the store feed that updates an open board when the agent writes), so
 * this file only says WHAT the app has.
 *
 * `register(ctx)` runs more than once (for the backend, and again for each run's tools): state
 * lives in the collections, never in a module variable.
 */
export function register(ctx: MiniAppContext): MiniAppRegistration {
  const app = createMiniApp(ctx)
  const board = createBoard(
    app.collection(notesSpec),
    app.collection(linksSpec),
    app.collection(looksSpec),
  )
  return app.registration({ tools: createTools(ctx, board) })
}
