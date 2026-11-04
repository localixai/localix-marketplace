import type { ReactNode } from 'react'
import { withoutSounds } from '../shared/sound'

/**
 * Inline Markdown for one-line titles: code, bold and emphasis are drawn; links, images, headings,
 * list marks and stray HTML are reduced to their text. Anything that does not pair up stays as it
 * was written, so a title is never lost to a parsing rule.
 */

const TOKEN = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\*\*([^*]+?)\*\*|__([^_]+?)__|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|(?<![\w_])_([^_\s][^_]*?)_(?![\w_])/g

/** The text with the block-level and link syntax taken out, on one line. */
function flatten(markdown: string): string {
  return withoutSounds(markdown)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/gm, '')
    // The importer escapes a number, `#` or `>` at a line's start so it is not read as a list or heading.
    .replace(/^(\s*\d{1,9})\\([.)])/gm, '$1$2')
    .replace(/^(\s*)\\([#>+\-=])/gm, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The same title as plain text, for accessible names and tooltips. */
export function plainInline(markdown: string): string {
  return flatten(markdown).replace(TOKEN, (_m, _t, code, bold, bold2, em, em2) => code ?? bold ?? bold2 ?? em ?? em2 ?? '')
}

export function InlineMd({ children }: { children: string }) {
  const text = flatten(children)
  const out: ReactNode[] = []
  let at = 0
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0
    if (start > at) out.push(text.slice(at, start))
    const [, , code, bold, bold2, em, em2] = match
    if (code !== undefined) out.push(<code key={start} className="recall-code">{code.trim()}</code>)
    else if (bold ?? bold2) out.push(<strong key={start}>{bold ?? bold2}</strong>)
    else out.push(<em key={start}>{em ?? em2}</em>)
    at = start + match[0].length
  }
  if (at < text.length) out.push(text.slice(at))
  return <>{out}</>
}
