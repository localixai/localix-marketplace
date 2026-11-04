Read this when you give the agent its tools and guide, tell it what the screen shows, wake it from the screen, or let the app make a small judgment itself.

# The agent side

## Contents

- Tools
- What a tool answers
- Permissions and effects
- `guide.md`
- Commands
- Telling the agent what the screen shows
- Handing the agent a moment: `askAgent`
- Putting text in the composer
- Silent judgments: `decide` and meaning
- Hooks and context providers
- No own chat

## Tools

One tool per thing the person can do on the screen, so the agent can do everything the person can. Name them `<snake>_<verb>` (`meal_log_add`, `budget_set_limit`), unique across mini apps.

```ts
export function createTools(ctx: MiniAppContext, meals: Meals) {
  return [
    ctx.defineTool({
      name: 'meal_log_add',
      label: 'Log a meal',
      activeVerb: 'Logging',
      description: 'Log one dish: its name and estimated kcal. Answers with today’s total.',
      // The shared input schema with descriptions added: never a looser copy.
      inputSchema: mealInputSchema.extend({
        name: mealInputSchema.shape.name.describe('The dish, as the person would name it.'),
        kcal: mealInputSchema.shape.kcal.describe('Estimated kcal for the portion shown.'),
      }),
      executionMode: 'sequential',
      mutates: true,
      classify: () => ({ effect: 'host' }),
      permissionPaths: () => [],
      async execute(_toolCallId, input) {
        const meal = await meals.add(input)
        return { content: `Logged ${meal.name}: ${meal.kcal} kcal.\n${describeDay(await meals.list())}` }
      },
    }),
  ]
}
```

| Field | Rule |
| --- | --- |
| `name`, `label`, `activeVerb` | `<snake>_<verb>`; a short label; the verb shown while it runs ("Logging") |
| `description` | What it does and what it answers. When to use it belongs in `guide.md` |
| `inputSchema` | The shared schema with `.describe()` per field, so the agent sees the limits the collection keeps. Build it with `ctx.z` or the shared `zod` |
| `executionMode` | `'sequential'` for a write, `'parallel'` for a read. A writer that declares nothing runs as sequential |
| `mutates` | `true` for a write |
| `execute(toolCallId, input, signal, onUpdate, context)` | `context.session.id` is the chat; `context.session.agent` is `{ agentId, name }`, the speaker the host bound |
| `behaviorHints` | `{ idempotentHint: false }` when the same input changes state each time (a list of moves); otherwise the host's repeat guard stops the run on the eighth identical call |

Give the agent a read tool (`…_list` with ids) and a find tool (`…_find`, by meaning, see below) beside the writes.

A tool with several actions (`action: 'move' | 'resign'`) keeps the callable surface compact: use one tool with an `action` field and `classifyByAction({ move: { effect: 'session' }, view: { effect: 'read' } })`. `classifyByAction` on an input with no `action` field calls every use `external`.

Who acted comes from `ctx.agents.list(userId, sessionId)` or `context.session.agent`, never from model or client input. Store the agent's `agentId`, not its name.

## What a tool answers

