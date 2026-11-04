import {
  createJsonStoreFeed,
  type MiniAppContext,
  type MiniAppRegistration,
} from '@localixai/mini-app-sdk/backend'

import { APP } from '../shared/game'
import { ROUTE_PATH } from '../shared/resource'
import { createGameService } from './game-service'
import { createGameRoutes } from './routes'
import { createGameTools } from './tools'

/**
 * Connect Four: one board per chat in the workbench, and the agent in that chat (or a decision
 * model) as the opponent.
 *
 * `register(ctx)` runs more than once: for the backend, and again for each run's tools. Only the
 * backend load carries `ctx.host`. That split is deliberate: the ROUTES are where a person acts,
 * and only a person's move asks the other side for one, so only they need `wake` and `decisions`.
 * Both loads carry `ctx.sessionStorage`, so tools and routes reach the same board, the one in the
 * chat's own folder. No module state: the game lives in that folder.
 *
 * This app has no collection, so it does not use `createMiniApp`: the table is one document per
 * chat, and the feed below is what lets an open board hear the agent's move instead of polling.
 */
export function register(ctx: MiniAppContext): MiniAppRegistration {
  const storage = ctx.sessionStorage
  const games = createGameService({
    ...(storage ? { resolveDir: (...args) => storage.resolveDataDir(...args) } : {}),
    ...(ctx.host?.wake ? { wake: ctx.host.wake } : {}),
    ...(ctx.host?.decisions ? { decisions: ctx.host.decisions } : {}),
  })
  // Every write to a chat's game nudges the boards following that chat. The nudge names the chat,
  // never the state: the board re-reads through its route.
  const feed = createJsonStoreFeed({
    watchPath: ctx.watchPath ?? ctx.host?.watchPath,
    miniApp: APP,
    resolveDir: async (userId, sessionId) =>
      sessionId && storage ? storage.resolveDataDir(userId, sessionId) : null,
  })
  return {
    backend: [
      {
        id: `${APP}:backend`,
        routeMount: { path: ROUTE_PATH, app: createGameRoutes(games) },
        wsFrames: feed.wsFrames,
        onShutdown: feed.onShutdown,
      },
    ],
    tools: createGameTools(ctx, games),
  }
}
