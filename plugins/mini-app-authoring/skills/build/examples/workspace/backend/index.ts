import {
  createMiniApp,
  type MiniAppContext,
  type MiniAppRegistration,
} from '@localixai/mini-app-sdk/backend'
import { createResourceProvider } from './resources'
import { requestsSpec } from './requests'
import { createTools } from './tools'

/**
 * The backend: the chat's requests, the agent's tools and the @-mention provider. `createMiniApp`
 * wires the collection's routes (`/rpc/example-workspace/requests?sessionId=…`), the feed that
 * updates the strip when the agent saves;
 * `backend` adds the fields of the subsystem it does not build for you, here `resourceProvider`.
 *
 * `register(ctx)` runs more than once (for the backend, and again for each run's tools): keep
 * state in collections, never in a module variable.
 */
export function register(ctx: MiniAppContext): MiniAppRegistration {
  const app = createMiniApp(ctx)
  const requests = app.collection(requestsSpec)
  return app.registration({
    tools: createTools(ctx, requests),
    backend: { resourceProvider: createResourceProvider(requests) },
  })
}
