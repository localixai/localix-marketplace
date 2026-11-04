Read this when the app should reach beyond its own tab: a tool card in the transcript, a strip above the composer, file editors, @-mentions, terminals, links, drag into chat, or when you need to look at the app running.

# Workspace integration points

## Contents

- The catalogue
- Tool cards
- Session surfaces: `composer.header` and others
- Content actions and comment actions
- File editors, formats and associations
- File tree decorations, editor enhancers, diff slots
- Resource providers, search and anchors
- Text input completion
- Terminal, files, diffs, previews and links
- Drag into chat and links in
- Toasts, problems and prerequisites
- Looking at the app: the `Browser` tool
- The Mac app

Every registration is in `ui/register.tsx` (`host.<registry>.register(…)`) or in the backend's `backend` field. Ids are `<app>:<name>`. A registration disappears when the app is disabled. `examples/workspace/` shows several together.

## The catalogue

| Point | Registration | Adds | Real app |
| --- | --- | --- | --- |
| Tool card | `host.toolCards.register` | how the app's tool reads in the transcript, optionally its own card | kanban |
| Composer header | `host.sessionSurfaces.register({ surface: 'composer.header' })` | a strip above the composer | kanban |
| Other session surfaces | `chat.background`, `composer.context`, `composer.footer`, `breadcrumb.trailing` | a component per chat | git-workspace (`chat.background`) |
| Content action | `host.actions?.register` | a button on chat content (code, image, table…) | project-space |
| Comment action | `host.commentActions.register` | a button beside **Send** on review comments | kanban |
| File editor | `host.fileEditors.register` + `fileFormats` + manifest `fileAssociations` | a viewer/editor for a file type | documents, devops, database |
| File icon | `host.fileIcons.register(name, { body })` | an icon for an exact file name | devops |
| File tree decoration | `host.fileTreeDecorations.register` | per-path badges in the file tree | git-workspace |
| Editor enhancer | `host.fileEditorEnhancers.register` | extra chrome inside the file editor | git-workspace |
| Diff slot | `host.workItemSlots.register({ slot })` | a component in a host-laid-out diff | git-workspace |
| @-mention | `backend.resourceProvider` + `host.anchors` + `host.resourceRefIcons` | the app's items in the composer's `@` menu and drag | kanban, code-graph |
| Search | `backend.searchProvider` + `host.search` | results in global search | kanban, devops |
| Prompt context | `backend.contextProviders` | text added to a prompt for an attached resource | code-graph, reader |
| Text completion | `backend.textInputCompletionSurfaces` + `useMiniAppTextInputCompletion` | ghost text in the app's own field | git-workspace |
| Terminal | `miniAppTerminal.spawnCommand / paste / openJob / openPanel` | a command in the chat's terminal | devops |
| Open file/diff/preview | `miniAppWorkspace.openFile / openDiff / openPreview` | a host tab | git-workspace, reader |
| External link | `ExternalAnchor`, `miniAppExternal.open` | a link out, with the host's confirmation | project-space, reader |
| Drag into chat | `setMessageBindingDrag` | a draggable item the composer takes | reader |
| Status item | `host.statusItems.register` | titlebar/composer/status-bar control (`screens.md`) | git-workspace, documents |

## Tool cards

Name a tool your backend registers. The first owner of a name wins; a disabled app falls back to the generic card.

```tsx
host.toolCards.register({
  tool: 'kanban',
  presentation: { label: 'Updated', noun: 'board tasks', verb: 'Updating', Icon: SquareKanban, stackable: true },
  Component: KanbanCard, // optional: ({ item }) => the card
})
```

Build the card from `@localixai/kit/tool-card` (`ToolLine`, `ToolBody`, `IORow`, `OutputBlock`, `ErrorRow`, `ToolSectionLabel`, `hasItemError`, `isItemStreaming`) so it reads like every built-in card: sections `In` (what the call was given), `Out` (what came back), `Error`; `prose` on `OutputBlock` for natural language, code and JSON stay monospace. Parse the persisted result defensively: it was written by whatever build ran the call, so every field is optional.

