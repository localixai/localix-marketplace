---
name: build
description:
  How to build or change a Localix mini app, simple or complex — data and collections, agent tools,
  screens, boards on a canvas, games with their own look, file editors and other places a mini app
  joins Localix, design and tests — with a working example for each kind of app. Load before writing
  or changing any part of a Localix mini app.
allowed-tools: Bash(mini-app:*) Bash(${CLAUDE_PLUGIN_ROOT}/bin/mini-app:*)
---

# Build a Localix mini app

A **mini app** is a Localix application: a backend `register(ctx)` that keeps state and gives the
chat agent tools, a screen the person works in, and a `guide.md` that tells the agent how to use
them. The agent in Localix's chat does the understanding (text, images, files); the app keeps the
state, shows it and acts. A mini app never has its own chat.

Everything named below is under `${CLAUDE_SKILL_DIR}`, and also prints from anywhere:
`mini-app doc <topic>` prints `references/<topic>.md`, `mini-app doc <example>` an example's README
and its files. Read a reference when the task needs it, and copy from an example rather than writing
a screen from nothing.

## Order of work

1. **Decide the model.** What the person keeps (collections and their relations), what belongs to
   one chat and what to the whole app, which tools the agent needs, which screens show it. Write
   `shared/model.ts` first: the schemas and the pure logic both sides share.
2. **Backend.** Collection specs, tools, routes in `backend/`; `register(ctx)` wires them and holds no
   state of its own.
3. **Screen.** Start from the example closest to the app and keep its layout, states and formatting.
4. **Guide, manifest, icon.** `guide.md` for the agent, the manifest's title, description and
   category, and the icon: `mini-app icon <folder> --glyph <lucide-name>` (the icon the screen
   uses, such as `chart-column`).
5. **Tests**, written from what the person and the agent do and are told.
6. **Check until green:** `mini-app check <folder>`; `mini-app test <folder> <file>` reruns one file.
   This plugin's hook reports what breaks Localix's rules after each edit: fix it at once.
7. **Install and look:** `mini-app install <folder>`, then open it (`Browser` on `mini-app:<name>`)
   and fix what looks wrong.

## What to read for the task

| The app needs | Read | Copy from |
| --- | --- | --- |
| Anything (start here for a new app) | `references/architecture.md` | the app itself (made by `mini-app create`) |
| Collections, relations, schema changes, routes, live data | `references/data.md` | `examples/tracker/` |
| Agent tools, guide, commands, context, decisions, waking the agent | `references/agent.md` | `examples/tracker/`, `examples/board/` |
| Screens, tabs, navigation, keyboard, states, long lists | `references/screens.md` | `examples/tracker/` |
| A list, table, detail pane, form, filters | `references/design-localix.md` | `examples/tracker/` |
| A board that belongs to one chat, drag and drop | `references/screens.md`, `references/data.md` | `examples/board/` |
| Numbers, charts, a dashboard | `references/design-localix.md` | `examples/dashboard/` |
| A canvas: nodes, links, camera, the agent steering it | `references/canvas.md` | `examples/canvas-board/` |
| A game, a learning app, media: its own look and motion | `references/design-own.md` | `examples/game/` |
| Joining Localix: file editors, tool cards, the composer, @-mentions, terminal, actions | `references/workspace.md` | `examples/workspace/` |
| Tests of any kind | `references/testing.md` | every example |
| Manifest, settings, commands, file associations, icon | `references/manifest.md` | every example |

Each example's `README.md` says what it shows and the order to read its files.

## Looking up the kit and the SDK

- `mini-app api <module>` prints a module's exports and props; `mini-app api <Name>` finds one
  export. Use it before writing a component or a call; never guess a prop.
- The app's `KIT.md` is the catalogue of what the kit has: search it for the job (`table`, `chart`,
  `dialog`), don't read it whole.
- Never search the disk for kit or SDK sources: `mini-app api` prints them.

## Rules

- Build what was asked, on real data, in one go: several kinds of items, views or forms are one app
  with several collections and screens, not a thinner one with the rest left for later. Take sensible
  defaults and name them at the end; ask only what no default answers.
- Work only inside the mini app's folder. Never edit `dist/`, `tsconfig.json` or `KIT.md`: the checks
  rewrite them.
- A mini app's backend runs unsandboxed inside Localix: keep each tool honest about what it changes.
- Before the app is shared, the `mini-app-reviewer` agent reviews it; it is never a gate on
  installing it.
