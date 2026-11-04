import { decodeEntities } from './html-entities'

/**
 * Card HTML (Anki fields, HTML in a spreadsheet) to Markdown. The input is data: it is tokenised,
 * never evaluated; scripts, styles and embedded documents go with their content, unknown tags go and
 * keep their text, and text that Markdown would read as syntax is escaped. Anki's cloze marks
 * (`{{c1::answer::hint}}`) pass through unchanged.
 */

export interface HtmlToMarkdownOptions {
  /**
   * The URL an image's `src` becomes: `media/<file>`, a web address (written as a plain link), or
   * `null` to drop it. Without it every image is dropped.
   */
  image?: (src: string) => string | null
  /**
   * The URL a sound's name (`[sound:x]`, `<audio src>`) becomes: `media/<file>`, or `null` to drop
   * it. A kept sound is written as `[audio](media/<file>)` on a line of its own. Without it every
   * sound is dropped.
   */
  sound?: (src: string) => string | null
}

export interface HtmlToMarkdownResult {
  markdown: string
  /** `[sound:…]` tags and `<audio>` elements dropped (not kept by the `sound` option). */
  sounds: number
  /** `<video>` elements dropped. */
  videos: number
  /** Images dropped (no `image` option, or it answered `null`). */
  images: number
}

interface Element {
  tag: string
  attrs: Record<string, string>
  children: Node[]
}
type Node = string | Element

interface Context extends HtmlToMarkdownOptions {
  pres: string[]
  images: number
  sounds: number
  bold: boolean
  italic: boolean
}

// Private markers resolved by `finalize`: a block edge, a paragraph edge, a line break, a line the
// converter wrote itself (no escaping), and a preformatted block's placeholder.
const BLOCK = '\u0001'
const PARA = '\u0002'
const BREAK = '\u0003'
const KEEP = '\u0004'
const PRE = '\u0006'