## Session surfaces: `composer.header` and others

```tsx
host.sessionSurfaces.register({ surface: 'composer.header', Component: ComposerHeader })
// Component receives { sessionId, context } — for composer.header, context is { isFocused }
```

| Surface | Mounted | Context |
| --- | --- | --- |
| `composer.header` | a strip above the composer | `{ isFocused }` |
| `composer.footer` | status rows under the composer | `{ isFocused, hasInteraction }` |
| `composer.context` | named in the SDK; its position and context are not documented | unverified |
| `breadcrumb.trailing` | named in the SDK; its position and context are not documented | unverified |
| `chat.background` | render-null, for the life of the chat | `{ focused }` |

Every contribution to a surface renders, and every warm composer renders it: hold a live subscription only while `isFocused`, render `null` when there is nothing to show, and act for the `sessionId` you are given (there is no other). A background poller belongs on `chat.background`, not on a rail viewlet's `Mount`, which knows no chat.

## Content actions and comment actions

```tsx
host.actions?.register({
  id: 'my-app:save-code',
  label: 'Save code',
  title: 'Save this code to my app',
  Icon: Save,
  when: ({ surface, target }) => surface === 'chat.content' && target.kind === 'code', // sync, no I/O
  subscribe: (context, onChange) => store.subscribe(onChange), // when eligibility depends on live state
  run: async ({ sessionId, target }) => { await save(sessionId, target); return { message: 'Saved' } },
})
```

`actions` is optional on older hosts, hence `?.`. `target.kind` is `image`, `markdown` (with `block`), `visualization`, `code`, `file`, `link` or `table`. `when` runs often and again before `run`: keep it cheap, share reads. The owning `sessionId` comes with the target; never substitute the active chat. Throw to report a failure; a returned `{ message }` is shown.

```tsx
host.commentActions.register({
  id: 'kanban:task', label: 'Task', title: 'Create a board task from these comments', Icon: SquareKanban,
  run: async (batch) => (await import('./comment-action')).addCommentsToBoard(batch), // { sessionId, title, summary, files }
})
```

Comments clear only after `run` resolves.

## File editors, formats and associations

Three layers, used together for a file type the app owns:

```tsx
host.fileFormats.register({ pdf: { contentType: 'application/pdf', viewer: 'pdf', openExternally: true } })
host.fileEditors.register({
  id: 'documents:pdf', label: 'PDF viewer',
  match: (path) => path.toLowerCase().endsWith('.pdf'),
  Component: PdfEditorBody,   // props: { sessionId, path, line?, mediaId?, publishMessageContext?, … }
  acceptsMedia: true,         // a dropped upload with no path routes by name, via its media id
  preferred: true,            // opens here; other editors stay under "Open with…"
})
host.fileIcons.register('dockerfile', { body: '<path d="…"/>' }) // trusted SVG, exact file name
```

and in `mini-app.json`: `"fileAssociations": [{ "ext": ["pdf"], "name": "PDF Document", "role": "Viewer", "rank": "Alternate" }]` (see `manifest.md`). Declare every kind the UI opens: when someone opens a file nothing they have opens, the Store offers the app. Rank `None` opens without being offered. Read a file with `miniAppFiles.read(sessionId, path)`; `miniAppFiles.announceReloaded(paths)` exists to tell the host paths changed under it (its effect is unverified). Open a path in the app's editor from its own tab with `miniAppWorkspace.openFile({ sessionId, path, line })`.

## File tree decorations, editor enhancers, diff slots

```tsx
host.fileTreeDecorations.register({ id: 'git-workspace:file-tree', useIndex: useGitFileTreeDecorations })
host.fileEditorEnhancers.register({ id: 'git-workspace:history', match: () => true, Component: GitFileEnhancer })
host.workItemSlots.register({ slot: 'diff.interactive', Component: InteractiveDiffSlot })
```

