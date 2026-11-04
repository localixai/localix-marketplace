import {
  buildResourceUri,
  noticeNode,
  providerSegments,
  type Collection,
  type ResourceExpansion,
  type ResourceNode,
  type ResourceRefProvider,
} from '@localixai/mini-app-sdk/backend'
import { formatRequest } from '../shared/http'
import { RESOURCE_PROVIDER, asRequest, newestFirst, type SavedRequest } from '../shared/model'
import type { requestsSpec } from './requests'

type Requests = Collection<SavedRequest, (typeof requestsSpec)['input']['shape']>

/**
 * @-MENTIONS: the chat's saved requests in the composer's @ menu. A flat tree — the roots are the
 * requests, newest first — and `expand` is what the agent reads when one is mentioned: the request
 * as `.http` text, the same format the editor opens.
 *
 * The host passes the chat the menu was opened in as `scope.sessionId`; a request is only ever
 * listed or expanded for that chat. Without one (a menu with no chat) there is nothing to show.
 */
export function createResourceProvider(requests: Requests): ResourceRefProvider {
  const rootUri = buildResourceUri(RESOURCE_PROVIDER)
  return {
    provider: RESOURCE_PROVIDER,
    title: 'Requests',

    async listChildren(userId, parentUri, query, scope): Promise<ResourceNode[]> {
      if (parentUri !== null || !scope?.sessionId) return []
      const saved = newestFirst(await requests.list({ userId, sessionId: scope.sessionId }))
      const needle = query?.trim().toLowerCase()
      const shown = needle
        ? saved.filter((request) => `${request.name} ${request.url}`.toLowerCase().includes(needle))
        : saved
      // An empty list still shows the provider, with a hint, instead of vanishing from the menu.
      if (!shown.length)
        return [noticeNode(rootUri, 'No saved requests', 'Ask the agent to save one')]
      return shown.map((request) => ({
        uri: buildResourceUri(RESOURCE_PROVIDER, [request.id]),
        label: request.name,
        detail: `${request.method} ${request.url}`,
        hasChildren: false,
        icon: RESOURCE_PROVIDER,
      }))
    },

    async expand(userId, uri, scope): Promise<ResourceExpansion> {
      const segments = providerSegments(RESOURCE_PROVIDER, uri)
      const id = segments?.length === 1 ? decodeURIComponent(segments[0]!) : null
      if (!id || !scope?.sessionId) return { ok: false, error: `unknown request: ${uri}` }
      const found = await requests.get(id, { userId, sessionId: scope.sessionId })
      if (!found) return { ok: false, error: `unknown request: ${uri}` }
      return { ok: true, content: formatRequest(asRequest(found)), language: 'http' }
    },
  }
}
