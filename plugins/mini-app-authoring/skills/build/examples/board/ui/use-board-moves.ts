import { useState, type DragEvent } from 'react'
import { STAGE_LABEL, type Card, type CardInput, type Stage } from '../shared/model'

/**
 * Everything about moving a card, in one place: the one write, the drag state and the sentence a
 * screen reader hears afterwards. Three ways lead to `move` and none needs a mouse: dragging the
 * card, Alt+Arrow on it, and "Move to …" in its menu.
 */
export function useBoardMoves(
  cards: readonly Card[],
  update: (id: string, patch: Partial<CardInput>) => Promise<unknown>,
) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<Stage | null>(null)
  // Polite and silent on screen: the result of a move is otherwise only visible.
  const [announcement, setAnnouncement] = useState('')

  async function move(card: Card, stage: Stage) {
    if (card.stage === stage) return
    // The one write. Its answer replaces the list, so the card appears in its new column at once.
    const result = await update(card.id, { stage })
    setAnnouncement(
      result
        ? `Moved ${card.title} to ${STAGE_LABEL[stage]}.`
        : `Could not move ${card.title} to ${STAGE_LABEL[stage]}.`,
    )
  }

  const endDrag = () => {
    setDragId(null)
    setOverStage(null)
  }
  const dragging = cards.find((card) => card.id === dragId)

  return {
    move,
    dragId,
    announcement,
    onCardDragStart(event: DragEvent<HTMLElement>, card: Card) {
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move'
        // Firefox starts no drag without data.
        event.dataTransfer.setData('text/plain', card.id)
      }
      setDragId(card.id)
    },
    onCardDragEnd: endDrag,
    /** The props that make a column a drop target. */
    columnDrop(stage: Stage) {
      return {
        isOver: overStage === stage && dragging?.stage !== stage,
        onDragOver(event: DragEvent<HTMLElement>) {
          if (!dragId) return
          // Preventing the default is what makes the column a valid drop target.
          event.preventDefault()
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
          setOverStage(stage)
        },
        onDragLeave(event: DragEvent<HTMLElement>) {
          // Moving between a column's children also fires leave; only leaving the column counts.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOverStage((current) => (current === stage ? null : current))
          }
        },
        onDrop(event: DragEvent<HTMLElement>) {
          event.preventDefault()
          if (dragging) void move(dragging, stage)
          endDrag()
        },
      }
    },
  }
}