const VOID = new Set(['br', 'img', 'hr', 'wbr', 'input', 'meta', 'link', 'source', 'track', 'col', 'area', 'base', 'param', 'embed'])
const BLOCKS = new Set(['div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'address', 'dl', 'dt', 'dd', 'center', 'form', 'fieldset', 'details', 'summary', 'table', 'thead', 'tbody', 'tfoot', 'caption'])
const DROPPED = 'script|style|title|head|template|noscript|iframe|object|textarea|select|svg|math|canvas|video'
const MAX_DEPTH = 100

const TAG = /<(\/?)([A-Za-z][A-Za-z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
const ATTR = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
const HTMLISH = /<\/?(br|div|p|b|i|u|em|strong|span|img|a|ul|ol|li|code|pre|font|sub|sup|h[1-6]|table|tr|td|hr|blockquote)\b[^>]*>|&(#\d+|#x[0-9a-f]+|[a-z]+);/i

/** Whether a spreadsheet cell holds HTML rather than plain text. */
export function looksLikeHtml(text: string): boolean {
  return HTMLISH.test(text)
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const match of source.matchAll(ATTR)) {
    attrs[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attrs
}

function parse(html: string): Element {
  const root: Element = { tag: '#root', attrs: {}, children: [] }
  const stack = [root]
  const top = () => stack[stack.length - 1]!
  let last = 0
  for (const match of html.matchAll(TAG)) {
    if (match.index > last) top().children.push(decodeEntities(html.slice(last, match.index)))
    last = match.index + match[0].length
    const tag = match[2]!.toLowerCase()
    if (match[1]) {
      const open = stack.findLastIndex((element) => element.tag === tag)
      if (open > 0) stack.length = open
      continue
    }
    if (tag === 'li') {
      const item = stack.findLastIndex((element) => element.tag === 'li')
      const list = stack.findLastIndex((element) => element.tag === 'ul' || element.tag === 'ol')
      if (item > 0 && item > list) stack.length = item
    }
    if (tag === 'p' && top().tag === 'p') stack.pop()
    const element: Element = { tag, attrs: parseAttrs(match[3]!), children: [] }
    top().children.push(element)
    if (!VOID.has(tag) && !match[3]!.trimEnd().endsWith('/') && stack.length < MAX_DEPTH) {
      stack.push(element)
    }
  }
  if (last < html.length) top().children.push(decodeEntities(html.slice(last)))
  return root
}

function escapeText(text: string): string {
  return text
    .replace(/[\\`*[\]<]/g, '\\$&')
    .replace(/_/g, (underscore, offset: number, whole: string) =>
      /[\p{L}\p{N}]/u.test(whole[offset - 1] ?? '') && /[\p{L}\p{N}]/u.test(whole[offset + 1] ?? '')
        ? underscore
        : '\\_',
    )
}

function textOf(node: Node, pre = false): string {
  if (typeof node === 'string') return node
  if (node.tag === 'br') return '\n'
  const inner = node.children.map((child) => textOf(child, pre)).join('')
  return pre && (BLOCKS.has(node.tag) || node.tag === 'p') ? `\n${inner}\n` : inner
}

/** Bold or italic around each line of `inner`, outside its edge spaces. */
function wrapInline(inner: string, delimiter: string): string {
  return inner
    .split(/([\u0001-\u0003\n]+)/)
    .map((part, index) => {
      if (index % 2 || part.includes(KEEP) || part.includes(PRE)) return part
      const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(part)!
      return match[2] ? `${match[1]}${delimiter}${match[2]}${delimiter}${match[3]}` : part
    })
    .join('')
}

function encodeUrl(url: string): string {
  return url
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[ ()<>]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)
}

function withoutTrailingBreaks(children: Node[]): Node[] {
  const kept = [...children]
  while (kept.length) {
    const last = kept[kept.length - 1]!
    if (typeof last === 'string' ? !last.trim() : last.tag === 'br') kept.pop()
    else break
  }
  // A block holding only a break is an empty line, the way Anki's editor writes one.
  return kept.length ? kept : children
}

function renderChildren(children: Node[], context: Context): string {
  return children.map((child) => renderNode(child, context)).join('')
}

function renderInlineCode(element: Element): string {
  const text = textOf(element).replace(/\s+/g, ' ')
  if (!text.trim()) return ''
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

function renderPre(element: Element, context: Context): string {
  const text = textOf(element, true).replace(/^\n+|\s+$/g, '')
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  const code = element.children.find((child): child is Element => typeof child !== 'string' && child.tag === 'code')
  const classes = `${element.attrs.class ?? ''} ${code?.attrs.class ?? ''}`
  const language = /(?:^|\s)(?:language|lang)-([\w+-]{1,20})(?:\s|$)/.exec(classes)?.[1] ?? ''
  context.pres.push(`${fence}${language}\n${text}\n${fence}`)
  return `${PARA}${PRE}${context.pres.length - 1}${PRE}${PARA}`
}

function renderList(element: Element, context: Context, ordered: boolean): string {
  let number = Math.min(Math.max(Number.parseInt(element.attrs.start ?? '1', 10) || 1, 0), 999_999_999)
  const items: string[] = []
  for (const child of element.children) {
    if (typeof child === 'string' && !child.trim()) continue
    const nested = typeof child !== 'string' && (child.tag === 'ul' || child.tag === 'ol')
    const body = typeof child !== 'string' && child.tag === 'li' ? child.children : [child]
    const content = finalize(renderChildren(body, context), context, false).replace(/\n{2,}(?=\u0004)/g, '\n')
    if (!content) continue
    if (nested && items.length) {
      const indent = ' '.repeat(items[items.length - 1]!.indexOf(' ') + 1 - KEEP.length)
      items[items.length - 1] += `\n${content.split('\n').map((line) => (line ? indent + line : line)).join('\n')}`
      continue
    }
    const marker = ordered ? `${number++}. ` : '- '
    const [first, ...rest] = content.split('\n')
    const indent = ' '.repeat(marker.length)
    items.push([`${KEEP}${marker}${first}`, ...rest.map((line) => (line ? indent + line : line))].join('\n'))
  }
  return items.length ? `${PARA}${items.join('\n')}${PARA}` : ''
}

function renderNode(node: Node, context: Context): string {
  if (typeof node === 'string') return escapeText(node.replace(/[ \t\n\r\f\v]+/g, ' '))
  const { tag } = node
  const children = () => renderChildren(node.children, context)
  if (tag === 'br') return BREAK
  if (tag === 'p') return `${PARA}${renderChildren(withoutTrailingBreaks(node.children), context)}${PARA}`
  if (BLOCKS.has(tag)) return `${BLOCK}${renderChildren(withoutTrailingBreaks(node.children), context)}${BLOCK}`
  if (tag === 'li') return renderList({ tag: 'ul', attrs: {}, children: [node] }, context, false)
  if (tag === 'ul' || tag === 'ol') return renderList(node, context, tag === 'ol')
  if (tag === 'pre') return renderPre(node, context)
  if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') return renderInlineCode(node)
  if (tag === 'tr') {
    const cells = node.children.map((cell) => renderNode(cell, context).trim()).filter(Boolean)
    return `${BLOCK}${cells.join(' | ')}${BLOCK}`
  }
  if (/^h[1-6]$/.test(tag)) {
    const text = finalize(children(), context, false).replace(/\s*\n\s*/g, ' ')
    return text ? `${PARA}${KEEP}${'#'.repeat(Number(tag[1]))} ${text}${PARA}` : ''
  }
  if (tag === 'hr') return `${PARA}${KEEP}***${PARA}`
  if (tag === 'blockquote') {
    const text = finalize(children(), context, false)
    return text ? `${PARA}${text.split('\n').map((line) => `${KEEP}>${line ? ` ${line}` : ''}`).join('\n')}${PARA}` : ''
  }
  if (tag === 'b' || tag === 'strong') {
    if (context.bold) return children()
    context.bold = true
    const inner = children()
    context.bold = false
    return wrapInline(inner, '**')
  }
  if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'dfn') {
    if (context.italic) return children()
    context.italic = true
    const inner = children()
    context.italic = false
    return wrapInline(inner, '*')
  }
  if (tag === 'audio') {
    const source = node.children.find((child): child is Element => typeof child !== 'string' && child.tag === 'source')
    const src = (node.attrs.src ?? source?.attrs.src ?? '').trim()
    const url = src ? (context.sound?.(src) ?? null) : null
    if (!url) {
      context.sounds++
      return ''
    }
    return `${BLOCK}[audio](${encodeUrl(url)})${BLOCK}`
  }
  if (tag === 'img') {
    const src = node.attrs.src ?? ''
    const url = src ? (context.image?.(src) ?? null) : null
    if (!url) {
      context.images++
      return ''
    }
    const alt = escapeText((node.attrs.alt ?? '').replace(/\s+/g, ' ').trim())
    return /^https?:/i.test(url) ? `[${alt || 'image'}](${encodeUrl(url)})` : `![${alt}](${encodeUrl(url)})`
  }
  if (tag === 'a') {
    const inner = children()
    const href = (node.attrs.href ?? '').trim()
    if (!/^(https?:\/\/|mailto:)/i.test(href) || /[\u0001-\u0006\n]/.test(inner)) return inner
    return `[${inner.trim() || escapeText(href)}](${encodeUrl(href)})`
  }
  return children()
}

function escapeLineStart(line: string): string {
  const [, indent = '', rest = ''] = /^( *)([\s\S]*)$/.exec(line) ?? []
  if (rest.startsWith(KEEP) || rest.startsWith(PRE)) return line
  if (/^(#{1,6}(\s|$)|>|[-+](\s|$)|-+\s*$|=+\s*$|~~~)/.test(rest)) return `${indent}\\${rest}`
  const number = /^(\d{1,9})([.)])(\s|$)/.exec(rest)
  return number ? `${indent}${number[1]}\\${rest.slice(number[1]!.length)}` : line
}

function finalize(source: string, context: Context, top: boolean): string {
  let text = source.replace(/[ \t]*[\u0001-\u0003][\u0001-\u0003 \t]*/g, (run) => {
    const breaks = run.split(BREAK).length - 1
    const lines = run.includes(PARA) ? 2 : Math.min(2, breaks + (run.includes(BLOCK) ? 1 : 0))
    return '\n'.repeat(Math.max(1, lines))
  })
  text = text
    .split('\n')
    .map((line) => escapeLineStart(line.replace(/(\S) {2,}/g, '$1 ').trimEnd()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
  if (!top) return text
  text = text.replace(/^(.*?)\u0006(\d+)\u0006/gm, (_match, prefix: string, index: string) => {
    const indent = ' '.repeat(prefix.replaceAll(KEEP, '').length)
    const [first, ...rest] = (context.pres[Number(index)] ?? '').split('\n')
    return [prefix + first, ...rest.map((line) => (line ? indent + line : line))].join('\n')
  })
  return text.replaceAll(KEEP, '')
}

export function htmlToMarkdown(html: string, options: HtmlToMarkdownOptions = {}): HtmlToMarkdownResult {
  // A `[sound:x]` tag is an `<audio>` element from here on, so both are handled in one place.
  let source = html.replace(
    /\[sound:([^\]]*)\]/g,
    (_tag, name: string) => `<audio src="${name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"></audio>`,
  )
  const videos = (source.match(/<video\b/gi) ?? []).length
  source = source
    .replace(/<!--[\s\S]*?(-->|$)|<!\[CDATA\[[\s\S]*?(\]\]>|$)|<![^>]*>|<\?[^>]*>/g, '')
    .replace(new RegExp(`<(${DROPPED})\\b[^>]*>[\\s\\S]*?</\\1\\s*>`, 'gi'), '')
    .replace(/<(script|style)\b[\s\S]*$/i, '')
    .replace(/[\u0000-\u0008\u000b\u000e-\u001f]/g, '')
  const context: Context = { ...options, pres: [], images: 0, sounds: 0, bold: false, italic: false }
  const markdown = finalize(renderNode(parse(source), context), context, true)
  return { markdown, sounds: context.sounds, videos, images: context.images }
}
