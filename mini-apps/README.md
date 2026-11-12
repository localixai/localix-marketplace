# Mini apps

The source of Localix's first-party mini apps. A mini app is Localix's own format, not a Claude Code
plugin: one `.localix-mini-app/mini-app.json` (identity, category, backend, settings, commands), a
`guide.md` the
agent reads with `MiniAppGuide` before it first uses the app, a native backend (`backend/`) and
screens (`ui/`). It holds no `skills/`, `.claude-plugin/` or hooks; see
[plugins and mini apps](https://github.com/rsaryev/localix-studio/blob/main/docs/internals/plugins-and-mini-apps.md).

Localix ships none of them.
[`.localix-mini-app/marketplace.json`](../.localix-mini-app/marketplace.json) lists them, in the
shape of [`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json): each app's
`source` is its folder here. A tag `v*` of this repository releases them as one signed marketplace,
`mini-app-marketplace.json` (`bun run pack`, which runs `mini-app marketplace build`), which Localix
trusts: they install from its Store (**Mini apps**) as `<app>@localix`, like any other. The
marketplace's curation, which Localix takes from this marketplace alone, is on each app's entry:
`featured` (Discover's carousel), `installByDefault` (installed on its own on a new installation)
and `suggestFor` (file names such as `*.sql` or `compose.yaml`, where `*` stands for any characters,
and packages a project depends on, such as `pg`, so Localix suggests the app when one of them is
open or in the project); `collections` are Discover's rows. A collection item that names no app here
fails `mini-app marketplace validate --curation`. Each app's guide for people
using it is in its `docs/` folder; [games](../docs/games.md) and the [recipes](../docs/recipes/)
span several.

## Workbenches

| Mini app                        | Product surface                                               |
| ------------------------------- | ------------------------------------------------------------- |
| [Code Graph](code-graph/)       | Project files, symbols, imports, calls, and graph queries.    |
| [Database](database/)           | SQL and data-source connections, schemas, and queries.        |
| [DevOps](devops/)               | Docker and Kubernetes inspection and operations.              |
| [Documents](documents/)         | Extraction, generation, viewers, tables, and charts.          |
| [Learning Studio](learning/)    | File-authored courses, lessons, assessment, and progress.     |
| [Project Space](project-space/) | Shared notes and live file cards on a canvas.                 |
| [Reader](reader/)               | Local books and documents with annotations and agent context. |
| [Resumes](resume/)              | Resume fields, templates, preview, and document export.       |
| [Trading](trading/)             | Public market data; no order placement.                       |

## Workflow and integration mini apps

| Mini app              | Product surface                                        |
| --------------------- | ------------------------------------------------------ |
| [API Client](api/)    | HTTP requests, collections, and environments.          |
| [Git](git-workspace/) | Source control, diffs, branches, and forge operations. |
| [Kanban](kanban/)     | A passive task board per chat.                         |

## Games

| Mini app                                    | Product surface                                    |
| ------------------------------------------- | -------------------------------------------------- |
| [2048](game-2048/)                          | A board controlled by the user or agent in a chat. |
| [Battleship](battleship/)                   | Fleet placement, shots, and agent-opponent play.   |
| [Checkers](checkers/)                       | Legal moves and agent-opponent play.               |
| [Chess](chess/)                             | Legal moves and agent-opponent play.               |
| [Rock Paper Scissors](rock-paper-scissors/) | Sealed moves against the agent, checked by digest. |
| [Snake](snake/)                             | A per-chat board steered by the user or a model.   |
| [Tic-Tac-Toe](tic-tac-toe/)                 | A per-chat board and agent-opponent play.          |

## Runtime model

Contributor references:

- [Database architecture](database/ARCHITECTURE.md) defines driver and workbench ownership.

A mini app's backend (`register(ctx)`) gives the agent tools over Localix's APIs and serves routes,
services, lifecycle hooks and channels. Its native workbench UI is built by the app into an
artifact; it may also contribute sandboxed HTML views, prompt sections, agent definitions, file
associations, settings, and commands with argument pickers. A guide too long for one read links
pages under `guide/`, which `MiniAppGuide` reads by name.

## Trust boundary

Native mini app code runs in the Localix API process. A third-party mini app must be explicitly
enabled before it runs. Declarative content still receives validation, path containment, size
limits, and surface-specific restrictions.

Sandboxed HTML views use an opaque-origin iframe and acquire a host-injected, offline
`acquireLocalixApi()` client over the versioned mini app UI message bridge. Native React workbench
UI runs in the host page, so like native backend code it loads for a third-party mini app only after
the user enabled it. A view can call only its owning native backend's explicitly declared
`uiActions`; the host binds mini app, project, session, view, user, and cwd context and brokers the
JSON request without granting iframe network access.

Mini app permissions do not form an operating-system sandbox. Review a mini app's manifest and
source before enabling code you do not trust.

## Contributor workflow

A mini app a person asks for is not one of these: the
[mini-app-authoring plugin](../plugins/mini-app-authoring/README.md) forks its
[template](../plugins/mini-app-authoring/template/) into the person's folder, builds and tests it
there, and installs it into Localix.

To add one here, create it with `mini-app create <name>` inside `mini-apps/`, then check it from the
repository root:

```bash
bun run check kanban       # mini-app check for one app: manifest, style, builds, types, tests
bun test mini-apps/kanban  # its tests alone
```

`bun run check` with no name checks the plugins and every mini app, as CI does. The
[mini app SDK](https://github.com/rsaryev/localix-studio/blob/main/packages/mini-app-sdk/README.md) owns
the typed host contracts.

## Source of truth

- [Manifest contract](https://github.com/rsaryev/localix-studio/blob/main/packages/mini-app-sdk/src/manifest/app.ts)
- [Installed artifact trust](https://github.com/rsaryev/localix-studio/blob/main/apps/api/src/features/ext/trust.ts)
- [Mini app SDK entry points](https://github.com/rsaryev/localix-studio/blob/main/packages/mini-app-sdk/README.md)
