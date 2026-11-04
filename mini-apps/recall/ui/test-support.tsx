import { afterAll, beforeAll } from 'bun:test'
import { formatChordText } from '@localixai/kit/keybindings'
import { registerDom } from '@localixai/kit/testing'
import type { PublishedMessageContext } from '@localixai/mini-app-sdk/ui'
import { bindMiniAppUiRuntime, type MiniAppComposerInsert, type MiniAppUiRuntime } from '@localixai/mini-app-sdk/ui/runtime'
import { bindMiniAppUiTestDoubles } from '@localixai/mini-app-sdk/ui/testing'
import { bindMiniAppUiTransport } from '@localixai/mini-app-sdk/ui/transport'
import { API_BASE, api, type RouteName } from '../shared/api'
import type { Review } from '../shared/model'
import type { CheckAnswerResult, LibraryRow, Placement, SimilarHit, StudyCard } from '../shared/payloads'
import type { ImportPreview, ImportResult } from '../shared/payloads-more'
import { DEBOUNCE } from './data'
import * as fx from './test-fixtures'
import { click } from './test-dom'

export * from './test-dom'

/** Cmd+Enter or Ctrl+Enter, whichever the host's platform counts as the primary modifier. */
export const PRIMARY: KeyboardEventInit = formatChordText('mod+enter').startsWith('Ctrl') ? { ctrlKey: true } : { metaKey: true }
export * as fx from './test-fixtures'

/** Register a DOM, the host's doubles and React's act environment for the file's tests. */
export function setupDom(): void {
  let teardown: () => Promise<void>
  let unbindDoubles: () => void
  const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const prior = env.IS_REACT_ACT_ENVIRONMENT
  beforeAll(() => {
    teardown = registerDom()
    unbindDoubles = bindMiniAppUiTestDoubles()
    env.IS_REACT_ACT_ENVIRONMENT = true
    DEBOUNCE.ms = 0
  })
  afterAll(async () => {
    unbindDoubles()
    await teardown()
    if (prior === undefined) delete env.IS_REACT_ACT_ENVIRONMENT
    else env.IS_REACT_ACT_ENVIRONMENT = prior
  })
}

export interface Call {
  method: string
  name: RouteName
  path: string
  query: URLSearchParams
  body: any
}

/** The backend as the screen sees it: every route of the contract, over a small in-memory state. */
export interface Fake {
  revision: number
  today: ReturnType<typeof fx.today>
  decks: ReturnType<typeof fx.deck>[]
  settings: ReturnType<typeof fx.settingsResult>
  stats: ReturnType<typeof fx.stats>
  rows: LibraryRow[]
  queue: StudyCard[]
  similar: SimilarHit[]
  placement: Placement[]
  check: CheckAnswerResult
  preview: ImportPreview
  imported: ImportResult
  becameHard: boolean
  undo?: StudyCard
  /** What the screen put in the chat composer, and the files it saved. */
  composer: MiniAppComposerInsert[]
  saved: string[]
  /** Every request, and the writes among them. */
  calls: Call[]
  writes: Call[]
  failReads: boolean
  /** Answer one named route with this status and sentence. */
  refuse: Partial<Record<RouteName, string>>
  unbind: () => void
}

const routes = (Object.keys(api) as RouteName[]).map((name) => ({
  name,
  method: api[name].method as string,
  re: new RegExp(`^${api[name].path.replace(/:\w+/g, '([^/]+)')}$`),
}))

const NO_SESSIONS: never[] = []
const ASKS: RouteName[] = ['similar', 'placement', 'studyCheck', 'importPreview']
const json = (status: number, body: unknown) => Response.json(body, { status })
const review = (card: StudyCard, rating: 1 | 2 | 3 | 4): Review => ({
  id: `r-${card.card.id}`,
  cardId: card.card.id,
  noteId: card.note.id,
  rating,
  state: 2,
  due: '2026-11-07T09:00:00.000Z',
  stability: 5,
  difficulty: 5,
  scheduledDays: 3,
  elapsedDays: 1,
  reviewedAt: '2026-11-04T09:00:00.000Z',
  durationMs: 4000,
  source: 'screen',
  prev: null,
})

