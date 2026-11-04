Read this when you build or change a screen: registration, layout, tabs, states, keyboard, data hooks, navigation and performance.

# Screens

## Contents

- Registering a screen
- Work items, the rail, status items
- The layout: the fill chain
- Reading and changing data
- Tabs and several views
- Forms and dialogs
- States
- Navigation between screens
- Keyboard ownership
- Lazy loading and performance

Controls and look come from `design-localix.md` (Localix look) or `design-own.md` (an app with its own character). Wiring to the rest of Localix is in `workspace.md`.

## Registering a screen

`ui/register.tsx` exports `registerUi`. For one screen:

```tsx
import { lazy } from 'react'
import { ListTodo } from 'lucide-react'
import { screenUi } from '@localixai/mini-app-sdk/ui/app'
import { LoadingHint } from '@localixai/kit/empty-hint'

const App = lazy(() => import('./App').then((m) => ({ default: m.App })))

export const registerUi = screenUi({
  app: APP,
  title: 'Meals',
  label: 'Meals — what you ate, kept by you and the agent',
  keywords: ['meals', 'calories'],
  Icon: ListTodo,
  Screen: App,
  loading: <LoadingHint>Opening Meals…</LoadingHint>,
  agentContext: { description, tools: [...], nextSteps: [...] }, // see agent.md
  scope: 'app', // or 'chat'
})
```

`screenUi` registers one restorable work item (`<app>:screen`) and its launcher in the workbench overflow menu. The screen receives `{ active, publishMessageContext }` (`ScreenProps`): pass `active` to the data hooks so a hidden tab does no work.

`scope: 'chat'` gives every chat its own tab, for a `'chat'` collection (`useWorkItemSessionId()` is the chat); `'app'` is one tab with no chat (`useWorkItemSessionId()` is `null`).

`registerUi` is a function of the host, so a larger app composes it:

```tsx
export function registerUi(host: MiniAppUiHost) {
  screenUi({ app: APP, /* … */ })(host)
  host.workItems.register({ kind: 'my-app:detail', Component: Detail, Icon: FileText, restorable: true, scope: 'session' })
}
```

