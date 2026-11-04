Read this first when you design a mini app: what it is, who does what, and where each kind of code goes.

# Architecture

## Contents

- A mini app and the chat beside it
- The parts and where code goes
- `register(ctx)` runs many times
- Scopes: app, chat, project
- Pick the shape
- Order of work
- What the toolchain allows you to import

## A mini app and the chat beside it

A mini app is never used alone. Next to its screen is the chat with the agent: you, when you build it, and the same agent when the person uses it. The agent reads photos, screenshots, PDFs and files the person attaches, understands free text in any language, knows the world and calls every enabled mini app's tools.

So the work divides:

| The agent (the chat) | The mini app |
| --- | --- |
| Understands: reads the image, the file, the sentence | Keeps the state |
| Fills a tool's structured input | Validates it, stores it, sums it |
| Judges, plans, explains | Shows the state, with controls for what the person does by hand |
| Calls the tools | Gives the agent a tool for everything the screen can do |

A meal photo becomes `log_meal({ items: [{ name, grams, kcal, protein, fat, carbs }] })`. The app has no upload, vision, OCR, parser or API key. Never stop to ask how the app should reach a model or an image: you are that model when you build it, and the chat agent is when it runs.

**Never build an own chat, an own message box that talks to a model, or own model calls for conversation.** Conversation happens in the Localix chat. The screen's way to talk to the agent is to put text in the composer or hand the agent a moment (see `agent.md`). Its empty state tells the person what to say or attach in the chat ("attach a photo of your meal and ask to log it").

A mini app is not a Claude Code plugin; the two share nothing. Never put `.claude-plugin/`, `skills/` or hooks in a mini app, and never put `.localix-mini-app/` in a plugin. A folder with both loads nothing.

**Trust:** the backend runs unsandboxed in the Localix API process and an installed app starts enabled. Keep every tool honest about what it changes (see `agent.md`).

## The parts and where code goes

```text
my-app/
  .localix-mini-app/mini-app.json   manifest (see manifest.md)
  guide.md                          what the agent reads before it first uses the app
  icon.svg
  package.json                      only when an npm dependency is needed
  shared/model.ts                   schemas and pure logic both sides import
  backend/index.ts                  register(ctx)
  backend/<items>.ts                one defineCollection per kind of item
  backend/tools.ts                  the agent's tools
  backend/routes.ts                 own routes, when collections are not enough
  ui/register.tsx                   screenUi({ … }) and other registrations
  ui/App.tsx, ui/parts/…            the screen
  *.test.ts, *.dom.test.tsx         beside the code they test
```

| Code | Goes in | Rule |
| --- | --- | --- |
| Schemas, derived figures, what the agent is told, formatting of values | `shared/` | Pure functions: no storage, network, React or Hono. The screen and the tools call the same function, so the person and the agent see one answer. Write it first. |
| What is stored and how an item is made | `backend/<items>.ts` | `defineCollection`. Defaults go in `create`. |
| What the agent can do | `backend/tools.ts` | One tool per thing the person can do. |
| An action that is not add/change/remove of one item | `backend/routes.ts` | A Hono router; the screen calls it under `/rpc/<app>/`. |
| Wiring | `backend/index.ts` | `createMiniApp(ctx)`, collections, `app.registration({ tools, routes, backend })`. Nothing else. |
| How it looks | `ui/` | Kit controls and host tokens (see `design-localix.md`, `design-own.md`). |
| When to call which tool, what to tell the person | `guide.md` | See `agent.md`. |
| Reaching the rest of Localix | `ui/register.tsx` | See `workspace.md`. |

No file over 300 lines. Name each file after what it holds (`backend/transactions.ts`, `ui/parts/BudgetList.tsx`).

Every contributed id is namespaced `<name>:` (`my-app:screen`); tool names are `<snake>_…` and unique across mini apps.

## `register(ctx)` runs many times

The host calls `register(ctx)` once for the boot-time backend (routes, feeds, providers) and again for each run's tools, and reuses the module. Consequences:

