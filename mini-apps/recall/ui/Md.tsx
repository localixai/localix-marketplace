import { useMemo } from 'react'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { miniAppApiUrl } from '@localixai/mini-app-sdk/ui/transport'
import { MarkdownRenderer } from '@localixai/kit/markdown'
import { mediaPath, withMediaUrls } from '../shared/api'

/**
 * A note's Markdown, rendered by the host's renderer (code, lists, images; raw HTML is not
 * trusted, so a pasted `<script>` shows as nothing). `media/<file>` references become the app's
 * image route first.
 */
export function Md({ children, className }: { children: string; className?: string }) {
  const text = useMemo(
    () => withMediaUrls(children, (file) => miniAppApiUrl(mediaPath(file))),
    [children],
  )
  return (
    <div className={cn('recall-md min-w-0 text-foreground', className)}>
      <MarkdownRenderer>{text}</MarkdownRenderer>
    </div>
  )
}