`useIndex(sessionId)` returns `{ decorationFor(path), directoryHasDecorations(path) }`, indexed once per session: do no work per render. A slot is a named hole in a host surface (`diff.interactive`, `diff.provenance`); the host owns the vocabulary, an unknown slot renders nothing and the first contribution wins.

## Resource providers, search and anchors

A resource is addressable by a `localix://resource/<provider>/…` URI. A provider lets the composer's `@` menu browse and attach the app's items, and drag them in; an anchor opens one.

```ts
// backend: app.registration({ backend: { resourceProvider, searchProvider } })
const resourceProvider: ResourceRefProvider = {
  provider: 'kanban',
  title: 'Board',
  async listChildren(userId, parentUri, query, scope) {   // scope.sessionId: the chat it is asked from
    return tasks.map((t) => ({ uri: taskUri(scope!.sessionId!, t.id), label: t.title, detail: t.status, hasChildren: false, icon: 'kanban' }))
  },
  async expand(userId, uri) {                              // the text the model gets for the attachment
    return { ok: true, content: describeTask(uri) }
  },
}
const searchProvider: SearchProvider = {
  id: 'kanban:tasks', title: 'Tasks', tier: 'eager', icon: 'kanban',
  async search(userId, query) { return hits },             // MUST resolve: [] or { hits, problem }
}
```

```tsx
// ui: how the URI opens, what the search domain is called, which glyph a node gets
host.anchors.register({
  id: 'kanban:board-anchor', namespaces: ['kanban'], icons: { kanban: SquareKanban },
  resolve: (uri) => parseUri(uri) ? { kind: 'work-item', workKind: BOARD_KIND, id: BOARD_KIND, title: 'Board' } : null,
})
host.search.register({ id: 'kanban:tasks', scope: { label: 'Tasks', prefix: 'task', icon: 'kanban' }, icons: { kanban: SquareKanban } })
host.resourceRefIcons.register({ kanban: SquareKanban })
```

A provider is asked from several chats at once: resolve the root from the chat in `scope`, never from the load-time directory (`ctx.host.workspaceScope.resolveSessionRoot(userId, sessionId)`). `expand` answers `{ ok: false, error }` for a URI that is gone. A search provider is `lazy` when it shells out or needs a live connection, and reports `{ hits, problem }` when its results are incomplete (a stopped daemon is not "no matches"). To add the attached resource to the prompt with a budget, wrap the provider with `createResourceContextProvider` (`agent.md`). `ResourceContextButton` (`@localixai/kit/resource-context-button`) is the screen-side "ask about this".

## Text input completion

Ghost-text completion in a field the app owns, such as a commit message. Backend: a surface with a namespaced id and the context it needs; UI: the hook around the field.

```ts
// backend: app.registration({ backend: { textInputCompletionSurfaces: [commitSurface] } })
const commitSurface: MiniAppTextInputCompletionSurface = {
  id: 'git-workspace.commit',           // <app>.<field>
  resolveContext: async (request) => contextFor(request.payload),
  actionable: (payload, context) => Boolean(context),
  buildFragment: (payload, context) => `Draft so far: ${payload.draft}\n${context}`,
  instruction: () => 'Continue the commit message. Answer with the continuation only.',
  clean: (raw) => raw.trim(),
}
```

```tsx
const completion = useMiniAppTextInputCompletion({
  surface: 'git-workspace.commit', sessionId, value, setValue, payload: { draft: value },
  contextKey, enabled, active, focused, caretAtEnd,
})
// completion.suggestion, accept('word' | 'line' | 'all'), dismiss(), request(), handleKeyDown(event)
```

Render the suggestion with `InlineCompletionGhost` (`@localixai/kit/inline-completion-ghost`) and forward `onKeyDown` to `completion.handleKeyDown`.

## Terminal, files, diffs, previews and links