`screenUi` registers once per host however often `registerUi(host)` is called (the template's test pins this); guard your own extra registrations with a `WeakSet` of hosts, as `kanban` does. Test it with `recordingMiniAppUiHost` (`testing.md`).

## Work items, the rail, status items

| Registration | What it adds |
| --- | --- |
| `host.workItems.register({ kind, Component, Icon, restorable?, scope?, placement?, agentContext?, toMessageBinding?, siblingGroupKey?, iconTint? })` | A tab kind. `kind` is `<app>:<name>`. `scope: 'session'` (default): the tab belongs to the chat that opened it, and `useWorkItemSessionId()` is that chat. `scope: 'global'`: visible in every chat, session `null`; only for a surface that reads no chat. `placement: 'aux'` for a side-panel surface, default `'editor'`. `Component` gets `{ item }` (and `visible`, `focused`, `resolvedTheme`) |
| `host.railViewlets.register({ kind, title, label, defaultArea: 'bar' \| 'overflow', Icon, keywords?, chordId?, toolCategory? })` | A rail button that opens the tab of that `kind` (and a palette command). `title` is a plain name ("Git"), not padded with "workspace" |
| `host.railSections.register({ id, title, Icon, Sidebar })` | A sidebar section in the rail, for an app with a navigation tree |
| `host.statusItems.register({ id, placement, useItem })` | A control in the titlebar, the composer or the status bar |

A status item is declared, not drawn: the host renders the control.

```tsx
host.statusItems.register({
  id: 'my-app:open',
  placement: 'statusbar', // 'titlebar' | 'composer' | 'statusbar'
  useItem: (sessionId) => {
    const count = useOpenCount(sessionId) // reads a shared store: no work per render, no private poll
    return count ? { label: 'Open items', Icon: ListTodo, text: String(count), tone: 'info' } : null
  },
})
```

`useItem` runs once per render of the bar for every app: return `null` when there is nothing to show; do not start a poll or fetch per render. `StatusItemState` also has `badge`, `active`, `busy`, `onClick` and `menu`.

A new open of a kind names its chat: `miniAppWorkspace.openWorkItem({ workKind, id, title, scope })`; `id` starts with `<app>:`.

## The layout: the fill chain

The screen fills its pane, may be 360 px wide, and reflows to its own width rather than the window's.

```tsx
<div className="@container flex h-full min-h-0 flex-col">
  <PanelHeader tone="content" title="Meals" summary="3 meals · 1,240 kcal" />
  {problem && <ProblemLine {...problem} />}
  <div className="min-h-0 flex-1 overflow-y-auto">
    <div className="flex flex-col gap-4 px-4 py-4 @2xl:px-6">…</div>
  </div>
</div>
```

- Root: `@container flex h-full min-h-0 flex-col`. Every flex ancestor of a scroller needs `min-h-0`; the header and toolbar stay, **one** element scrolls (`min-h-0 flex-1 overflow-y-auto`). A chain broken anywhere gives a page that scrolls the whole pane or a body that is cut off.
- Respond to the container, not the viewport: `@lg:` (side by side from about 32 rem), `@2xl:`. One column until `@lg`; reflow, never shrink text. A detail beside a list is a second column from `@lg`, a stacked view below.
- Fill the pane: no centred `max-w` column (the style gate refuses `mx-auto` with `max-w-*`; prose uses `max-w-(--reading-measure)`).
- A split with a resizable detail: `usePaneResize` and `WorkbenchSash` (`@localixai/kit/pane-resize`, `@localixai/kit/button`).
- A canvas or board inside the chain gets `flex-1 min-h-0`, with a `label` for accessibility.

## Reading and changing data

`useCollection` is the default for a collection:

```tsx
const meals = useCollection<Meal, MealInput>({ app: APP, name: 'meals', item: mealSchema, active, scope: 'app' })
// { items, loading, error, sending, add(input), update(id, patch), remove(id), refresh() }
```

`add`, `update` and `remove` resolve to the new list, or `null` when it failed (`error` says why). It hears the agent's writes through the store feed, so a change from either side shows on the other at once. Never keep a second copy of the list in `useState`; derive what you show with `useMemo` from `meals.items`, using the same shared function the tools use.

For any other route (a settings read, a summary, an action) `usePolledSnapshot`:

```tsx
const settings = usePolledSnapshot({
  path: `/rpc/${APP}/settings`,
  schema: settingsSchema,
  failureMessage: 'Could not read the settings.',
  intervalMs: null, // event-driven; a number polls, only while `active`
  active,
})
// { snapshot, error, loading, sending, send(body, { method, path }), refresh() }
```

`failureMessage` is required. A failed read keeps the last good snapshot. Reads and sends time out after 8 s (`timeoutMs`). For a snapshot that should refresh when the store changes use `useStoreSnapshot` (`data.md`). For time-derived values: `useNow(60_000, active)` from `ui/now`. Remember a choice (the last tab) with `loadJSON` / `saveJSON` from `ui/storage`, keyed with the app's name; never use it for state that must persist or be shared.

Polling: stop it when the tab is hidden. `useVisiblePolling({ intervalMs, onTick, enabled })` and `useWorkItemVisible()` (`ui/visibility`). Keep no timer when a feed covers the source.

## Tabs and several views

A `TabBar` at the top, the active view in `useState`, each view its own file in `ui/parts/` taking the collections' state as props:

```tsx
const [view, setView] = useState<'list' | 'chart'>(() => loadJSON<'list' | 'chart'>(`${APP}.view`) ?? 'list')
<TabBar
  aria-label="Views"
  active={view}
  items={[{ id: 'list', label: 'List' }, { id: 'chart', label: 'Chart' }]}
  onChange={(next) => { setView(next); saveJSON(`${APP}.view`, next) }}
/>
```

`TabItem` takes `id`, `label`, `icon`, `badge`, `disabled`. For two to five exclusive modes inside a view (a range, unified/split) use `SegmentedRadioGroup` (`@localixai/mini-app-sdk/ui/segmented-control`). A section sidebar is `SidebarNav`.

## Forms and dialogs

A dialog form: `Dialog`, `DialogContent size="md"`, `DialogHeader`, `DialogTitle`, `DialogBody`, `DialogFooter` (`@localixai/kit/dialog`); each control inside `Field label error` (`@localixai/kit/field`). Validate with the **same shared input schema** (`safeParse`) and put each issue's message on its field. Keep the dialog open until `add`/`update` resolves to a list (`null`: show the error). A destructive action asks first with `ConfirmDialog` (`open`, `onClose`, `onConfirm`, `variant="destructive"`). A dialog, menu or the options of a `Select` draw into `document.body`, outside the screen's container (this matters in tests). Full form: `examples/tracker/`.

## States

| State | Show |
| --- | --- |
| Loading | `LoadingHint` (one line) or `Skeleton` that reserves the real geometry |
| Sending | controls disabled while a change is in flight (`meals.sending`) |
| Empty | `StateNotice` with an icon, title and a body that says what to say or attach **in the chat** |
| No match (a filter or search) | a quiet line with a "Clear filters" action; not the empty state |
| A failed read, items still shown | `ProblemLine` from `useScreenProblem` |
| A failed read, nothing to show | `StateNotice` or `ProblemState` with the one recovery action |
| A refusal of an action (409) | a line with `text-status-error` and `role="alert"` beside the action; state unchanged |
| Done / copied / nothing to undo | `ActionFeedback` beside the control, or `toast.success` / `toast.warning` from `@localixai/mini-app-sdk/ui` |

```tsx
const problem = useScreenProblem({ app: APP, subject: 'Meals', failure: meals.error, showingData: meals.items.length > 0 })
{problem && <ProblemLine {...problem} />}
```

`ProblemLine` is for the report `useScreenProblem` or `useProblemReport` makes; a missing external program is a `Prerequisite` (see `workspace.md`). Never show sample or placeholder data: every number comes from the shared logic over real items.

## Navigation between screens

- Another tab of your app: `miniAppWorkspace.openWorkItem({ workKind: 'my-app:detail', id: 'my-app:detail:42', title, scope: sessionId })`; the id starts with the owner's name and a colon.
- A file, a diff, a preview: `miniAppWorkspace.openFile / openDiff / openPreview` with `sessionId` (see `workspace.md`).
- A link the agent or another surface can follow: register an anchor for a `localix://resource/<provider>/…` URI (`host.anchors.register({ id, namespaces, resolve })`) that resolves to `{ kind: 'work-item', workKind, id, title }`; the same URI works in chat, search and `@`-mentions. Build URIs with `localixResourceUri(provider, segments)`.
- An external address: `ExternalAnchor` (`@localixai/kit/external-anchor`) or `miniAppExternal.open(url)`; never a bare `<a target="_blank">`.
- A screen opened from a link takes its target from the item's `payload` and re-reads it; it treats the owner's "not found" as gone and never keeps showing the last copy.

## Keyboard ownership

Controls and native editors get a key before workspace shortcuts: handle a key in `onKeyDown` and call `preventDefault()` when you handle it. For commands across a pane, one entry per pane:

```tsx
const root = useRef<HTMLDivElement>(null)
const id = useId()
useFocusEntry({
  id: `my-app:${id}`,
  kind: 'surface',
  active,
  scope: () => root.current,
  onKeyDown: (event) => {
    if (!hasSelection || !matchesChord(event, 'escape')) return
    event.preventDefault()
    clearSelection()
    return true // claimed
  },
})
return <div ref={root}>…</div>
```

`useFocusEntry` is from `@localixai/mini-app-sdk/ui/focus`, `matchesChord` from `@localixai/kit/keybindings` (exact, platform-aware modifiers; never `ctrlKey || metaKey`).

- A scoped command yields to controls: leave typing and caret keys to editable descendants, and return `true` only when the pane claims the key.
- `kind`: `surface` (plain keys and chords stay available to the workspace), `text-input` / `editor` (plain keys blocked), `dialog` / `menu` / `overlay` (all blocked). Kit dialogs and menus isolate their own scope.
- Skip IME composition. Do not install listeners on `window` or `document`.
- A shortcut is also a button or menu item: the keyboard and the tests need the same action by another route. Show keys with `Kbd`/`ChordHint`.

## Lazy loading and performance

- `ui/register.tsx` lazy-loads `App` so a tab nobody opened costs nothing. Lazy-load a heavy view or library the same way: `const Chart = lazy(…)` inside `<Suspense fallback={<LoadingHint />}>`, or `await import('./comment-action')` inside a handler. Do not use top-level `await` in a mini app.
- Long lists: cap with the collection's `limit`; page with `useInfiniteScroll(onReach, enabled)` (`ui/visibility`) or `TableGrid`'s `onReachEnd`; key rows by `id`, not by index; derive sorted/filtered arrays with `useMemo`; build `Intl` formatters once at module level, never per row; keep per-row state out of the parent. A board draws `onlyRenderVisibleElements`. A diff uses `VirtualDiff`.
- Work only while visible: pass `active` to data hooks, stop polling and animation frames when hidden, and never poll when a feed is live.
- A selection, a scroll position and an unsaved draft stay local to the window; do not write them to the store.
- Avoid inline object props that change every render on memoised children, and avoid effects that set state from props: compute during render.
