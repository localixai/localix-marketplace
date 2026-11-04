import type { MiniAppContext } from '@localixai/mini-app-sdk/backend'
import { ARRANGEMENTS } from '../shared/layout'
import { TONES, describeBoard, linkInputSchema, noteInputSchema } from '../shared/model'
import type { Board } from './board'

/**
 * The agent's tools. The agent does the understanding (it reads the conversation and decides what
 * belongs on the board); the tools validate, change the chat's board and answer with where it
 * stands, so the agent can tell the person in one sentence.
 *
 * Rules every tool here keeps:
 * - A tool that writes is `sequential`, `mutates` and classified `host` (the app's own data).
 * - `isError: true` only for a call that did nothing because the input was wrong.
 * - The board is the chat's: the chat comes from the call's context, never from the input.
 */
export function createTools(ctx: MiniAppContext, board: Board) {
  const { z } = ctx
  const write = {
    executionMode: 'sequential',
    mutates: true,
    classify: () => ({ effect: 'host' as const }),
    permissionPaths: () => [],
  } as const
  const read = { executionMode: 'parallel', mutates: false, permissionPaths: () => [] } as const

  /** The chat a call runs in, as the `where` every collection call takes. */
  const whereOf = (context: { session?: { id: string } } | undefined) => {
    const sessionId = context?.session?.id
    return sessionId ? { userId: ctx.userId, sessionId } : null
  }
  const noChat = { content: 'The board belongs to a chat; this call has none.', isError: true }
  const noNote = (id: string) => ({
    content: `No note has the id ${id}. Read canvas_board_list for the ids.`,
    isError: true,
  })
  const stands = async (where: { userId: string; sessionId: string }) => {
    const { notes, links } = await board.read(where)
    return describeBoard(notes, links)
  }

  return [
    ctx.defineTool({
      ...write,
      name: 'canvas_board_add_note',
      label: 'Add a note',
      activeVerb: 'Adding a note',
      description:
        'Put one note on the chat’s board. Leave x and y out to place it in the next free slot.',
      inputSchema: noteInputSchema.extend({
        text: noteInputSchema.shape.text.describe('What the note says, in a sentence or two.'),
        tone: z.enum(TONES).optional().describe('info for facts, warning for risks.'),
      }),
      async execute(_toolCallId, input, _signal, _onUpdate, context) {
        const where = whereOf(context)
        if (!where) return noChat
        const note = await board.addNote(where, input)
        return { content: `Added the note (id ${note.id}).\n${await stands(where)}` }
      },
    }),

    ctx.defineTool({
      ...write,
      name: 'canvas_board_update_note',
      label: 'Change a note',
      activeVerb: 'Changing a note',
      description: 'Change one note by its id: its text, tone or position. Fields left out stay.',
      inputSchema: noteInputSchema.partial().extend({ id: z.string().min(1) }),
      async execute(_toolCallId, { id, ...patch }, _signal, _onUpdate, context) {
        const where = whereOf(context)
        if (!where) return noChat
        if (!(await board.updateNote(where, id, patch))) return noNote(id)
        return { content: `Changed the note.\n${await stands(where)}` }
      },
    }),

    ctx.defineTool({
      ...write,
      name: 'canvas_board_remove_note',
      label: 'Remove a note',
      activeVerb: 'Removing a note',
      description: 'Remove one note by its id, with the links that touch it.',
      inputSchema: z.object({ id: z.string().min(1) }),
      async execute(_toolCallId, { id }, _signal, _onUpdate, context) {
        const where = whereOf(context)
        if (!where) return noChat
        if (!(await board.removeNote(where, id))) return noNote(id)
        return { content: `Removed the note and its links.\n${await stands(where)}` }
      },
    }),

    ctx.defineTool({
      ...write,
      name: 'canvas_board_connect',
      label: 'Connect notes',
      activeVerb: 'Connecting notes',
      description:
        'Draw an arrow from one note to another, by their ids. Connecting a pair again changes the arrow’s label.',
      inputSchema: linkInputSchema.extend({
        from: z.string().min(1).describe('The id of the note the arrow starts at.'),
        to: z.string().min(1).describe('The id of the note it points to.'),
        label: z.string().trim().max(60).optional().describe('A few words on the arrow.'),
      }),
      async execute(_toolCallId, input, _signal, _onUpdate, context) {
        const where = whereOf(context)
        if (!where) return noChat
        if (input.from === input.to)
          return { content: 'A note cannot point at itself.', isError: true }
        const made = await board.connect(where, input)
        if (!made)
          return {
            content: 'One of those ids is not a note on the board. Read canvas_board_list.',
            isError: true,
          }
        return { content: `Connected the notes.\n${await stands(where)}` }
      },
    }),

    ctx.defineTool({
      ...write,
      name: 'canvas_board_disconnect',
      label: 'Remove a link',
      activeVerb: 'Removing a link',
      description: 'Remove one arrow by its id (the id shown under Links).',
      inputSchema: z.object({ id: z.string().min(1) }),
      async execute(_toolCallId, { id }, _signal, _onUpdate, context) {
        const where = whereOf(context)
        if (!where) return noChat
        if (!(await board.disconnect(where, id)))
          return { content: `No link has the id ${id}.`, isError: true }
        return { content: `Removed the link.\n${await stands(where)}` }
      },
    }),

    ctx.defineTool({
      ...write,
      name: 'canvas_board_arrange',
      label: 'Arrange the board',
      activeVerb: 'Arranging the board',
      description:
        'Move every note into order: "grid" fills rows in the order the notes were made; "layers" puts the start of each chain on the left and follows the arrows to the right.',
      inputSchema: z.object({ how: z.enum(ARRANGEMENTS) }),
      async execute(_toolCallId, { how }, _signal, _onUpdate, context) {
        const where = whereOf(context)
        if (!where) return noChat
        const moved = await board.arrange(where, how)
        return { content: `Arranged ${moved} notes as ${how}.\n${await stands(where)}` }
      },
    }),

    ctx.defineTool({
      ...write,
      name: 'canvas_board_look',
      label: 'Look at notes',
      activeVerb: 'Pointing at notes',
      description:
        'Pan the person’s open board to one or more notes, to say "look at this". Nothing changes on the board; if it is not open, nothing moves.',
      inputSchema: z.object({
        noteIds: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe('The notes to bring into view.'),
      }),
      // Pointing twice at the same note is a new request each time.
      behaviorHints: { idempotentHint: false },
      async execute(_toolCallId, { noteIds }, _signal, _onUpdate, context) {
        const where = whereOf(context)
        if (!where) return noChat
        const { found, missing } = await board.look(where, noteIds)
        if (!found.length) return noNote(missing[0]!)
        const skipped = missing.length ? ` Not on the board: ${missing.join(', ')}.` : ''
        return {
          content: `The board looks at ${found.length} of ${noteIds.length} notes.${skipped}`,
        }
      },
    }),

    ctx.defineTool({
      ...read,
      name: 'canvas_board_list',
      label: 'Read the board',
      activeVerb: 'Reading the board',
      description: 'Read every note and link on the chat’s board, with their ids.',
      inputSchema: z.object({}),
      async execute(_toolCallId, _input, _signal, _onUpdate, context) {
        const where = whereOf(context)
        if (!where) return noChat
        return { content: await stands(where) }
      },
    }),
  ]
}
