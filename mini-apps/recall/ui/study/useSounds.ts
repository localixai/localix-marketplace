import { useEffect } from 'react'
import { soundFiles } from '../../shared/sound'
import type { StudyCard } from '../../shared/payloads'
import { playSound, stopSound } from '../audio'

/**
 * The sounds of the card on the table. With "Play sounds by themselves" the question's first sound
 * plays when the card appears and the answer's (else the extra note's) when it is turned over; `replay` (key R) plays the
 * first sound of the side in view again. Leaving the view stops what is playing.
 */
export function useSounds(card: StudyCard | null, revealed: boolean, autoplay: boolean) {
  const question = soundFiles(card?.prompt ?? '')
  const answer = soundFiles(card?.answer ?? '')
  const extra = soundFiles(card?.extra ?? '')
  const id = card?.card.id

  useEffect(() => {
    if (autoplay && question[0]) playSound(question[0])
    // Only a new card (or the setting being switched on) starts a sound; a re-render does not.
  }, [id, autoplay])
  useEffect(() => {
    // Anki plays the answer's sound, and where the answer has none the extra note's.
    const first = answer[0] ?? extra[0]
    if (autoplay && revealed && first) playSound(first)
  }, [id, revealed])
  useEffect(() => stopSound, [])
  useEffect(() => {
    if (!card) stopSound()
  }, [card])

  const inView = revealed ? [...answer, ...extra, ...question] : question
  return {
    /** Whether any side of the card has a sound. */
    has: question.length + answer.length + extra.length > 0,
    replay: () => {
      if (inView[0]) playSound(inView[0])
    },
  }
}