- **Nothing a person creates lives in a variable.** It lives in a collection (`defineCollection`), `openJsonStore`, or a file under `ctx.dataDir` or the chat's folder.
- **Process-wide coordination may live at module scope**, keyed by what it belongs to (`project-space`'s per-chat hub of camera moves, the JSON-store write queue). It is rebuilt on restart, so it must never be the only copy of anything.
- **Host services exist on one load only.** `ctx.host` is present on the boot-time backend load and absent on a run's load; `ctx.sessionStorage`, `ctx.agents` and `ctx.decisions` are on both. A singleton that needs `ctx.host` keeps the one it was given (`workspaceScope = ctx.host?.workspaceScope ?? workspaceScope`, as `project-space` does).
- Do not call `Bun.spawnSync`, `execSync` or a synchronous read: the backend runs inside Localix and a sync call freezes every request. Use `Bun.spawn` with `readProcessOutputWithTimeout`.
- Files that change under the app are watched with `ctx.watchPath`, never `node:fs.watch`.

## Scopes: app, chat, project

| Scope | Data lives | Collection | Screen | The chat id comes from |
| --- | --- | --- | --- | --- |
| **App** | `ctx.dataDir`, one set for the app, across chats | `scope: 'app'` (default) | `screenUi({ scope: 'app' })` (default): one tab, `useWorkItemSessionId()` is `null` | not needed |
| **Chat** | One folder per chat, deleted with the chat and the sessions beneath it | `scope: 'chat'` | `screenUi({ scope: 'chat' })`: every chat gets its own tab | route: `c.env.sessionId` (set only after the host checked the user owns it); tool: `context.session.id`; screen: `useWorkItemSessionId()` |
| **Project** | Files in the project folder, e.g. `<root>/.localix/<app>/…`, so they travel with the repository | none: read and write files with your own store | a session screen, with a stable path reference per project | `ctx.host.workspaceScope.resolveSessionRoot(userId, sessionId)` gives the root |

Use **chat** scope for a game, a draft, a board for one conversation. Use **app** scope for a personal list. Use **project** scope when the data describes a repository (a code map, a whiteboard of the project).

Details that matter:

- A chat-scoped surface sends the chat in every request. `useWorkItemSessionId()` is the tab's own chat; the SDK has no "active session". A route called without a verified chat answers 400 ("Open this in a chat."): refuse before touching any data.
- Every open names its chat: `miniAppWorkspace.openWorkItem({ …, scope })`, `openFile({ sessionId })`, `composer.insert({ sessionId })`. The host refuses a session tab that names none.
- A tool opens a chat's tab by putting the session in the URI it offers (`ctx.ui.offer`).
- Folder of the installed app (project or personal) is a different "scope": a personal app sees every project; on a name collision the personal one wins. Nothing in the code depends on it.
- A per-chat directory outside a collection: `await ctx.sessionStorage.resolveDataDir(userId, sessionId)`; it rejects a session that no longer exists rather than recreating it.

## Pick the shape

Take the closest example under `examples/` and change its domain; keep its structure, states and test.

| The app is… | Start from |
| --- | --- |
| A list the person and the agent keep: items, a form, a table, a detail pane | `examples/tracker/` |
| One board per chat with columns, drag and drop and agent moves that show live | `examples/board/` |
| A summary of numbers with charts | `examples/dashboard/` |
| A whiteboard or graph on the kit canvas, the agent moving the camera | `examples/canvas-board/` |
| A turn game against the agent, with its own look | `examples/game/` |
| Files, tool cards, the composer, terminals, resource pickers | `examples/workspace/` |

**Default:** one collection per kind of item, tools that mirror the screen, one screen. **Escape hatch:** when state is not a list (a document, a graph, a live feed), keep it in `openJsonStore` or files and add your own routes and `wsFrames`; the tools and the screen still call the same shared functions.

An app with no screen at all (`"surfaces": ["agent"]`) is just tools, a guide and a backend. Use it when the agent is the only user.

## Order of work

1. Decide: kinds of items and their fields, how they refer to each other (by id), one tool per thing the person does, the views, the defaults.
2. `shared/model.ts` (schemas, pure logic for every view).
3. Backend: collections, routes, tools, `guide.md`.
4. Each view, one file per view in `ui/parts/`.
5. Tests for what the person and the agent do.
6. `mini-app check`, fix everything it reports in one pass, `mini-app install`, then look at it with the `Browser` tool on `mini-app:<name>` (see `workspace.md`).

Do it yourself, in one turn: a subagent started before `shared/model.ts` exists works against a contract that is not there. Make choices that have a sensible default and name them at the end; ask only what no default can answer. Build everything that was asked, on real data: several kinds of items, views, tables and forms are one app with several collections and views, never a thinner one with the rest left for later.

## What the toolchain allows you to import

| Side | May import |
| --- | --- |
| Backend | `hono`, `zod`, `@localixai/mini-app-sdk/backend`, `node:*`, `bun:*`, your own files; tests also `@localixai/mini-app-sdk/backend/testing` |
| `shared/` | `zod` and pure code; nothing from `backend/` or `ui/` |
| Screen | `react`, `zod`, `lucide-react`, `@localixai/mini-app-sdk/ui*`, `@localixai/kit/<id>`, your own files; tests also `@localixai/mini-app-sdk/ui/testing`, `@localixai/kit/testing`, `react-dom/client`, react's `act` |
| Any other npm package | `bun add <pkg>` in the app folder; it is bundled into the backend or the UI artifact (code-graph bundles `dagre`, trading bundles `lightweight-charts`) |

React, the SDK and the kit come from the running Localix, so the app never ships a second copy. Never import `@xyflow/react` (use `@localixai/kit/canvas`), `@hono/zod-validator` or `hono/validator` (use `routeValidator`), or an `@/…` path. Look up any module with `mini-app api <module>`; do not search the disk for SDK or kit sources.
