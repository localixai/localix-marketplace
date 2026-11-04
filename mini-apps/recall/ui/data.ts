import type { z } from 'zod'
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useStoreSnapshot } from '@localixai/mini-app-sdk/ui/store-snapshot'
import { MiniAppApiError, miniAppApiFetch, unwrapMiniAppResponse } from '@localixai/mini-app-sdk/ui/transport'
import { useWorkItemSessionId } from '@localixai/mini-app-sdk/ui/work-item-session'
import {
  api,
  pathOf,
  type Api,
  type BodyOf,
  type QueryOf,
  type ResponseOf,
  type RouteName,
} from '../shared/api'
import { APP } from '../shared/model'
import { revisionSchema } from '../shared/payloads-more'

/**
 * Everything the screen asks of the backend, typed by the route table in `shared/api.ts`: `call`
 * is one request, `useRead` is a read that runs again when the store's revision moves (every write
 * bumps it, the agent's too), `useAction` is a write that bumps it. Nothing here knows a path.
 */

/** The routes that answer JSON (the others are bytes and downloads). */
export type JsonRoute = {
  [K in RouteName]: Api[K]['response'] extends z.ZodType ? K : never
}[RouteName]

export interface CallOptions<K extends JsonRoute> {
  params?: Record<string, string>
  query?: QueryOf<K>
  body?: BodyOf<K>
  /** The work item's chat, for the routes that ask the decision model. */
  sessionId?: string | null
}

export const messageOf = (error: unknown, fallback = 'Something went wrong.'): string =>
  error instanceof Error && error.message ? error.message : fallback

function parsed<K extends JsonRoute>(name: K, json: unknown): ResponseOf<K> {
  const schema = api[name].response as z.ZodType
  const result = schema.safeParse(json)
  if (!result.success) throw new Error('Recall answered in a shape this screen does not know.')
  return result.data as ResponseOf<K>
}

/** One request to a JSON route. A refusal throws with the server's sentence. */
export async function call<K extends JsonRoute>(
  name: K,
  options: CallOptions<K> = {},
): Promise<ResponseOf<K>> {
  const query = { ...(options.query as object | undefined), sessionId: options.sessionId }
  const path = pathOf(name, options.params, query as Record<string, string | undefined>)
  const init: RequestInit = { method: api[name].method }
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
    init.headers = { 'content-type': 'application/json' }
  }
  return parsed(name, await unwrapMiniAppResponse<unknown>(await miniAppApiFetch(path, init)))
}

/** A file's raw bytes to the import routes (octet-stream), answered as JSON. */
export async function upload<K extends 'importPreview' | 'importCommit'>(
  name: K,
  file: File,
  query: QueryOf<K>,
): Promise<ResponseOf<K>> {
  const path = pathOf(name, {}, query as Record<string, string>)
  const response = await miniAppApiFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: file,
  })
  return parsed(name, await unwrapMiniAppResponse<unknown>(response))
}

interface Shared {
  revision: number
  /** Re-read the revision now, after this screen wrote. */
  bump: () => void
  sessionId: string | null
  active: boolean
}
const DataContext = createContext<Shared | null>(null)

export function useShared(): Shared {
  const shared = useContext(DataContext)
  if (!shared) throw new Error('Recall data used outside its provider.')
  return shared
}

/** Holds the revision every read keys on. The screen mounts it once. */
export function DataProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const sessionId = useWorkItemSessionId()
  const snapshot = useStoreSnapshot({
    miniApp: APP,
    sessionId: null,
    path: pathOf('revision'),
    schema: revisionSchema,
    intervalMs: null,
    active,
    failureMessage: 'Recall could not check for changes.',
  })
  const revision = snapshot.snapshot?.revision ?? 0
  const bump = snapshot.refresh
  const value = useMemo(
    () => ({ revision, bump, sessionId, active }),
    [revision, bump, sessionId, active],
  )
  return createElement(DataContext.Provider, { value }, children)
}

/** `call` bound to the work item's chat, for writes and one-off reads made from a handler. */
export function useCall() {
  const { sessionId } = useShared()
  return useCallback(
    <K extends JsonRoute>(name: K, options: CallOptions<K> = {}) =>
      call(name, { sessionId, ...options }),
    [sessionId],
  )
}

export interface Read<T> {
  data: T | null
  error: string | null
  /** True until the first answer of the current query. */
  loading: boolean
  /** The owner answered "not found": the thing is gone, and no copy of it is kept. */
  gone: boolean
  refresh: () => void
}

/**
 * A read that keeps the last answer while it runs again (a changed query or a moved revision), so
 * a list never blinks to empty. `enabled: false` waits.
 */
export function useRead<K extends JsonRoute>(
  name: K,
  options: CallOptions<K> = {},
  enabled = true,
): Read<ResponseOf<K>> {
  const shared = useShared()
  const [data, setData] = useState<ResponseOf<K> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [answered, setAnswered] = useState('')
  const [gone, setGone] = useState(false)
  const [again, setAgain] = useState(0)
  const latest = useRef(options)
  latest.current = options
  const sessionId = options.sessionId === undefined ? shared.sessionId : options.sessionId
  const key = JSON.stringify([name, options.params, options.query, sessionId])
  useEffect(() => {
    if (!enabled || !shared.active) return
    let live = true
    call(name, { ...latest.current, sessionId })
      .then((value) => {
        if (!live) return
        setData(value)
        setError(null)
        setGone(false)
        setAnswered(key)
      })
      .catch((failure: unknown) => {
        if (!live) return
        setError(messageOf(failure, 'Could not read this.'))
        // A 404 is the owner saying it is gone: drop the last copy instead of showing it.
        const missing = failure instanceof MiniAppApiError && failure.status === 404
        setGone(missing)
        if (missing) setData(null)
        setAnswered(key)
      })
    return () => {
      live = false
    }
  }, [key, name, sessionId, shared.revision, shared.active, enabled, again])
  const refresh = useCallback(() => setAgain((n) => n + 1), [])
  return { data, error, gone, loading: enabled && answered !== key && data === null, refresh }
}

/** A write: runs it, bumps the revision on success, keeps the refusal's sentence for the form. */
export function useAction() {
  const { bump } = useShared()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(
    async <T>(work: () => Promise<T>): Promise<T | null> => {
      setBusy(true)
      setError(null)
      try {
        const result = await work()
        bump()
        return result
      } catch (failure) {
        setError(messageOf(failure))
        return null
      } finally {
        setBusy(false)
      }
    },
    [bump],
  )
  const clear = useCallback(() => setError(null), [])
  return { run, busy, error, clear }
}

/** Waits this long before a search or a similar-card check asks (tests set it to 0). */
export const DEBOUNCE = { ms: 250 }

export function useDebounced<T>(value: T, ms = DEBOUNCE.ms): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}
