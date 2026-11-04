import { useMemo } from 'react'
import { Volume2 } from 'lucide-react'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { miniAppApiUrl } from '@localixai/mini-app-sdk/ui/transport'
import { IconButton } from '@localixai/kit/icon-button'
import { MarkdownRenderer } from '@localixai/kit/markdown'
import { mediaPath, withMediaUrls } from '../shared/api'
import { soundFiles, withoutSounds } from '../shared/sound'
import { playSound } from './audio'

/**
 * A note's Markdown, rendered by the host's renderer (code, lists, images; raw HTML is not
 * trusted, so a pasted `<script>` shows as nothing). Sounds (`[audio](media/<file>)`) are taken out
 * of the text first and come back as a compact row of play buttons after it; `media/<file>`
 * pictures become the app's image route.
 */
export function Md({ children, className }: { children: string; className?: string }) {
  const { text, sounds } = useMemo(() => {
    const files = soundFiles(children)
    const rest = files.length ? withoutSounds(children) : children
    return { text: withMediaUrls(rest, (file) => miniAppApiUrl(mediaPath(file))), sounds: files }
  }, [children])
  return (
    <div className={cn('recall-md min-w-0 text-foreground', className)}>
      {text.trim() && <MarkdownRenderer>{text}</MarkdownRenderer>}
      {sounds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {sounds.map((file, index) => {
            const name = index === 0 ? 'Play sound' : `Play sound ${index + 1}`
            return (
              <IconButton
                key={file}
                aria-label={name}
                tooltip={name}
                size="sm"
                onClick={(event) => {
                  playSound(file)
                  // After a mouse click the keys go back to the view around (Space still turns a card).
                  if (event.detail > 0)
                    event.currentTarget
                      .closest<HTMLElement>('[tabindex]')
                      ?.focus({ preventScroll: true })
                }}
              >
                <Volume2 />
              </IconButton>
            )
          })}
        </div>
      )}
    </div>
  )
}
