import { useCallback, useMemo, useState } from 'react'
import {
  Canvas,
  CanvasProvider,
  useCameraPlacement,
  useCanvasCamera,
  type Node,
} from '@localixai/kit/canvas'
import { useWorkItemSessionId } from '@localixai/mini-app-sdk/ui/work-item-session'
import type { Link, Look, Note } from '../shared/model'
import { NOTE_TYPE, toFlow, type Live, type NoteData, type Selection } from './flow'
import { NoteNode } from './NoteNode'
import { useAgentLook } from './useAgentLook'

const nodeTypes = { [NOTE_TYPE]: NoteNode }

export interface BoardProps {
  active: boolean
  notes: readonly Note[]
  links: readonly Link[]
  looks: readonly Look[]
  selection: Selection
  onSelect: (selection: Selection) => void
  /** A note was dropped at a new place. */
  onMove: (id: string, x: number, y: number) => Promise<unknown>
  /** The person drew an arrow from one note to another. */
  onConnect: (from: string, to: string) => void
  /** Double-click on the empty board: a note goes there. */
  onAddAt: (x: number, y: number) => void
  /** Delete or Backspace with something selected. */
  onDelete: () => void
}

/** The camera belongs to the host's canvas, so the provider wraps everything that moves it. */
export function Board(props: BoardProps) {
  return (
    <CanvasProvider>
      <Surface {...props} />
    </CanvasProvider>
  )
}

function Surface({
  active,
  notes,
  links,
  looks,
  selection,
  onSelect,
  onMove,
  onConnect,
  onAddAt,
  onDelete,
}: BoardProps) {
  const camera = useCanvasCamera()
  const sessionId = useWorkItemSessionId()
  // While a card is being dragged its position lives here; it is written once, on drop. Nodes are
  // derived from the saved board plus this, so a poll in the middle of a drag cannot fight it.
  const [live, setLive] = useState<Live>(new Map())
  const { nodes, edges } = useMemo(
    () => toFlow(notes, links, live, selection),
    [notes, links, live, selection],
  )

  // Fit the whole board once per chat; a re-read of the board never moves the camera again.
  const placing = useCameraPlacement(`board:${sessionId ?? ''}`, () => {
    camera.fit({ duration: 0, maxZoom: 1 })
  })

  // The agent's "look at this": one animated move, to the notes it named.
  const go = useCallback(
    (ids: string[]) => camera.fit({ nodes: ids, maxZoom: ids.length === 1 ? 1.25 : 1 }),
    [camera],
  )
  useAgentLook({ active, looks, notes, go })

  return (
    <Canvas<Node<NoteData>>
      label="Whiteboard. Double-click to add a note, drag from a note's dot to connect it, Delete removes the selection"
      interaction="edit"
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      hidden={placing}
      snapToGrid
      snapGrid={[8, 8]}
      onNodesChange={(changes) => {
        for (const change of changes) {
          if (change.type !== 'position' || !change.position) continue
          const { id, position } = change
          setLive((current) => new Map(current).set(id, position))
        }
      }}
      onNodeDragStart={(_event, node) => onSelect({ kind: 'note', id: node.id })}
      onNodeDragStop={async (_event, _node, dragged) => {
        // Write what the screen SHOWS, then let the saved board take over again.
        for (const node of dragged) await onMove(node.id, node.position.x, node.position.y)
        setLive(new Map())
      }}
      onNodeClick={(_event, node) => onSelect({ kind: 'note', id: node.id })}
      onEdgeClick={(_event, edge) => onSelect({ kind: 'link', id: edge.id })}
      onPaneClick={() => onSelect(null)}
      onConnect={(connection) =>
        connection.source && connection.target && onConnect(connection.source, connection.target)
      }
      onBoardDoubleClick={({ x, y }) => onAddAt(x, y)}
      onBoardKey={(event) => {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return false
        if (!selection) return false
        onDelete()
        return true
      }}
    />
  )
}