Answer with **what changed and where things stand** (today's total, what is left), so the agent can tell the person in one line.

| Case | Report |
| --- | --- |
| The input was wrong and nothing happened | `{ content, isError: true }` |
| An id is unknown | `isError` with where to find ids ("Read meal_log_list for the ids.") |
| A batch whose later step is refused after earlier steps changed state | Success: what the earlier steps did, then which step was not run and why |
| A step the model could not predict (a random tile, a sunk ship) | Skip it or stop the batch there; do not fail the call |
| Control passes to someone else mid-batch (a new game the person opened) | Stop the batch and report success |
| A lookup that finds nothing | A plain answer, not an error |
| The screen shows the result already (a move on a board) | Return `terminate: true` so the agent's turn ends |

`isError` shows in the transcript as a failed call; keep it for a call that did nothing because the model got it wrong. Writes that depend on each other stay sequential. A tool that produced something to look at offers it with `ctx.ui.offer({ uri, label })` as `details`; the agent gives the person that link.

## Permissions and effects

`classify` says where a call's effect lands, so a session that refuses network effects still allows a board card.

| `effect` | For |
| --- | --- |
| `read` | observes; changes nothing |
| `view` | ephemeral UI: a camera move, a chart drawing |
| `session` | state owned by this chat and deleted with it: a board card, a game move |
| `files` | files on disk (declare them in `permissionPaths`) |
| `host` | the app's own durable data beyond one chat |
| `external` | a process, the network, a message, money; also the answer for an unknown call |

Add `irreversible: true` for a delete. A tool that declares neither `classify` nor `mutates` is `external`. `permissionPaths: () => []` for a tool that touches no files; a tool that writes files returns the paths it may write, widest when unsure. Secrets go through the vault (`ctx.host.resolveSecret`), never `config` defaults; no network call the guide does not mention. Use `safeFetch`/`resolveExecutable` + `toolEnv()` for outbound work.

## `guide.md`

The prompt lists each enabled app in one line (its manifest `description`) and marks it when it has a guide; the agent reads the guide with `MiniAppGuide` before it first uses the app. A tool's description says what it does; the guide says **when** to use it and **what to tell the person**.

```markdown
_Use: Keep the person's meals and answer what they ate. Use when they send a meal photo, say what
they ate, or ask about totals; not for recipes or nutrition advice._

# Log a meal

- A photo or a sentence: read it, then call `meal_log_add` once per dish with a short `name` and
  your best `kcal`. Estimate from the portion; do not ask unless nothing is visible.
- A correction ("that was two eggs"): find the id with `meal_log_list`, then `meal_log_update`.

Each tool answers with today's total. Tell the person what changed in one line, not the list.

# Answer about the day

While the Meals tab is open the person's message carries what it shows. Answer from it; call
`meal_log_list` when nothing is attached.
```

Rules:

- The first line is `_Use: … Use when …; not for …_`: the trigger and the exclusion.
- Name every tool, say what to extract for each, and what to tell the person after. One name per thing across the screen, the tools and the guide.
- Say what the agent must not do (never remove an item the person did not name).
- Long material goes in pages under `guide/<page>.md`; the guide links them.
- Name no tool that does not exist. Tests may check the guide against the registered tool names.

## Commands

A command is a macro the person picks from the slash menu: `/<app>:<command>`. Declare it in `mini-app.json` (see `manifest.md`) with a `prompt` that names the tool, and pickers for its arguments:

```json
"commands": {
  "log": {
    "description": "Log a meal",
    "prompt": "Log this meal with meal_log_add: $ARGUMENTS",
    "argumentHint": "<what you ate>",
    "featured": true,
    "activateTools": ["meal_log_add"]
  }
}
```

Use a command for a recurring request the person types often ("plan my week", "adapt this lesson"); a picker (`type: 'choice'`) for a bounded choice. `activateTools` switches on up to eight deferred tools while it runs.

## Telling the agent what the screen shows

While a tab is open, the person's next message carries what the screen shows, so "this one" means something. Two parts:

```tsx
// ui/App.tsx: the content, from the SAME shared function the tools answer with
useAgentContext(
  publishMessageContext,
  active && !meals.loading,
  useMemo(() => ({ label: 'Meals', content: describeDay(meals.items) }), [meals.items]),
)

// ui/register.tsx: the tools and when to call which, while the tab is open
agentContext: {
  description: 'Meals: today’s list on screen, each meal with its id.',
  tools: ['meal_log_add', 'meal_log_list', 'meal_log_update', 'meal_log_remove'],
  nextSteps: ['To change a meal, call meal_log_update with the id from the published list.'],
},
```

The context clears when the tab hides. For a selected item, a resource the agent can open or a file, publish bindings (`resourceMessageBindingDraft({ uri, label })`) with `publishMessageContext({ strategy: 'replace', bindings })`. `agentContext` can be a function of the work item when each open item has its own (a task card).

## Handing the agent a moment: `askAgent`

When something happens that the agent should act on (a button that needs judgment, a watched value crossing a line, the person's move in a game), the route hands the moment to the agent in that chat:

```ts
routes.post('/ask', validated('json', z.object({ question: z.string() })), async (c) => {
  if (!c.env.sessionId) return c.json({ error: 'Open this in a chat.' }, 400)
  const outcome = await askAgent(ctx, {
    userId: c.env.userId,
    sessionId: c.env.sessionId,
    message: `The person asked from the screen: ${c.req.valid('json').question}`,
    tools: ['meal_log_add'],
    key: 'ask',
  })
  return c.json(outcome)
})
```

The screen sends `?sessionId=` from `useWorkItemSessionId()` and registers with `scope: 'chat'`.

| Rule | Why |
| --- | --- |
| Never from your own tool | the agent's call would wake the agent, whose next call would wake it again |
| `message` is 1 to 2000 characters; `tools` at most 6, only this app's | the host refuses a request that breaks the contract |
| `key` (letters, digits, `.:_-`, up to 120) makes a double click one delivery | it joins a wake still waiting; after the turn ran the same key is new |
| Read the outcome: `delivered`, `missed` (no such chat), `refused`, `failed` | `delivered` means admitted, not answered. Show the person what happened on `missed` or `failed`; no automatic retry |
| Call it from a route | it answers `missed` when the load cannot wake a chat (a run's tool load has no `ctx.host`) |

The woken turn is marked "via Mini app"; the agent answers with the tools you named. For a game, the turn table (`createTurnTable`, `decisionTurns`) does this for a board per chat; see `examples/game/`.

## Putting text in the composer

The screen can also speak for the person, in their chat, without a model call of its own: a button that drafts a question in the composer. This is screen code (`@localixai/mini-app-sdk/ui/runtime`):

```ts
miniAppComposer.insert({ sessionId, text: `Why did ${symbol} move today?` }) // appends to the draft
miniAppComposer.insert({ sessionId, text, bindings: [resourceMessageBindingDraft({ uri, label })] })
```

`sessionId` is required: without it the text goes to whichever composer has focus. Kit buttons do the common cases: `ComposerCommandButton` (`@localixai/kit/composer-command-button`, inserts a slash command or text) and `ResourceContextButton` (`@localixai/kit/resource-context-button`, "ask about this" for a resource URI). `submit: true` sends the message at once and `internal: true` hides machine-written text from the transcript while the model still sees it (both as used by `trading`; **not verified beyond that app**). Prefer inserting without `submit` so the person can edit and send.

## Silent judgments: `decide` and meaning

Small, frequent judgments the app makes itself (which column, which of a few options) with no chat turn:

```ts
const { pick, by } = await decide(ctx, {
  userId, sessionId,                       // c.env.userId, c.env.sessionId
  purpose: 'triage',
  state: { title: card.title, due: card.due, overdue },  // facts code can compute
  question: 'Which column does this card belong in?',
  options: { todo: 'Not started', doing: 'Being worked on', done: 'Finished' },
  fallback: 'todo',
})
```

`by` is `'model'`, or `'fallback'` (below `confidence`, default 0.7, or when no model answers) with a `reason` (`unavailable`, `deadline`, `unsure`, `no-host`…): always go on with the fallback. It bills the person's chat under Decisions; never call a model of your own. **In a tool the agent is already a model:** when it can name the pick, take it as the tool's input and keep `decide` for the screen and for events no agent sees.

By meaning, free, on this computer's embedding model:

- A collection's `search(item)` and `collection.search(text)`: the find tool.
- `rankByMeaning(ctx, query, items, (item) => text)` → `{ items, by: 'model' | 'fallback' }`: nearest first, or the given order while the model is not ready.
- The semantic index: `registerSource({ collection, label, version, scan, read })` to index items that are not a collection, `changed(collection, ids)`, `query`, `embed`, `rank(query, [{ key, text }], { task })`, `status()`. `embed` and `rank` return `null` until ready. Read it as `ctx.semantic ?? ctx.host?.semantic`: newer hosts give `ctx.semantic` to every load, a tool's too; older ones only `ctx.host.semantic` on the boot load. Register sources from the boot load only (`ctx.host` is set there). Always keep a non-semantic path.

Say in the find tool's description that it is empty while search is not ready, and have it tell the agent to list instead.

## Hooks and context providers

Return them from `register`; each invocation is isolated and capped at five seconds. Use them only when a tool and a guide cannot do the job.

- `hooks`: `onSessionStart`, `onUserMessage`, `onPreToolCall`, `onPostToolCall`, `onAssistantMessage`, `onSessionEnd`, `onSubagentStop`, `onHitlRequest`, `onHitlResolved`, `onHumanAssigned`. Report a standing problem a person must fix with `ctx.reportProblem?.({ message, detail?, source? })`, not `ctx.log`.
- `contextProviders` (in `backend`): text the host adds to a prompt when a resource of yours is attached, with a budget. `createResourceContextProvider({ id, namespace, expander: resourceProvider, accepts, destinations: ['chat', 'subagent'], sensitivity: 'project', maxTokens: 1200 })` reuses the resource provider's `expand` (see `workspace.md`). Describe relations and state, not what the file tools already read.
- `promptSections` (manifest, up to 3, 2,000 characters each) for static prompt text.

## No own chat

The Localix chat is the conversation. Do not add a message list, a prompt box that calls a model, a transcript or an API key to the app. To talk to the agent: tools for it to call, a context the screen publishes, `askAgent` from a route for events, `miniAppComposer.insert` or a kit composer button for the person's own words. A game against the agent is the person's move in the app, a wake, and the agent's reply through the game's tool (`examples/game/`).
