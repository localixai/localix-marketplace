import { toast } from '@localixai/mini-app-sdk/ui'
import { miniAppTerminal } from '@localixai/mini-app-sdk/ui/runtime'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'
import { curlCommand, type HttpRequest } from '../shared/http'

/**
 * Run a request with curl in the chat's terminal (`miniAppTerminal.spawnCommand`): a new terminal
 * tab the person can watch, scroll and close.
 *
 * `sessionId` is the chat of the surface that asked — the file tab's, the strip's. Never "the chat
 * on screen": a file kept open for chat A would otherwise open its terminal in chat B.
 *
 * A spawn that fails is REPORTED. It resolves rather than throws, because every caller is a click
 * handler with nothing to add.
 */
export async function runRequest(sessionId: string, request: HttpRequest): Promise<void> {
  const title = `${request.method} ${request.name}`
  try {
    await miniAppTerminal.spawnCommand({ command: curlCommand(request), sessionId, title })
  } catch (cause) {
    toast.error(`Could not open “${title}” in a terminal`, {
      description: errorMessage(cause, '') || undefined,
    })
  }
}
