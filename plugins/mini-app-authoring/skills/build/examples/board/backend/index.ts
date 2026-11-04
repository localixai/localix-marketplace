import {
  createMiniApp,
  type MiniAppContext,
  type MiniAppRegistration,
} from '@localixai/mini-app-sdk/backend'
import { cardsSpec } from './cards'
import { createTools } from './tools'

/**
 * The backend: one chat collection and the agent's tools. `createMiniApp` wires the routes, the
 * store feed (an open board re-reads the moment a tool writes, so a card the agent moves slides
 * across on its own) and the semantic index.
 *
 * `register(ctx)` runs more than once (for the backend, and again for each run's tools): keep
 * state in collections, never in a module variable.
 */
export function register(ctx: MiniAppContext): MiniAppRegistration {
  const app = createMiniApp(ctx)
  const cards = app.collection(cardsSpec)
  return app.registration({ tools: createTools(ctx, cards) })
}