export function bindBackend(init: Partial<Fake> = {}): Fake {
  const rows = [fx.row('a', 'Hola means hello'), fx.row('b', 'Gracias means thanks', { tags: ['basics'] }), fx.row('c', 'Mitosis', { deckId: 'd2' })]
  const fake: Fake = {
    revision: 1,
    today: fx.today(),
    decks: [fx.deck('d1', 'Spanish'), fx.deck('d2', 'Biology', { color: 2 })],
    settings: fx.settingsResult(),
    stats: fx.stats(),
    rows,
    queue: [fx.studyCard('s1', 'What is the capital of France?', { }, { back: 'Paris' }), fx.studyCard('s2', 'Hola')],
    similar: [],
    placement: [],
    check: { verdict: 'correct', rating: 3, by: 'exact', expected: 'Paris' },
    preview: { source: 'spanish.csv', format: 'csv', notes: 3, cards: 3, decks: [{ name: 'Spanish', notes: 3, exists: true }], duplicates: 1, withProgress: 0, media: 0, warnings: ['One row had no back.'], sample: [{ kind: 'basic', front: 'Hola', back: 'Hello' }] },
    imported: { source: 'spanish.csv', added: 2, cards: 2, skippedDuplicates: 1, decksCreated: [], status: 'draft', reviewsReplayed: 0, warnings: [], decks: [{ id: 'd1', name: 'Spanish', color: 1, notes: 2 }] },
    becameHard: false,
    composer: [],
    saved: [],
    calls: [],
    writes: [],
    failReads: false,
    refuse: {},
    unbind: () => {},
    ...init,
  }
  const handlers: Partial<Record<RouteName, (c: Call, p: string[]) => unknown>> = {
    revision: () => ({ revision: fake.revision }),
    today: () => fake.today,
    heatmap: (c) => fx.heatmap(Number(c.query.get('weeks') ?? 12)),
    decks: () => ({ decks: fake.decks }),
    settings: () => fake.settings,
    settingsUpdate: (c) => ((fake.settings = { ...fake.settings, settings: { ...fake.settings.settings, ...c.body } }), fake.settings),
    stats: () => fake.stats,
    library: (c) => {
      const q = c.query
      const text = q.get('q')?.toLowerCase()
      const states = q.get('states')?.split(',') ?? []
      const deck = q.get('deckIds')?.split(',')
      const all = fake.rows.filter(
        (r) =>
          (!text || r.note.front.toLowerCase().includes(text)) &&
          (!states.includes('draft') || r.note.status === 'draft') &&
          (!deck || deck.includes(r.note.deckId ?? 'inbox')),
      )
      const offset = Number(q.get('offset') ?? 0)
      const limit = Number(q.get('limit') ?? 50)
      const next = offset + limit < all.length ? offset + limit : null
      return { rows: all.slice(offset, offset + limit), total: all.length, offset, limit, nextOffset: next, by: text && q.get('mode') === 'meaning' ? 'meaning' : 'text' }
    },
    noteGet: (_c, p) => {
      const r = fake.rows.find((x) => x.note.id === p[0])
      return r ? fx.detail(r) : json(404, { error: { code: 'not_found', message: 'That card is gone.' } })
    },
    noteUpdate: (c, p) => {
      const r = fake.rows.find((x) => x.note.id === p[0])!
      r.note = { ...r.note, ...c.body, updatedAt: `2026-11-04T10:0${fake.revision % 10}:00.000Z` }
      return { note: r.note, cards: [], similar: [] }
    },
    noteCreate: (c) => {
      const r = fx.row(`new-${fake.rows.length}`, c.body.front, { ...c.body, status: 'active' })
      fake.rows.unshift(r)
      return { note: r.note, cards: [], similar: fake.similar }
    },
    bulk: (c) => {
      if (c.body.action === 'delete') fake.rows = fake.rows.filter((r) => !c.body.ids.includes(r.note.id))
      return { affected: c.body.ids.length, message: `Done: ${c.body.action}.` }
    },
    drafts: (c) => ((fake.rows.forEach((r) => c.body.ids?.includes(r.note.id) && (r.note = { ...r.note, status: 'active' })), { affected: 1, message: 'Accepted.' })),
    similar: () => ({ similar: fake.similar, by: 'exact' }),
    placement: () => ({ suggestions: fake.placement }),
    studyNext: () => ({ card: fake.queue[0] ?? null, counts: { learning: 0, review: fake.queue.length, new: 0, total: fake.queue.length }, nextDueAt: fake.queue.length ? null : (fake.today.nextDueAt ?? '2026-11-04T18:40:00.000Z'), reviewedToday: 0 }),
    studyCard: (_c, p) => fake.queue.find((x) => x.card.id === p[0]) ?? json(404, { error: { code: 'not_found', message: 'Gone.' } }),
    studyGrade: (c) => {
      const done = fake.queue.shift()!
      fake.undo = done
      return { review: review(done, c.body.rating), label: '3 d', becameHard: fake.becameHard, next: handlers.studyNext!(c, []) }
    },
    studyUndo: (c) => {
      const back = fake.undo
      if (!back) return { card: null, undone: null }
      fake.queue.unshift(back)
      fake.undo = undefined
      return { card: back, undone: { cardId: back.card.id, rating: 1 } }
    },
    studyCheck: () => fake.check,
    studyPause: (c) => (fake.queue.shift(), handlers.studyNext!(c, [])),
    studySkip: (c) => (fake.queue.shift(), handlers.studyNext!(c, [])),
    importPreview: () => fake.preview,
    importCommit: () => fake.imported,
    deckCreate: (c) => fx.deck('d9', c.body.name, { color: c.body.color }),
    deckRemove: (_c, p) => ({ removed: p[0]!, moved: 1, deleted: 0 }),
  }
  const unbindRuntime = bindMiniAppUiRuntime({
    composer: { insert: (request: MiniAppComposerInsert) => void fake.composer.push(request) },
    sessions: { list: () => NO_SESSIONS, subscribe: () => () => {} },
    files: { saveBlob: (name: string) => void fake.saved.push(name) },
  } as unknown as MiniAppUiRuntime)
  const unbindTransport = bindMiniAppUiTransport({
    url: (path) => path,
    request: async (path, request) => {
      const method = request?.method ?? 'GET'
      const [pathname, search = ''] = path.slice(API_BASE.length).split('?')
      const hit = routes.find((r) => r.method === method && r.re.test(pathname!))
      if (!hit) return json(404, { error: { code: 'no_route', message: `No route ${method} ${pathname}` } })
      const raw = request?.body
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw ? { bytes: true, name: (raw as File).name } : undefined
      const call: Call = { method, name: hit.name, path, query: new URLSearchParams(search), body }
      fake.calls.push(call)
      // These POSTs only ask; every other non-GET changes something.
      if (method !== 'GET' && !ASKS.includes(hit.name)) {
        fake.writes.push(call)
        fake.revision += 1
      }
      if (fake.failReads && method === 'GET') return json(500, { error: { code: 'down', message: 'Backend is down.' } })
      const refusal = fake.refuse[hit.name]
      if (refusal) return json(409, { error: { code: 'refused', message: refusal } })
      const answer = handlers[hit.name]?.(call, hit.re.exec(pathname!)!.slice(1))
      return answer instanceof Response ? answer : json(200, answer ?? {})
    },
  })
  fake.unbind = () => (unbindTransport(), unbindRuntime())
  return fake
}

export interface Mounted {
  container: HTMLElement
  fake: Fake
  contexts: (PublishedMessageContext | null)[]
  act: (callback: () => unknown) => Promise<void>
  settle: () => Promise<void>
  unmount: () => Promise<void>
}

/** Mount the whole screen against the fake backend, as the host does. */
export async function mount(init: Partial<Fake> = {}): Promise<Mounted> {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { App } = await import('./App')
  try {
    localStorage.clear()
  } catch {
    // a DOM without storage starts clean anyway
  }
  const fake = bindBackend(init)
  const contexts: Mounted['contexts'] = []
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const settle = async () => {
    for (let i = 0; i < 3; i += 1) await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))))
  }
  await act(async () => root.render(<App active publishMessageContext={(context) => contexts.push(context)} />))
  await settle()
  return {
    container,
    fake,
    contexts,
    act: (callback) => act(async () => void (await callback())),
    settle,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
      fake.unbind()
    },
  }
}

/** Press a tab of the screen's tab bar. */
export async function openTab(screen: Mounted, label: string): Promise<void> {
  const tab = [...screen.container.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent?.startsWith(label))
  if (!tab) throw new Error(`No tab ${label}`)
  await screen.act(async () => click(tab))
  await screen.settle()
}
