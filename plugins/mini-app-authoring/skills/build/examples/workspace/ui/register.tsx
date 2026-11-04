import { Send } from 'lucide-react'
import type { MiniAppUiHost } from '@localixai/mini-app-sdk/ui'
import { HttpFileTab } from './HttpFileTab'
import { RequestsStrip } from './RequestsStrip'
import { SaveRequestCard } from './ToolCard'
import { saveRequestsAction } from './saveAction'
import { RESOURCE_PROVIDER, SAVE_TOOL } from '../shared/model'

const registeredHosts = new WeakSet<MiniAppUiHost>()

/** The tools that only need a verb and an icon in the transcript, not a card of their own. */
const PLAIN_TOOLS = [
  { tool: 'example_workspace_list_requests', label: 'Read', verb: 'Reading', readOnly: true },
  { tool: 'example_workspace_curl_request', label: 'Prepared', verb: 'Preparing', readOnly: true },
  { tool: 'example_workspace_remove_request', label: 'Removed', verb: 'Removing', readOnly: false },
] as const

/**
 * This mini app has no screen of its own: it lives IN Localix's surfaces. So `registerUi` is not
 * `screenUi` but the host's registrations, composed by hand. Each one names a place the host lays
 * out; the host names no mini app.
 *
 * It runs once per host however often it is called (the host may call it again on a reload),
 * hence the WeakSet. Everything registered disappears when the mini app is disabled.
 */
export function registerUi(host: MiniAppUiHost): void {
  if (registeredHosts.has(host)) return
  registeredHosts.add(host)

  // A file family: the editor for `*.http`. The Store offers this app for such a file because
  // mini-app.json declares it in `fileAssociations`.
  host.fileEditors.register({
    id: 'example-workspace:http-editor',
    label: 'HTTP requests',
    match: (path) => path.toLowerCase().endsWith('.http'),
    Component: HttpFileTab,
  })

  // How the tools read in the transcript: a card for the save, a verb and icon for the rest.
  host.toolCards.register({
    tool: SAVE_TOOL,
    presentation: { label: 'Saved', noun: 'requests', verb: 'Saving', Icon: Send, stackable: true },
    Component: SaveRequestCard,
  })
  for (const { tool, label, verb, readOnly } of PLAIN_TOOLS) {
    host.toolCards.register({
      tool,
      presentation: { label, noun: 'requests', verb, Icon: Send, stackable: true, readOnly },
    })
  }

  // A strip above the chat's composer, with the live count.
  host.sessionSurfaces.register({ surface: 'composer.header', Component: RequestsStrip })

  // A button on a code block in the transcript. `actions` is optional on older hosts.
  host.actions?.register(saveRequestsAction)

  // The glyph the @ menu draws for the provider's nodes (their `icon` hint).
  host.resourceRefIcons.register({ [RESOURCE_PROVIDER]: Send })
}
