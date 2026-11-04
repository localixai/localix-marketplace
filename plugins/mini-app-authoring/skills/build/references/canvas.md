Read this when the app draws a board, whiteboard, graph or diagram, or lets the agent move the camera or edit the board.

# Canvas boards

## Contents

- One board, the host's
- Navigate or edit
- Provider, camera and placement
- Nodes and edges
- Layout libraries
- Capture and reduced motion
- The agent drives the camera
- The agent edits the board

`@localixai/kit/canvas` is the one board every graph in Localix is drawn on (the code map, the database diagram, Project Space). The host owns the camera, so every board pans, zooms and answers the keyboard the same way. Start from `examples/canvas-board/`; the real apps are `project-space` (a whiteboard) and `code-graph` (a navigable map).

**Never bundle or import `@xyflow/react`.** A second copy is a second store the host's nodes cannot reach. Take `Canvas`, `Node`, `Edge`, `Handle`, `Position`, `NodeResizer`, `NodeToolbar` and the camera from the kit. Third-party layout libraries are fine and are bundled: `code-graph` adds `dagre` to its `package.json` (`bun add dagre`) and lays out in `ui/model/layout.ts`.

## Navigate or edit

| `interaction` | Drag does | Nodes |
| --- | --- | --- |
| `navigate` | pans the board | nothing moves; click to act (a map, a diagram you read) |
| `edit` | selects; Space + drag or the middle button pans | nodes move and connect (a whiteboard) |

| Input | Result |
| --- | --- |
| Scroll, two fingers | Pan |
| Pinch, ⌘/Ctrl + scroll | Zoom toward the pointer |
| `+` / `−`, the controls | Step through 10–250%; the percentage returns to 100% |
| Shift+1 / Shift+2 / Shift+0 | Fit everything / fit the selection / 100% |
| Arrow keys, Shift + arrows | Pan by a small / a large step |

`keyboardHelp(interaction)` gives these keys as text for a shortcuts sheet of your own. Add keys of your own with `onBoardKey` (return `true` when you handled the key).

## Provider, camera and placement

Wrap the board and everything that drives its camera in `CanvasProvider`:

```tsx
export function GraphCanvas(props: Props) {
  return (
    <CanvasProvider>
      <Board {...props} />
    </CanvasProvider>
  )
}

function Board({ view }: Props) {
  const camera = useCanvasCamera()
  const { nodes, edges } = useMemo(() => toFlow(view), [view])
  const placing = useCameraPlacement(layoutKey(view), (size) => {
    camera.set(openingViewport(view, size))        // runs once per content key
  })
  return (
    <Canvas
      label="Code map. Click a folder to open it"  // the accessible name; required
      interaction="navigate"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      hidden={placing}                             // no flash at the wrong place
      onNodeClick={(_event, node) => open(node.id)}
    />
  )
}
```

| Camera call (`useCanvasCamera()`) | Does |
| --- | --- |
| `fit({ duration?, maxZoom?, nodes? })` | frame everything or the named nodes |
| `focus(rect, { duration?, padding? })`, `focusNode(id, …)` | frame a board rectangle or a node (`focusNode` answers `false` for an unknown id) |
| `set(viewport, { duration? })`, `get()` | the viewport `{ x, y, zoom }` |
| `zoom(±1)`, `actualSize()`, `panBy(dx, dy)`, `fitSelection()` | the key moves |
| `size()` | `{ width, height }` of the view, or `null` before it is laid out |
| `toBoard(clientX, clientY)` | screen point to board point (for a drop) |

`useCameraPlacement(key, place)` places the camera **once per content key**, so a poll or a re-render never moves it; return a cleanup from `place` to cancel a pending animation. Key it on what identifies the content (the level, the board), not on the data. A board that re-fits on every poll is the bug it exists to prevent.

## Nodes and edges

- Define `nodeTypes` and `edgeTypes` at module level so their identity is stable.
- A node is `{ id, type, position, width, height, data, draggable, selectable, parentId?, extent?, zIndex }`. A group is a parent node with children (`parentId`, `extent: 'parent'`).
- An edge without a `type` is drawn by `CanvasEdge`, themed from its `data`, so the kit and the host theme paint it:

```ts
{
  id: `${source}->${target}`, source, target,
  data: {
    emphasis: 'idle' | 'focus' | 'dimmed',  // dim the rest while one connection is traced
    tone: 'neutral' | 'info' | 'warning',   // a cycle is the warning tone at rest
    weight: edgeWeight(count),              // a line's width is how many relations it stands for
    arrow: 'always' | 'focus' | 'never',
    label: '3',
    route: 'bezier' | 'step' | 'straight',
  },
}
```

(`CanvasEdgeData` also has `stroke`, `startCap`/`endCap`, `labelAt`, `fromSide`/`toSide`, `float`.) An edge label is marked `data-canvas-edge-label` with its `data-emphasis`, so a board can hide labels when zoomed out and keep the focused one (`useZoomBelow`).

