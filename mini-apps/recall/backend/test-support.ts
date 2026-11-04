import { callTool, requestRoute, testMiniAppContext } from '@localixai/mini-app-sdk/backend/testing'
import type { MiniAppContext, MiniAppRegistration } from '@localixai/mini-app-sdk/backend'
import { pathOf, type RouteName } from '../shared/api'
import type { Clock } from '../shared/day'
import { registerRecall } from './index'

/**
 * Test helpers: Recall registered on a temp data folder with a clock the test moves, and requests
 * by route name from the contract in `shared/api.ts`.
 */

export interface MovableClock extends Clock {
  set(at: string): void
  advance(ms: number): void
}

export function movableClock(at: string, utcOffsetMinutes = 0): MovableClock {
  let moment = Date.parse(at)
  return {
    now: () => new Date(moment),
    utcOffset: () => utcOffsetMinutes,
    set: (next) => {
      moment = Date.parse(next)
    },
    advance: (ms) => {
      moment += ms
    },
  }
}

export const MINUTE = 60_000
export const DAY = 86_400_000

export async function recallApp(
  options: { at?: string; utcOffset?: number; host?: Parameters<typeof testMiniAppContext>[0]['host'] } = {},
) {
  const ctx = await testMiniAppContext({ name: 'recall', host: options.host })
  const clock = movableClock(options.at ?? '2026-11-04T10:00:00.000Z', options.utcOffset ?? 0)
  const app = registerRecall(ctx, { clock })
  return Object.assign(ctx, { app, clock })
}

export type RecallTestApp = Awaited<ReturnType<typeof recallApp>>

/** A JSON route by its name in the contract; throws with the answer when the status is not 2xx. */
export async function route<T = any>(
  app: MiniAppRegistration,
  name: RouteName,
  options: { params?: Record<string, string>; query?: Record<string, any>; body?: unknown; expect?: number } = {},
): Promise<T> {
  const { api } = await import('../shared/api')
  const path = pathOf(name, options.params, options.query).replace(/^\/rpc\/recall/, '')
  const answer = await requestRoute(app, api[name].method, path, options.body)
  const expected = options.expect ?? 200
  if (answer.status !== expected) {
    throw new Error(`${name} answered ${answer.status}, expected ${expected}: ${JSON.stringify(answer.json)}`)
  }
  return answer.json as T
}

/** A raw request (bytes up, bytes or text down), straight to the mounted routes. */
export async function rawRoute(
  app: MiniAppRegistration,
  method: string,
  path: string,
  body?: Uint8Array,
): Promise<Response> {
  const mount = [app.backend ?? []].flat().find((part) => part.routeMount)?.routeMount
  if (!mount) throw new Error('No routes mounted.')
  return mount.app.request(
    path,
    { method, ...(body ? { body: body as BodyInit, headers: { 'content-type': 'application/octet-stream' } } : {}) },
    { userId: 'test-user', projectId: '', cwd: '/' },
  )
}

export { callTool }

/** Add notes through the agent's tool, ready to study, and answer their ids (newest last). */
export async function addReady(app: MiniAppRegistration, cards: object[], deck?: string): Promise<string[]> {
  const answer = await callTool(app, 'recall_add_cards', { cards, deck, draft: false })
  if (answer.isError) throw new Error(answer.text)
  return [...answer.text.matchAll(/[0-9a-f]{8}-[0-9a-f-]{27}/g)].map((m) => m[0])
}

export type { MiniAppContext }
