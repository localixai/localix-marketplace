import { memo } from 'react'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { Handle, Position, type Node, type NodeProps } from '@localixai/kit/canvas'
import type { Tone } from '../shared/model'
import type { NoteData } from './flow'

/** The tone is the card's edge colour, from the host's status tokens (light and dark follow). */
const TONE: Record<Tone, string> = {
  neutral: 'border-border-soft',
  info: 'border-status-info/60',
  warning: 'border-status-warning/60',
}

/** A connection point: small until the card is hovered or selected, always big enough to hit. */
const DOT =
  'size-2.5 rounded-full border-2 border-popover bg-text-faint opacity-0 transition-opacity duration-(--dur-fast) group-hover/note:opacity-100'

/**
 * One note. It is a plain card: dragging, selecting and connecting belong to the canvas. The left
 * dot receives an arrow and the right dot starts one; the library draws an edge only between a
 * source and a target handle, so both exist. Take `Handle` and `Position` from the kit — a bundled
 * copy of the flow library would have a store the canvas cannot see.
 */
function NoteNodeImpl({ data, selected }: NodeProps<Node<NoteData>>) {
  return (
    <div
      className={cn(
        'group/note relative w-52 rounded-lg border bg-card px-3 py-2.5 shadow-(--shadow-soft)',
        TONE[data.tone],
        selected && 'ring-2 ring-status-info/30',
      )}
    >
      <Handle type="target" position={Position.Left} className={DOT} />
      <p className="whitespace-pre-wrap break-words text-sm text-foreground">{data.text}</p>
      <Handle type="source" position={Position.Right} className={DOT} />
    </div>
  )
}

export const NoteNode = memo(NoteNodeImpl)
