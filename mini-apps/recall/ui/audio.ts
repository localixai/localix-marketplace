import { miniAppApiUrl } from '@localixai/mini-app-sdk/ui/transport'
import { mediaPath } from '../shared/api'

/**
 * The one player of the screen. Playing a sound stops the one before it, so a card with several
 * sounds, or a quick replay, never layers voices. A refusal to play (the browser wants a click
 * first, the file is gone) is not an error the person needs to read: the button is still there.
 */

let current: HTMLAudioElement | null = null

export function stopSound(): void {
  const playing = current
  current = null
  playing?.pause()
}

/** Play a stored sound by its file name (`<hash>.mp3`). */
export function playSound(file: string): void {
  stopSound()
  try {
    const audio = new Audio(miniAppApiUrl(mediaPath(file)))
    current = audio
    audio.addEventListener('ended', () => {
      if (current === audio) current = null
    })
    void Promise.resolve(audio.play()).catch(() => {
      if (current === audio) current = null
    })
  } catch {
    current = null
  }
}
