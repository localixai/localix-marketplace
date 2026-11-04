import { Hono } from 'hono'
import {
  createMiniApp,
  type MiniAppContext,
  type MiniAppRegistration,
  type MiniAppRouteContext,
} from '@localixai/mini-app-sdk/backend'
import { applicationsSpec } from './applications'
import { removeCompany } from './cascade'
import { companiesSpec } from './companies'
import { createTools } from './tools'

/**
 * The backend: two collections, one route that replaces a generated one, and the agent's tools.
 * `createMiniApp` mounts each collection's routes under `/rpc/example-tracker` and wires the
 * store feed; this file only says WHAT the app has.
 *
 * `register(ctx)` runs more than once (for the backend, and again for each run's tools): keep
 * state in collections, never in a module variable.
 */
export function register(ctx: MiniAppContext): MiniAppRegistration {
  const app = createMiniApp(ctx)
  const companies = app.collection(companiesSpec)
  const applications = app.collection(applicationsSpec)

  // The collection's own DELETE /companies/:id removes one record and nothing else, and a route
  // of the same path would never be reached (the generated one is mounted first). So the cascade
  // has a path of its own, which the screen calls instead. It answers with the companies list, like
  // the generated routes, and the screen re-reads the applications after it.
  const routes = new Hono<MiniAppRouteContext>().delete(
    '/companies/:id/with-applications',
    async (c) => {
      if (!(await removeCompany(companies, applications, c.req.param('id')))) {
        return c.json({ error: 'No company has that id.' }, 404)
      }
      return c.json({ items: await companies.list() })
    },
  )
  return app.registration({ routes, tools: createTools(ctx, companies, applications) })
}
