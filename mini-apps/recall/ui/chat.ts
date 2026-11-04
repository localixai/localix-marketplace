import { miniAppComposer } from '@localixai/mini-app-sdk/ui/runtime'
import { useMiniAppSessions } from '@localixai/mini-app-sdk/ui/runtime-hooks'
import { useWorkItemSessionId } from '@localixai/mini-app-sdk/ui/work-item-session'

/**
 * Put a question in the person's Localix chat for them to read and send. The screen belongs to no
 * chat (app scope), so the text goes to the chat they used last; with none open the host puts it
 * in whichever composer has focus. Nothing is sent until the person presses send.
 */
export function useAskInChat(): (text: string) => void {
  const own = useWorkItemSessionId()
  const sessions = useMiniAppSessions()
  const latest = [...sessions]
    .filter((session) => session.sessionKind === 'chat')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const sessionId = own ?? latest?.id ?? ''
  return (text) => miniAppComposer.insert({ sessionId, text })
}
