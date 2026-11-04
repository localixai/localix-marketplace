import { FileTab } from '@localixai/mini-app-sdk/ui/components'
import type { FileEditorProps } from '@localixai/mini-app-sdk/ui'
import { RequestPanel } from './RequestPanel'
import { useFileRequests } from './useFileRequests'

/**
 * The editor for a `.http` file: the host's own file tab (`FileTab`, with its text editing, saving
 * and review comments) plus a panel docked beneath it (`bottomPanel`). A mini app never rebuilds
 * the editor to add to it.
 *
 * Registered with `host.fileEditors` in register.tsx, and declared in `fileAssociations` of
 * mini-app.json so the Store offers this app for such a file. `sessionId` is the chat the file tab
 * belongs to, passed down to every action the panel takes.
 */
export function HttpFileTab(props: FileEditorProps) {
  const state = useFileRequests(props.sessionId, props.path)
  return (
    <FileTab
      {...props}
      bottomPanel={<RequestPanel sessionId={props.sessionId} path={props.path} state={state} />}
    />
  )
}
