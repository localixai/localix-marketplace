import {
  createJsonStoreFeed,
  createMiniApp,
  type MiniAppContext,
  type MiniAppRegistration,
  type SemanticIndexHost,
} from '@localixai/mini-app-sdk/backend'
import { basename } from 'node:path'
import type { Clock } from '../shared/day'
import { registerNotesSource } from './judge'
import { createRoutes } from './routes'
import { createService, REVISION_FILE } from './service'
import { createTools } from './tools'

/**
 * The backend: the SQLite store, the screen's routes, the agent's tools and the live feed.
 * `register(ctx)` runs for the boot load and again for each run's tools; it keeps nothing between
 * calls (each operation opens and closes its own connection). The feed watches `revision.json`,
 * which every write bumps, so an open screen re-reads after the agent changes anything.
 */
export function register(ctx: MiniAppContext): MiniAppRegistration {
  return registerRecall(ctx)
}

/** `register` with an injectable clock, for tests that pin "now" and the time zone. */
export function registerRecall(ctx: MiniAppContext, options: { clock?: Clock } = {}): MiniAppRegistration {
  const semantic = semanticOf(ctx)
  const service = createService({ dataDir: ctx.dataDir, clock: options.clock, semantic })
  const app = createMiniApp(ctx)
  const feed = createJsonStoreFeed({
    miniApp: ctx.miniAppName,
    resolveDir: async () => ctx.dataDir,
    acceptPath: (_userId, path) => basename(path) === REVISION_FILE,
    watchPath: ctx.watchPath,
  })
  // The boot load (the one with `host`) registers the notes source; a tool's load only reads the
  // index and announces its writes. The index reads notes page by page when it scans.
  const releaseSource = ctx.host?.semantic ? registerNotesSource(service.core, ctx.host.semantic, ctx.userId) : undefined
  return app.registration({
    routes: createRoutes({ service, ctx }),
    tools: createTools({ ctx, service }),
    backend: {
      wsFrames: feed.wsFrames,
      onShutdown: () => {
        feed.onShutdown()
        releaseSource?.()
      },
    },
  })
}

/**
 * The semantic index this load reads. Newer hosts give it to every load, a tool's too, as
 * `ctx.semantic`; older ones only to the boot load, as `ctx.host.semantic`.
 */
function semanticOf(ctx: MiniAppContext): SemanticIndexHost | undefined {
  return (ctx as MiniAppContext & { semantic?: SemanticIndexHost }).semantic ?? ctx.host?.semantic
}
