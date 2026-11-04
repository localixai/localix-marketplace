import { afterAll, beforeAll } from 'bun:test'
import type { ReactElement } from 'react'
import { registerDom } from '@localixai/kit/testing'
import type { PublishedMessageContext } from '@localixai/mini-app-sdk/ui'
import { bindMiniAppUiTestDoubles } from '@localixai/mini-app-sdk/ui/testing'
import { bindMiniAppUiTransport } from '@localixai/mini-app-sdk/ui/transport'
import {
  applicationInputSchema,
  companyInputSchema,
  type Application,
  type Company,
} from '../shared/model'
import { byRole, click } from './test-dom'

export * from './test-dom'

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
  })
  afterAll(async () => {
    unbindDoubles()
    await teardown()
    if (prior === undefined) delete env.IS_REACT_ACT_ENVIRONMENT
    else env.IS_REACT_ACT_ENVIRONMENT = prior
  })
}

export const company = (id: string, name: string): Company => ({
  id,
  name,
  website: '',
  note: '',
  createdAt: '2026-10-01T09:00:00.000Z',
})
export const application = (over: Partial<Application> & Pick<Application, 'id'>): Application => ({
  companyId: 'c1',
  role: `Role ${over.id}`,
  status: 'wishlist',
  salary: null,
  appliedOn: null,
  note: '',
  history: [{ status: over.status ?? 'wishlist', at: '2026-10-01T09:00:00.000Z' }],
  createdAt: '2026-10-01T09:00:00.000Z',
  ...over,
})

export const fixtureCompanies = (): Company[] => [company('c1', 'Acme'), company('c2', 'Globex')]
/** Four applications at two companies; the interview outranks the applied one in the list. */
export const fixtureApplications = (): Application[] => [
  application({
    id: 'a1',
    role: 'Product designer',
    status: 'applied',
    salary: 90000,
    appliedOn: '2026-10-20',
    note: 'Referred by Sam',
    history: [
      { status: 'wishlist', at: '2026-10-18T09:00:00.000Z' },
      { status: 'applied', at: '2026-10-20T09:00:00.000Z' },
    ],
  }),
  application({
    id: 'a2',
    role: 'Design lead',
    companyId: 'c2',
    status: 'interview',
    salary: 130000,
  }),
  application({ id: 'a3', role: 'Illustrator', status: 'rejected' }),
  application({ id: 'a4', role: 'Researcher', companyId: 'c2' }),
]

export interface Call {
  method: string
  path: string
  body: unknown
}
export interface Harness {
  companies: Company[]
  applications: Application[]
  /** Every request, and only the writes among them. */
  calls: Call[]
  writes: Call[]
  /** Answer reads with a 500 until set back to false. */
  failReads: boolean
  /** Answer writes with this sentence as a 409 until set back to null. */
  failWrites: string | null
  release: () => void
  unbind: () => void
}

const respond = (status: number, body: unknown) => Response.json(body, { status })

/**
 * The backend's routes as the screen sees them: every change answers with the whole list, and the
 * cascade path removes the company's applications too (the real one is pinned by
 * backend/index.test.ts). Writes are validated with the app's real input schemas, so a body the
 * server would refuse is refused here too.
 */
export function bindBackend(
  init: {
    companies?: Company[]
    applications?: Application[]
    failReads?: boolean
    /** Keep reads waiting until `release()`: the screen stays in its loading state. */
    hold?: boolean
  } = {},
): Harness {
  const harness: Harness = {
    companies: init.companies ?? fixtureCompanies(),
    applications: init.applications ?? fixtureApplications(),
    calls: [],
    writes: [],
    failReads: init.failReads ?? false,
    failWrites: null,
    release: () => {},
    unbind: () => {},
  }
  const gate = init.hold ? new Promise<void>((resolve) => void (harness.release = resolve)) : null
  let counter = 0
  harness.unbind = bindMiniAppUiTransport({
    url: (path) => path,
    request: async (path, request) => {
      const method = request?.method ?? 'GET'
      const body = request?.body ? JSON.parse(request.body as string) : undefined
      harness.calls.push({ method, path, body })
      if (method !== 'GET') harness.writes.push({ method, path, body })
      if (method === 'GET' && gate) await gate
      if (method === 'GET' && harness.failReads) return respond(500, { error: 'Backend is down.' })
      if (method !== 'GET' && harness.failWrites) return respond(409, { error: harness.failWrites })

      const [, route, id, tail] =
        /^\/rpc\/[^/]+\/([^/?]+)(?:\/([^/?]+))?(?:\/([^/?]+))?/.exec(path) ?? []
      if (route === 'companies' && tail === 'with-applications') {
        harness.applications = harness.applications.filter((a) => a.companyId !== id)
        harness.companies = harness.companies.filter((c) => c.id !== id)
        return respond(200, { items: harness.companies })
      }
      const key =
        route === 'companies' ? 'companies' : route === 'applications' ? 'applications' : null
      if (!key) return respond(404, { error: 'No such route.' })
      const items = harness[key] as ({ id: string } & Record<string, unknown>)[]
      if (method === 'POST') {
        const schema = key === 'companies' ? companyInputSchema : applicationInputSchema
        const parsed = schema.safeParse(body)
        if (!parsed.success) return respond(400, { error: parsed.error.issues[0]!.message })
        const made =
          key === 'companies'
            ? { website: '', note: '', ...parsed.data }
            : application({ ...(parsed.data as Partial<Application>), id: '' })
        items.push({ ...made, id: `new-${(counter += 1)}`, createdAt: new Date().toISOString() })
      } else if (method === 'PATCH') {
        const index = items.findIndex((item) => item.id === id)
        if (index < 0) return respond(404, { error: 'That item is gone.' })
        items[index] = { ...items[index]!, ...body }
      } else if (method === 'DELETE') {
        const index = items.findIndex((item) => item.id === id)
        if (index >= 0) items.splice(index, 1)
      }
      return respond(200, { items })
    },
  })
  return harness
}

export interface Mounted {
  container: HTMLElement
  backend: Harness
  contexts: (PublishedMessageContext | null)[]
  act: (callback: () => unknown) => Promise<void>
  /** Let pending promises, timers and the polled reads settle. */
  settle: () => Promise<void>
  unmount: () => Promise<void>
}

/** Mount the screen against the fake backend. */
export async function mount(
  options: Parameters<typeof bindBackend>[0] & {} = {},
): Promise<Mounted> {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { App } = await import('./App')
  const backend = bindBackend(options)
  const contexts: Mounted['contexts'] = []
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const settle = () =>
    act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))))
  const element: ReactElement = (
    <App active publishMessageContext={(context) => contexts.push(context)} />
  )
  await act(async () => root.render(element))
  if (!options.hold) await settle()
  return {
    container,
    backend,
    contexts,
    act: (callback) => act(async () => void (await callback())),
    settle,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
      backend.unbind()
    },
  }
}

/**
 * Pick an option of a kit `Select` (a button that opens a listbox in a portal), the way a person
 * does: open it, then choose the option by its label.
 */
export async function choose(mounted: Mounted, select: HTMLElement, label: string): Promise<void> {
  await mounted.act(async () => {
    select.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    click(select)
  })
  const option = byRole('option').find((element) => element.textContent?.trim().startsWith(label))
  if (!option) throw new Error(`No option "${label}" in the open list`)
  await mounted.act(async () => click(option))
}
