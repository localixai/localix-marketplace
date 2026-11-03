import { Hono } from 'hono'
import {
  createMiniApp,
  type MiniAppContext,
  type MiniAppRegistration,
  type MiniAppRouteContext,
} from '@localixai/mini-app-sdk/backend'
import { summarize } from '../shared/model'
import { activitiesSpec, dealsSpec } from './collections'
import { seedOnFirstStart } from './seed'

/**
 * The backend: two collections and one read route. `createMiniApp` mounts the collections' routes
 * under `/rpc/ui-patterns` and wires the store feed; this file only says WHAT the app has.
 *
 * `register(ctx)` runs more than once (for the backend, and again for each run's tools): keep
 * state in collections, never in a module variable. The seed is safe to start every time.
 */
export function register(ctx: MiniAppContext): MiniAppRegistration {
  const app = createMiniApp(ctx)
  const deals = app.collection(dealsSpec)
  const activities = app.collection(activitiesSpec)
  const seeded = seedOnFirstStart(ctx, deals, activities).catch((error) =>
    ctx.log(`Could not seed the demo pipeline: ${String(error)}`),
  )

  // A derived read: the numbers are computed on the server from the same collection and the same
  // `summarize` the tests pin, and the route waits for the first-start seed so it never reports
  // an empty pipeline that is about to be filled.
  const routes = new Hono<MiniAppRouteContext>().get('/summary', async (c) => {
    await seeded
    return c.json(summarize(await deals.list(), new Date()))
  })
  return app.registration({ routes })
}
