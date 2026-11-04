Read this when you decide what the app stores: collections, schemas, relations, routes of your own, JSON state, live updates and watched files.

# Data

## Contents

- Collections
- Input schemas: no `.default()`
- Relations and cascades
- Stored data outlives the code
- Own routes
- State that is not a list: `openJsonStore`
- Per-chat data
- Live updates
- Watching files

## Collections

A collection is a list of things (meals, deals, moves). Declare it once; `createMiniApp` turns the spec into the store, the routes, the feed that updates an open screen and the search index.

```ts
// shared/model.ts
export const mealInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the meal.').max(200),
  kcal: z.number().nonnegative(),
  at: z.iso.datetime({ offset: true }).optional(),
})
export const mealSchema = z.object({
  id: z.string(),
  name: z.string(),
  kcal: z.number(),
  at: z.string(), // ISO 8601, UTC
})

// backend/meals.ts
export const mealsSpec = defineCollection({
  name: 'meals',
  item: mealSchema,
  input: mealInputSchema,
  create: (input, { id, now }) => ({
    id,
    name: input.name,
    kcal: input.kcal,
    at: new Date(input.at ?? now).toISOString(),
  }),
  scope: 'app',
  limit: 5000,
  search: (meal) => meal.name,
})

// backend/index.ts
export function register(ctx: MiniAppContext) {
  const app = createMiniApp(ctx)
  const meals = app.collection(mealsSpec)
  return app.registration({ tools: createTools(ctx, meals), routes })
}
```