- Custom nodes use `Handle` and `Position` from the kit and kit controls and tokens inside; `NodeResizer`/`NodeToolbar` for resizable nodes.
- `onlyRenderVisibleElements` for large boards; compute `nodes` and `edges` with `useMemo`; a context menu at the pointer is `CoordinateMenu` (`@localixai/kit/coordinate-menu`).
- Unsaved drafts and selection stay local; positions the person set are saved through your collection/store.

## Layout libraries

Compute positions in a pure function (`ui/model/layout.ts`, or `shared/` when the backend needs it) and memoise it on a **layout key** built from the inputs that change the layout, not from the whole view:

```ts
const key = layoutKey(view)
const layout = useMemo(() => layoutView(view), [key]) // eslint-disable-line react-hooks/exhaustive-deps
```

`dagre` ranks every node globally, so lay out per level or per group, not one giant compound graph. Heavy layout belongs lazily loaded or off the render path.

## Capture and reduced motion

- `captureBoard(frame, { x, y, width, height }, { maxEdge?, padding?, prepare? })` renders one board rectangle as a PNG `Blob`, whatever the camera shows; `prepare` returns a cleanup (draw the state for the copy, then undo it). Save with `miniAppFiles.saveBlob(name, blob)` or copy with `platformCapabilities().clipboard.writeBlob(blob, 'image/png')` (`@localixai/kit/platform`) and say what happened with a toast.
- With reduced motion set on the system, every camera move of the kit lands at once. For any camera move you animate yourself, ask `prefersReducedMotion()` (`@localixai/kit/platform`) and jump instead. Durations come from `CAMERA_MOTION` (`fit`, `focus`, `pan`, `step`), not literals.

## The agent drives the camera

The camera is the person's screen, not the board file, so a move is never an operation on the board (no undo, nothing written). `project-space` and `code-graph` build it the same way:

1. **Shared types** (`shared/camera.ts`): a move names where to LOOK, never pixels the backend cannot see:
   `CameraMove = { kind: 'frame'; rect; zoom?; subject?: 'one' | 'many'; spotlight?: string[] } | { kind: 'zoom'; zoom } | { kind: 'pan'; x; y }` (pan as a fraction of the view), `CameraCommand = { seq, move }`, `CameraReport = { seq, viewport, size }`. Restate the kit's zoom limits as data (the backend cannot import the UI).
2. **A hub in the backend** (module scope, per chat): `send(sessionId, move)` stamps a `seq` and delivers to followers; `follow(sessionId, deliver)` replays the last move only if it is fresher than about 15 s (a board opened tomorrow must not jump to where the agent looked today); `report` resolves the tool's wait.
3. **Push on the socket**: a `wsFrames` entry for the chat (`data.md`), so the tab follows a move the moment it is sent. No held-open HTTP request, no poll.
4. **One tool for everything the camera does** (`<app>_view`): `focus` ids, `area` rect, `fit`, `zoom`, `pan`. `classify: () => ({ effect: 'view' })`: it writes no file. It sends the move, then waits briefly (about 2.5 s; about 6 s when the tab is still opening) for the tab's report, and **answers with what the view now shows**: the rectangle, the zoom, a roster of the elements in it. That is far cheaper than a screenshot; the screenshot stays for when the picture matters. When no tab is listening, say so.
5. **The tab applies and reports** (`useAgentCamera`): inside `CanvasProvider`, follow the feed, skip a `seq` already applied and a move older than the TTL, apply it with `camera.focus/set`, then POST the report (the viewport, the size, what is in view). Only the **visible** tab applies and reports (`useWorkItemVisible()`, `!document.hidden`): a hidden background tab would let the agent mistake it for the person's view. Report when something happened (a move applied, a tool asked) plus a slow backstop only while the stream is down; never a timer POST every second.
6. **Reduced motion**: `prefersReducedMotion()` makes the move a jump (`duration: 0`).
7. What the agent points at can glow for a moment (`spotlight`), so the person sees it.

## The agent edits the board

- One tool applies a **batch of operations** (`{ op: 'create', type: 'note', id, near, in, text }`, `{ op: 'update', id, … }`, `{ op: 'delete', id }`, `{ op: 'connect', from, to, label }`, as `project-space` does; `near` places a new element beside another so the agent never computes coordinates) to the board's store; it answers one result per operation (`{ ok: true, id } | { ok: false, error }`) so a partly accepted batch is reported honestly, and the agent can retry only what failed. The same function applies an operation from the screen and from the tool, so the board and the agent never disagree (`shared/ops/`).
- Ids are stable and chosen by the caller where possible, so a retried call that already landed answers "already present", not a duplicate.
- Reads: a describe function in `shared/` turns the board into text with ids (the roster), used by the read tool, by `useAgentContext` and by the resource provider's `expand`. References to files are project-relative so the board survives a clone elsewhere.
- Writes go through one store that serialises them and announces them (`openJsonStore` or the project file with `useFileResourceSync`); an open board re-reads on the nudge and **settles** an answer that says the same thing as the current state, so a poll never resets the camera or a drag.
- Undo/redo belongs to the screen's operation log, not the camera.
- Tool effect: `session` for chat-owned boards, `files` for a board file in the project (declare `permissionPaths`).
