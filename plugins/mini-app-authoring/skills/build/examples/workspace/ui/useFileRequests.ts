import { useState } from 'react'
import { useFileResourceSync } from '@localixai/mini-app-sdk/ui/file-resource-sync'
import { miniAppFiles } from '@localixai/mini-app-sdk/ui/runtime'
import { errorMessage } from '@localixai/mini-app-sdk/ui/utilities'
import { parseHttpFile, type ParsedRequest } from '../shared/http'

export interface FileRequests {
  requests: ParsedRequest[]
  loading: boolean
  error: string | null
}

/**
 * The requests in one open `.http` file, as saved on disk.
 *
 * `useFileResourceSync` is the file-backed read model: it reads once, hears the workspace watcher
 * when the file changes (the person saves, or the agent edits it) and re-reads, and polls only
 * while the watcher is not live. `prefix` narrows the changes that count to this file's path. The
 * editor's unsaved text is not on disk, so the panel follows the file as saved.
 */
export function useFileRequests(sessionId: string, path: string): FileRequests {
  const [state, setState] = useState<FileRequests>({ requests: [], loading: true, error: null })
  useFileResourceSync({
    sessionId,
    prefix: path,
    resetKey: path,
    read: async (signal) =>
      parseHttpFile((await miniAppFiles.read(sessionId, path, { signal })).content),
    apply: (requests) => setState({ requests, loading: false, error: null }),
    onError: (cause) =>
      setState((previous) => ({
        ...previous,
        loading: false,
        error: errorMessage(cause, 'Could not read the file.'),
      })),
  })
  return state
}