| Spec field | Meaning |
| --- | --- |
| `name` | Lower-kebab; the file `<name>.json`, the route `/rpc/<app>/<name>` and the index name |
| `item` | The stored item (`id` plus the app's fields) |
| `input` | A `z.object` of what a person or the agent sends to add one; a change sends any part of it |
| `create(input, { id, now })` | Makes the item: the business rule of adding, and the one place defaults are filled |
| `scope` | `'app'` (default) or `'chat'`; see below |
| `limit` | Keeps only the newest N items; default 1000 |
| `search(item)` | The text the embedding model indexes so items are found by meaning. `app` scope only; empty until the model is on this computer |

What `app.registration` mounts: `GET` and `POST /rpc/<app>/<collection>`, `PATCH` and `DELETE /rpc/<app>/<collection>/:id`, each answering `{ items }` (the whole list). It also adds the feed that updates an open screen the moment a tool writes. `routes` (a `new Hono<MiniAppRouteContext>()`) adds routes beside them; `backend` adds subsystem fields (`resourceProvider`, `searchProvider`, `contextProviders`, `wsFrames`, `onShutdown`).

In code, a collection offers:

| Call | Answers |
| --- | --- |
| `await c.list(where?)` | every item, oldest first |
| `await c.get(id, where?)` | the item or `null` |
| `await c.add(input, where?)` | the new item |
| `await c.update(id, patch, where?)` | the item or `null` when the id is unknown |
| `await c.remove(id, where?)` | `false` when the id is unknown |
| `await c.search(text, { limit })` | items nearest in meaning |

`where` is `{ sessionId }` for a `'chat'` collection: a tool passes `context.session.id`, a route `c.env.sessionId`.

Rules for the values:

- A moment is an ISO time in UTC (`toISOString()`); sort with `Date.parse`, never as text across offsets. A date without a time is a `'YYYY-MM-DD'` string.
- Ids come from the collection. Do not invent them.
- Compute totals and groupings with a function in `shared/`, never in the screen only.

## Input schemas: no `.default()`

A change sends only the fields it names (`Partial` of the input). A `.default()` on the input schema fills the missing fields on every change, so moving a deal reset its amount, and an older Localix applies the default to every change. Make the field optional and fill the default in `create`:

```ts
// wrong: a PATCH { stage: 'won' } would reset amount to 0
amount: z.number().default(0)
// right: optional in the input, defaulted where the item is made
amount: z.number().optional()   // create: amount: input.amount ?? 0
```

A `.default()` on the **item** schema is allowed and is how a field is added later (next section).

The agent's tool takes the same input schema with `.describe()` added per field (see `agent.md`), so the agent is shown the limits the collection keeps.

## Relations and cascades

- An item refers to another by its **id** (`categoryId`), never by name: names change and differ in case.
- A tool may take the name the person said and resolve it to the id, case-insensitively; a find tool answers with ids.
- A tool that takes a reference checks it with `get(id)` and answers `isError` when it is missing.
- The collection's own `DELETE` removes one item and nothing else. Removing an item others refer to goes through a tool and a route of your own that updates or removes the dependants, or refuses while they exist. The screen calls that route, not the collection's. Give it a path of its own (`/companies/:id/with-applications`, `/categories/:id/remove`): one that repeats the collection's (`DELETE /companies/:id`) is never reached, because the collection's routes are mounted first. `examples/tracker/` does this with one function the route and the tool share.

```ts
// backend/routes.ts
const validated = routeValidator({ envelope: 'nested' })

export const createRoutes = (categories: Categories, transactions: Transactions) =>
  new Hono<MiniAppRouteContext>().post(
    '/categories/:id/remove',
    validated('json', z.object({ moveTo: z.string().optional() })),
    async (c) => {
      const id = c.req.param('id')
      const used = (await transactions.list()).filter((t) => t.categoryId === id)
      const { moveTo } = c.req.valid('json')
      if (used.length && !moveTo) {
        return jsonError(c, 409, 'in_use', `Move its ${used.length} transactions first.`)
      }
      for (const t of used) await transactions.update(t.id, { categoryId: moveTo })
      await categories.remove(id)
      return c.json({ items: await categories.list() })
    },
  )
```

`jsonError(c, status, code, message, detail?)` answers `{ error: { code, message, detail } }`; on the screen `unwrapMiniAppResponse` throws an error whose message is that sentence.

## Stored data outlives the code

The person's file stays on disk through every update. A collection file (or JSON store) read with a schema it no longer fits **reads as empty**, and the next write replaces it: the data is gone. So when the app already has data:

- a field you add is `.optional()`, or has `.default()` on the item schema;
- migrate on read when the shape changes: accept the old shape in the schema and map it (`z.union`, `z.preprocess`) before it reaches the rest of the code;
- never rename a stored field, make an existing field required, or narrow its type;
- to retire a field, stop writing it; leave it optional.

Test it: write a file in the old shape into the data folder and assert the list still has the items (see `testing.md`).

## Own routes

Anything that is not add/change/remove of one item (an import, an action, a settings read) is a route of your own, declared at its own path and called under `/rpc/<app>/`:

```ts
const validated = routeValidator() // envelope 'nested' is the default

export const routes = new Hono<MiniAppRouteContext>()
  .get('/settings', (c) => c.json({ goal: Number(ctx.config.DAILY_GOAL ?? 2000) || 2000 }))
  .post('/import', validated('json', importSchema), async (c) => {
    const { rows } = c.req.valid('json')
    return c.json({ added: rows.length })
  })
```

| Envelope | A rejected body answers | Read by |
| --- | --- | --- |
| `nested` (default) | `{ error: { code, message, detail } }` | `unwrapMiniAppResponse` of the SDK client |
| `flat` | `{ error, code, detail }` | clients that branch on `code` |
| `text` | `{ error }`, one sentence naming every field | clients that read `error` as the message |

`jsonBody(schema)` is the shorthand for a body on the nested envelope. Handlers read the scope from `c.env`: `userId`, `projectId`, `cwd` and the optional `sessionId`. Host context variables such as `c.get('userId')` are not forwarded. A route that belongs to a chat refuses when `sessionId` is absent.

From the screen:

```ts
import { postMiniAppJson, unwrapMiniAppResponse } from '@localixai/mini-app-sdk/ui/transport'

const answer = unwrapMiniAppResponse<{ added: number }>(
  await postMiniAppJson(`/rpc/${APP}/import`, { rows }),
)
```

Send a batch in one request, never one per row. For a read, use `usePolledSnapshot` (see `screens.md`). A refusal shows in a line with `text-status-error` and `role="alert"` beside the action; keep the state as it was.

A file the person has (a CSV, a statement) goes to the chat: the agent reads it and calls an import tool whose input is the rows as structured items (an array with a bounded length). The app validates each, stores the batch and answers how many were added and which were refused, by row.

## State that is not a list: `openJsonStore`

For a document, settings the app owns or any one-object state:

```ts
const store = openJsonStore({
  dir: ctx.dataDir,
  file: 'draft.json',
  schema: draftSchema,
  initial: { title: '', blocks: [] },
})
const draft = await store.read()
await store.update((current) => ({ ...current, title: 'Plan' }))
```

`update` runs one change at a time for every caller in the process (the queue is module-level, keyed by the file), writes a sibling file and renames it over the old one, and validates the result. A missing, unreadable or invalid file reads as `initial` and never throws: the same no-data-loss rule as above applies to its schema.

Settings the **person** changes are `config` in the manifest (see `manifest.md`), not a store.

## Per-chat data

`scope: 'chat'` on the collection keeps one list per chat under that chat's folder; the host deletes it with the chat. Outside a collection:

```ts
const dir = await ctx.sessionStorage!.resolveDataDir(userId, sessionId) // route: c.env.sessionId; tool: context.session.id
const store = openJsonStore({ dir, file: 'board.json', schema, initial })
```

`resolveDataDir` checks that the user owns the session and rejects one that is gone. `ctx.sessionStorage.listDataDirs?.()` lists every chat folder the app has, for cleanup that spans chats.

## Live updates

| Source | Use | Healthy behaviour |
| --- | --- | --- |
| A collection | nothing: `app.registration` and `useCollection` wire the feed | the screen re-reads when a tool writes |
| An `openJsonStore` file | `createJsonStoreFeed` in the backend, `useStoreSnapshot` on the screen | reads on a nudge; no timer |
| Project files | `useFileResourceSync` / `useMiniAppWorkspaceChanges` | reads on file notices |
| Anything else live | a `wsFrames` entry and `createRealtimeFeed` | typed frames, resubscribes on reconnect |

Backend, for a JSON store you opened yourself:

```ts
const feed = createJsonStoreFeed({
  miniApp: ctx.miniAppName,
  resolveDir: (userId, sessionId) =>
    sessionId ? ctx.sessionStorage!.resolveDataDir(userId, sessionId) : Promise.resolve(ctx.dataDir),
  watchPath: ctx.watchPath,
})
return app.registration({ tools, backend: { wsFrames: feed.wsFrames, onShutdown: feed.onShutdown } })
```

Screen:

```ts
const board = useStoreSnapshot({
  miniApp: APP,
  sessionId,
  path: `/rpc/${APP}/board?sessionId=${sessionId}`,
  schema: boardSchema,
  intervalMs: null,
  failureMessage: 'Could not read the board.',
  active,
})
```

`intervalMs` is the fallback cadence while the feed is not live; `null` disables it. `backstopMs` is the cadence with live coverage, default `null`. The nudge names the app and chat, never the state, so the screen re-reads through its route. After a reconnect it reads once.

A stream of your own (frames that carry data, such as the agent's camera moves or ticks):

```ts
// backend: register in app.registration({ backend: { wsFrames } })
const frames: WsFrameContribution[] = [{
  subscribeCommand: 'board:board.subscribe',
  unsubscribeCommand: 'board:board.unsubscribe',
  frameTag: 'b',                       // one letter; 's', 'r', 'n' are the core's
  key: (params) => String(params.sessionId),
  start(params, send, { userId }) {    // userId is the socket's, never from params
    return subscribeToBoard(userId, String(params.sessionId), (event) => send(JSON.stringify(event)))
  },
  stop(release) { (release as () => void)() },
}]

// ui: created once, at module level
export const boardFeed = createRealtimeFeed<string, BoardEvent>({
  tag: 'b',
  subscribe: (sessionId) => ({ t: 'board:board.subscribe', sessionId }),
  unsubscribe: (sessionId) => ({ t: 'board:board.unsubscribe', sessionId }),
  decode: (json) => JSON.parse(json) as BoardEvent,
  route: (event) => event.sessionId,
})
// in a component
const live = useRealtimeFeed(boardFeed, sessionId, { frame: (event) => apply(event) })
```

The feed shares one subscription per key, resubscribes after a reconnect (frames in the gap are lost, so re-read in `reconnect`) and reports `live`. Keep a fallback poll while it is not live. Keep a timer while it is live only for a source the stream cannot cover (metrics with no push API). Never accept a path or a user id from the command payload.

Two feeds, two jobs:

| | Store feed (`createStoreChangeFeed`, collections) | `ctx.host.changes` |
| --- | --- | --- |
| Listens | open screens | backend consumers (an index, a digest, a cleanup) |
| Covers | committed writes and external file edits | notices the app records; the core's deletions (`followCoreDeletions`) |
| Missed while away | nothing kept; the screen re-reads on reconnect | kept; a consumer catches up at its cursor |

`host.changes.record({ entity, op: 'upserted' | 'deleted' | 'resync', ref })` and `host.changes.subscribe(consumer, handler)` exist on the boot-time load only. Store the agent's stable `agentId`, never its name, and clean up with `followCoreDeletions`.

## Watching files

A backend that reacts to files changing (logs it tails, a folder another program writes) uses the host's watcher:

```ts
const stop = ctx.watchPath?.(dir, true, (name) => reread(name), () => reread(null)) // onError: events may be lost; re-read once
```

It exists on the boot-time load only. Keep the release for `onShutdown`, and keep a slow backstop poll for loads without it. Push the change to open screens with a feed above.

A screen that mirrors the disk subscribes instead of polling:

```ts
useMiniAppWorkspaceChanges(sessionId, (change) => reload(change.paths), { windowMs: 500 })
// paths: absolute changed entries; null = too many to list, re-read everything you show
const sync = useFileResourceSync({
  sessionId, prefix: '.localix/my-app', enabled: visible,
  read: (signal) => api.list(sessionId, signal),
  apply: setSaved,
  onError: setReadError,
})
```

`useFileResourceSync` coordinates reads, rejects stale answers and polls only while the watcher is unavailable. `read` must honour its abort signal and have a timeout. Keep draft state out of an unconditional `apply`.
