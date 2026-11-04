import type { Collection, MiniAppContext } from '@localixai/mini-app-sdk/backend'
import { describeForAgent, itemInputSchema, type Item } from '../shared/model'
import type { itemsSpec } from './items'

type Items = Collection<Item, (typeof itemsSpec)['input']['shape']>

/**
 * The agent's tools. The agent does the understanding — it reads the message, the photo, the file —
 * and calls these with structured input; the tools validate, store and answer with what changed and
 * where things stand, so the agent can tell the person in one sentence.
 *
 * Rules every tool here keeps:
 * - `mutates` and `classify` say what it changes: `host` for the app's own data.
 * - `executionMode: 'sequential'` for a tool that writes; reads may run in parallel.
 * - `isError: true` only for a call that did nothing because the input was wrong.
 */
export function createTools(ctx: MiniAppContext, items: Items) {
  const { z } = ctx
  const list = async () => describeForAgent(await items.list())
  const write = {
    executionMode: 'sequential',
    mutates: true,
    classify: () => ({ effect: 'host' as const }),
    permissionPaths: () => [],
  } as const
  const read = { executionMode: 'parallel', mutates: false, permissionPaths: () => [] } as const
  const notFound = {
    content: 'No item has that id. Read template_list_items for the ids.',
    isError: true,
  }
  return [
    ctx.defineTool({
      ...write,
      name: 'template_add_item',
      label: 'Add an item',
      activeVerb: 'Adding',
      description: 'Add one item: a title and an optional note. Answers with the whole list.',
      // The shared schema with descriptions added: the agent is shown the limits the list keeps.
      inputSchema: itemInputSchema.extend({
        title: itemInputSchema.shape.title.describe('What it is, in a few words.'),
      }),
      async execute(_toolCallId, input) {
        const item = await items.add(input)
        return { content: `Added "${item.title}".\n${await list()}` }
      },
    }),
    ctx.defineTool({
      ...read,
      name: 'template_list_items',
      label: 'List items',
      activeVerb: 'Reading the list',
      description: 'Read every item with its id, open ones first.',
      inputSchema: z.object({}),
      async execute() {
        return { content: await list() }
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'template_update_item',
      label: 'Change an item',
      activeVerb: 'Changing',
      description:
        'Change one item by its id: its title, its note, or whether it is done. Fields left out stay as they are.',
      inputSchema: itemInputSchema.partial().extend({ id: z.string().min(1) }),
      async execute(_toolCallId, { id, ...change }) {
        const item = await items.update(id, change)
        if (!item) return notFound
        return { content: `Changed "${item.title}".\n${await list()}` }
      },
    }),
    ctx.defineTool({
      ...write,
      name: 'template_remove_item',
      label: 'Remove an item',
      activeVerb: 'Removing',
      description: 'Remove one item by its id. Answers with the whole list.',
      inputSchema: z.object({ id: z.string().min(1) }),
      async execute(_toolCallId, { id }) {
        if (!(await items.remove(id))) return notFound
        return { content: `Removed it.\n${await list()}` }
      },
    }),
    ctx.defineTool({
      ...read,
      name: 'template_find_items',
      label: 'Find items',
      activeVerb: 'Searching the list',
      description:
        'Find items by meaning ("the one about the dentist"). Empty while the embedding model is not ready: then list the items instead.',
      inputSchema: z.object({ query: z.string().min(1).describe('What to look for.') }),
      async execute(_toolCallId, { query }) {
        const found = await items.search(query, { limit: 10 })
        if (!found.length) return { content: 'Nothing matches by meaning (or search is not ready).' }
        return { content: found.map((item) => `- ${item.title} (id ${item.id})`).join('\n') }
      },
    }),
  ]
}
