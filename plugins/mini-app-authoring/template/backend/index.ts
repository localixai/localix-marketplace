import {
  createMiniApp,
  type MiniAppContext,
  type MiniAppRegistration,
} from '@localixai/mini-app-sdk/backend'
import { itemsSpec } from './items'
import { createTools } from './tools'

/**
 * The backend: the app's collections and the agent's tools. `createMiniApp` does the wiring — the
 * routes under `/rpc/<app>`, the store feed that updates an open screen when the agent writes, the
 * semantic index — so this file only says WHAT the app has. Add routes of your own with `routes`.
 *
 * `register(ctx)` runs more than once (for the backend, and again for each run's tools): keep
 * state in collections, never in a module variable.
 */
export function register(ctx: MiniAppContext): MiniAppRegistration {
  const app = createMiniApp(ctx)
  const items = app.collection(itemsSpec)
  return app.registration({ tools: createTools(ctx, items) })
}
