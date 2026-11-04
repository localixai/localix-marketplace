import { Save } from 'lucide-react'
import {
  assertMiniAppResponse,
  postMiniAppJson,
  type ActionContribution,
} from '@localixai/mini-app-sdk/ui'
import { parseHttpFile } from '../shared/http'
import { APP, REQUESTS } from '../shared/model'

/** Whether a chat fragment is a code block that holds at least one request. */
const holdsRequests = (target: Parameters<ActionContribution['when']>[0]['target']): boolean =>
  target.kind === 'code' && parseHttpFile(target.text).length > 0

/**
 * "Save requests" on a code block in the transcript — a contextual content action
 * (`host.actions`). The host owns where it shows (`surface: 'chat.content'`, the block's toolbar);
 * the mini app owns whether it shows, what it does and where the result goes.
 *
 * `when` is synchronous and cheap, and the host checks it again before `run`. `run` posts each
 * request found to the collection's route for the chat the block belongs to (`context.sessionId`,
 * never the chat on screen), and returns the message the host shows the person. The strip updates
 * on its own: the write goes through the store feed like the agent's does.
 */
export const saveRequestsAction: ActionContribution = {
  id: 'example-workspace:save-requests',
  label: 'Save requests',
  title: 'Save the requests in this block to the chat’s request list',
  Icon: Save,
  when: ({ surface, target }) => surface === 'chat.content' && holdsRequests(target),
  async run({ sessionId, target }) {
    if (target.kind !== 'code') return { message: 'Nothing to save.' }
    const found = parseHttpFile(target.text)
    const path = `/rpc/${APP}/${REQUESTS}?sessionId=${encodeURIComponent(sessionId)}`
    for (const { name, method, url, headers, body } of found) {
      await assertMiniAppResponse(await postMiniAppJson(path, { name, method, url, headers, body }))
    }
    return { message: found.length === 1 ? 'Saved 1 request' : `Saved ${found.length} requests` }
  },
}
