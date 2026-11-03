import { afterAll, beforeAll } from 'bun:test'
import type { ReactElement } from 'react'
import { registerDom } from '@localixai/kit/testing'
import { bindMiniAppUiTransport } from '@localixai/mini-app-sdk/ui/transport'
import { bindMiniAppUiTestDoubles } from '@localixai/mini-app-sdk/ui/testing'
import {
  activityInputSchema,
  dealInputSchema,
  summarize,
  type Activity,
  type Deal,
} from '../../shared/model'
import { click, byRole } from './test-dom'
import { fixtureActivities, fixtureDeals } from './test-fixtures'

export * from './test-dom'
export * from './test-fixtures'

/**
 * Shared harness of the pattern tests: a DOM, the host's test doubles, and a fake backend that
 * answers the app's real routes (the two collections and `/summary`) from memory and records every
 * write. A test drives the pattern the way a person does and asserts what appears on screen and
 * what the backend was asked: `harness.writes`.
 *
 * Keep it out of the patterns themselves: it imports `bun:test`.
 */

/** Register a DOM for the file's tests. Call once at the top of a `*.dom.test.tsx`. */
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

export interface Call {
  method: string
  path: string
  body: unknown
}

export interface Harness {
  /** Every request, in order. */
  calls: Call[]
  /** Only the requests that change something. */
  writes: Call[]
  deals: Deal[]
  activities: Activity[]
  /** Answer reads with a 500 until set back to false. */
  failReads: boolean
  /** Answer writes with this sentence as a 409 until set back to null. */
  failWrites: string | null
  /** Hold writes until `releaseWrites()`: the save stays pending. */
  holdWrites: () => void
  releaseWrites: () => void
  /** Let held reads answer (see the `hold` option); no-op when nothing is held. */
  release: () => void
  unbind: () => void
}

function respond(status: number, body: unknown): Response {
  return Response.json(body, { status })
}

/**
 * Bind the fake backend. It validates writes with the app's real input schemas, so a body the
 * server would refuse is refused here too.
 */
export function bindBackend(
  init: {
    deals?: Deal[]
    activities?: Activity[]
    failReads?: boolean
    /** Keep reads waiting until `release()`: the screen stays in its loading state. */
    hold?: boolean
  } = {},
): Harness {
  const harness: Harness = {
    calls: [],
    writes: [],
    deals: init.deals ?? fixtureDeals(),
    activities: init.activities ?? fixtureActivities(),
    failReads: init.failReads ?? false,
    failWrites: null,
    release: () => {},
    holdWrites: () => {},
    releaseWrites: () => {},
    unbind: () => {},
  }
  let writeGate: Promise<void> | null = null
  harness.holdWrites = () => {
    writeGate = new Promise<void>((resolve) => {
      harness.releaseWrites = () => {
        writeGate = null
        resolve()
      }
    })
  }
  const gate = init.hold
    ? new Promise<void>((resolve) => {
        harness.release = resolve
      })
    : null
  let counter = 0
  harness.unbind = bindMiniAppUiTransport({
    url: (path) => path,
    request: async (path, init) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      const call = { method, path, body }
      harness.calls.push(call)
      if (method !== 'GET') harness.writes.push(call)
      if (method === 'GET' && gate) await gate
      if (method !== 'GET' && writeGate) await writeGate
      if (method === 'GET' && harness.failReads) return respond(500, { error: 'Backend is down.' })
      if (method !== 'GET' && harness.failWrites) return respond(409, { error: harness.failWrites })

      const [, route, itemId] = /^\/rpc\/[^/]+\/([^/?]+)(?:\/([^/?]+))?/.exec(path) ?? []
      const key = route === 'deals' ? 'deals' : route === 'activities' ? 'activities' : null
      if (route === 'summary') return respond(200, summarize(harness.deals, new Date()))
      if (!key) return respond(404, { error: 'No such route.' })
      const items = harness[key] as { id: string }[]
      if (method === 'POST') {
        const schema = key === 'deals' ? dealInputSchema : activityInputSchema
        const parsed = schema.safeParse(body)
        if (!parsed.success) return respond(400, { error: parsed.error.issues[0]!.message })
        const created =
          key === 'deals'
            ? {
                currency: 'USD',
                stage: 'lead',
                createdAt: new Date().toISOString(),
                ...parsed.data,
              }
            : { at: new Date().toISOString(), ...parsed.data }
        items.push({ ...created, id: `new-${(counter += 1)}` } as { id: string })
      } else if (method === 'PATCH') {
        const index = items.findIndex((item) => item.id === itemId)
        if (index < 0) return respond(404, { error: 'That item is gone.' })
        items[index] = { ...items[index]!, ...body }
      } else if (method === 'DELETE') {
        const index = items.findIndex((item) => item.id === itemId)
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
  act: (callback: () => unknown) => Promise<void>
  /** Let pending promises, timers and the polled reads settle. */
  settle: () => Promise<void>
  unmount: () => Promise<void>
}

/**
 * Mount a pattern against the fake backend. `render` builds the element lazily, so react-dom loads
 * after the DOM is registered: `mount(async () => { const { Board } = await import('./board'); … })`.
 */
export async function mount(
  render: () => Promise<ReactElement>,
  options: Parameters<typeof bindBackend>[0] & {} = {},
): Promise<Mounted> {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const backend = bindBackend(options)
  const element = await render()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  await act(async () => root.render(element))
  if (!options.hold) await settle()
  return {
    container,
    backend,
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