```ts
await miniAppTerminal.spawnCommand({ command: 'docker logs -f web', sessionId, title: 'web logs' }) // → { terminalId }
miniAppTerminal.paste({ command, sessionId })        // typed for review, not run
miniAppTerminal.openJob({ sessionId, terminalId }); miniAppTerminal.openPanel(sessionId)
miniAppWorkspace.openFile({ sessionId, path, line })
miniAppWorkspace.openDiff({ sessionId, path, diff, title })   // diff: a unified diff string
await miniAppWorkspace.openPreview({ sessionId, path })       // not exercised by any marketplace app
miniAppExternal.open(url)       // the conversation's Browser; pass true as 2nd arg for the system browser (OAuth)
```

`spawnCommand` runs in the chat's terminal under the person's permissions: the command is the person's click, never something built from model text without showing it. Also on `ui/runtime`: `miniAppFiles` (`pickFiles`, `read`, `download`, `saveBlob`, `watchWorkspace`), `miniAppClipboard.writeText`, `miniAppSecrets`, `miniAppSessions`, `miniAppProjects`.

## Drag into chat and links in

Out: a draggable item the composer takes as an attachment.

```tsx
<div draggable onDragStart={(event) => {
  const binding = resourceMessageBindingDraft({ uri, label }, 'drag')
  setMessageBindingDrag(event.dataTransfer, binding, { previewLabel: label, plainText: binding.target.token })
}}>
```

In: `readMessageBindingDrag` (`ui/message-binding-drag`) reads a dropped app link; `linksInText` (`@localixai/kit/context-links`) finds links in pasted text; `ContextBindingPreview` (from `@localixai/mini-app-sdk/ui`) draws a link the host knows (a file, a session, a message). A drop or a pasted `@session:…` / `localix://…` is the same link.

## Toasts, problems and prerequisites

- `toast.success|info|warning|error(…)` from `@localixai/mini-app-sdk/ui` for a notice; `ActionFeedback` for a short answer beside the control; a failure is never `toast.info`.
- A failure of a read is a problem, not a sentence: `useProblemReport(report, { scope })` (call it unconditionally in the component that owns the failure, with `null` when healthy) returns props for `ProblemLine` (a surface that still shows something) or `ProblemState` (the failure is the whole pane). Put engine output in `Problem.detail`, never in the headline.
- A missing or stopped external program is a `Prerequisite` (`@localixai/mini-app-sdk/prerequisite`): `missing` (an `installUrl`, HTTPS), `stopped` or `signed-out` (a single-line `command` pasted into the chat's terminal). Backend: `isMissingExecutable(err)`, `resolveExecutable(name)`, `env: toolEnv()` for spawned tools, `defineTypedError(…, { prerequisite })`. UI: `prerequisiteProblem(prerequisite, { code, detail, request })` and `usePrerequisiteRecovery(prerequisite)`. Recovery does not retry for the person: retry after, then clear the report. Real use: devops (Docker), git-workspace.

## Looking at the app: the `Browser` tool

Inside Localix, the agent drives the app's own tab with the `Browser` tool and `url: "mini-app:<name>"`: `open` records the target, then `snapshot` (the panel's tree), `take_screenshot`, `steps` (click, type, press; selectors stay inside the panel) and `console` (the app's uncaught errors, console calls and render crashes). `evaluate` and `viewport` are refused. A session view belongs to its chat's workspace: when the person is in another chat the command is refused with that reason, and the app's tools are the way to read its state. It drives native UI only, not a sandboxed `views` HTML page. After `mini-app install` the app is swapped in place, so look again. Do each thing the person will do, fix what does not look or work right, check and install again; without the `Browser` tool say that visual checks were not run.

## The Mac app

A mini app with a rail viewlet can run as its own Mac app (Dock icon, window, one project of its own); the person chooses it (**Install _Name_ as App** on its tab, rail button or in the command palette). Nothing becomes an app on its own, and it needs the app's `icon` and a rail viewlet (`screenUi` provides one). Design for it: the main screen works beside the conversation, **New chat** gives a new game or an empty board, and a chat-scoped app suits it. Nothing in the code differs.
