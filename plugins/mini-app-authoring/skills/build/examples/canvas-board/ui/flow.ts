import type { CanvasEdgeType, Node } from '@localixai/kit/canvas'
import { liveLinks, type Link, type Note, type Tone } from '../shared/model'

/**
 * FROM THE BOARD TO THE CANVAS — a pure function, so what the screen draws is tested without a
 * canvas. Nodes and edges are DERIVED from the collections on every render; nothing here is a
 * second copy of the board that could fall behind it.
 */

export const NOTE_TYPE = 'note'

export interface NoteData extends Record<string, unknown> {
  text: string
  tone: Tone
}

/** What is selected: a note or a link, by id. */
export type Selection = { kind: 'note' | 'link'; id: string } | null

/** A position the person is dragging a note to, shown before it is saved. */
export type Live = ReadonlyMap<string, { x: number; y: number }>

export function toFlow(
  notes: readonly Note[],
  links: readonly Link[],
  live: Live,
  selection: Selection,
): { nodes: Node<NoteData>[]; edges: CanvasEdgeType[] } {
  const nodes = notes.map((note): Node<NoteData> => {
    const dragged = live.get(note.id)
    return {
      id: note.id,
      type: NOTE_TYPE,
      position: dragged ?? { x: note.x, y: note.y },
      selected: selection?.kind === 'note' && selection.id === note.id,
      data: { text: note.text, tone: note.tone },
    }
  })
  const focusNote = selection?.kind === 'note' ? selection.id : null
  const edges = liveLinks(notes, links).map((link): CanvasEdgeType => {
    const chosen = selection?.kind === 'link' && selection.id === link.id
    const touching = focusNote !== null && (link.from === focusNote || link.to === focusNote)
    return {
      id: link.id,
      source: link.from,
      target: link.to,
      selected: chosen,
      // The host's edge draws itself from `data`: tone picks the status colour, emphasis dims
      // what the selection is not about, and `arrow: 'always'` keeps the direction readable.
      data: {
        tone: link.tone,
        weight: chosen ? 2.5 : 1.5,
        arrow: 'always',
        route: 'bezier',
        emphasis: chosen || touching ? 'focus' : focusNote !== null ? 'dimmed' : 'idle',
        ...(link.label ? { label: link.label, labelAlways: true } : {}),
      },
    }
  })
  return { nodes, edges }
}
