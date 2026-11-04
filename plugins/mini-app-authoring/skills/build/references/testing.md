Read this when you write or fix the tests of a mini app: the backend, the shared logic, the screen and its registration.

# Testing a mini app

## Contents

- What to test
- Commands
- Backend: tools and routes
- Shared logic
- The screen
- Registration
- Rules

`mini-app check` fails an app that has no test; `mini-app test` runs them (Bun Test). The template ships the shape of each kind; copy it and change the domain. Write the test first: a feature as what a person does and sees, a bug as the failing case.

## What to test

| Layer | File | Proves |
| --- | --- | --- |
| Backend | `backend/index.test.ts` | what the agent's tools and the screen's routes do on one store, and what each tells back |
| Shared | `shared/*.test.ts` | pure rules: validation, scoring, ranking, formatting |
| Screen | `ui/App.dom.test.tsx` | what the person sees and the request a click sends |
| Registration | `ui/register.test.tsx` | the screen registers once per host, with the right kind, title and area |

One test per thing a person or the agent does, asserting what they are told back. A test that restates a constant or reads source as text is deleted.

## Commands

```bash
mini-app test                       # the app's tests
bun test backend/index.test.ts      # one file
mini-app check                      # types, style gate, tests present, manifest
```

## Backend: tools and routes

`@localixai/mini-app-sdk/backend/testing` gives a real context on a temp directory (`await using` disposes it).

```ts
import { callTool, fakeSemantic, requestRoute, testMiniAppContext } from '@localixai/mini-app-sdk/backend/testing'

test('what the agent adds is on the screen', async () => {
  await using ctx = await testMiniAppContext({ name: 'template' })
  const app = register(ctx)

  const added = await callTool(app, 'template_add_item', { title: 'Buy milk' })
  expect(added).toEqual({ text: expect.stringContaining('Added "Buy milk".'), isError: false })

  const screen = await requestRoute(app, 'POST', '/items', { title: 'Call the dentist' })
  expect((screen.json as { items: unknown[] }).items).toHaveLength(2)
})
```

| Helper | Does |
| --- | --- |
| `testMiniAppContext({ name, host? })` | a context; `host` overrides services such as `semantic` |
| `callTool(app, name, input)` | `{ text, isError }`, as the agent would receive it |
| `requestRoute(app, method, path, body?)` | `{ status, json }`, as the screen's request |
| `fakeSemantic()` | a search service; `semantic.ready = true` when the index is ready |

Cover for every tool: the happy path and its message, an unknown id (`isError: true`, nothing changed), a change that keeps fields it does not name, and the **limits the schema advertises** (`tool.inputSchema.safeParse` accepts and refuses what the description promises). For semantic search test both the not-ready and the ready answer.

## Shared logic

Plain functions, no context: a table of cases. Test the edge that a tool and a screen both depend on (an empty list, a boundary date, a tie).

## The screen

`@localixai/kit/testing` `registerDom()` installs a DOM; `bindMiniAppUiTestDoubles()` replaces the host's UI services; `bindMiniAppUiTransport({ url, request })` plays the backend.

```tsx
beforeAll(() => {
  teardown = registerDom()
  unbindDoubles = bindMiniAppUiTestDoubles()
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

function backend(initial: Item[]) {
  let items = initial
  const sent: { method: string; path: string; body?: unknown }[] = []
  const unbind = bindMiniAppUiTransport({
    url: (path) => path,
    request: async (path, init) => {
      const method = init?.method ?? 'GET'
      if (method !== 'GET') sent.push({ method, path, body: init?.body ? JSON.parse(init.body as string) : undefined })
      // update `items` for POST / PATCH / DELETE here
      return Response.json({ items }) // useCollection expects { items } after every call
    },
  })
  return { sent, unbind }
}
```

Render with `createRoot` inside `act`, import `App` dynamically after the doubles are bound, and unmount in `finally`. Assert:

- what is on screen (`container.textContent`, `querySelectorAll('li')`) and its order;
- **the request**: `server.sent` equals `[{ method: 'POST', path: '/rpc/<app>/items', body }]`;
- **the agent's view**: collect `publishMessageContext` calls and check the text in `bindings[0].target.attributes.content`;
- the empty state and its pointer to the chat.

To type into a field set the value through the prototype setter and dispatch `input`, then `requestSubmit()` on the form, all inside `act`. Dialogs, menus and `Select` options draw into `document.body`, not into your container: query `document.body`.

## Registration

```tsx
const { host, registrations } = recordingMiniAppUiHost()
registerUi(host)
registerUi(host) // the host calls again; it must not duplicate
expect(registrations.workItems).toHaveLength(1)
expect(registrations.workItems[0]).toMatchObject({ kind: 'template:screen', restorable: true, scope: 'global' })
```

Assert `workItems`, `railViewlets` and any other registry you use (`statusItems`, `toolCards`, …), then a second host to prove registration is per host.

## Rules

- Unit tests never sleep or read the wall clock: pass the clock, delay or window in as an option.
- A test stands alone and passes in any order; the context and DOM are per test or per file, never shared state.
- Test files are `*.test.ts` (backend, shared), `*.dom.test.tsx` (screen), `register.test.tsx`; they live beside the code.
- Test files are exempt from the style gate and from the 300-line source limit; keep them readable anyway.
- Tests that need a real process or network are not part of the app's tests.
