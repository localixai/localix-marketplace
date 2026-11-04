import { decodeEntities } from './html-entities'

/**
 * Anki's card templates, rendered the way Anki does it, as far as an import needs: the question and
 * answer sides of one card as HTML. A template is data, never code: it is tokenised, sections nest,
 * and every name that is not a field, a special field or a known filter falls back to the field.
 *
 * Supported: `{{Field}}`, `{{FrontSide}}`, the specials `Tags`, `Deck`, `Subdeck`, `Card`, `Type`,
 * sections `{{#F}}…{{/F}}` (field filled) and `{{^F}}…{{/F}}` (field empty), comments `{{! … }}`
 * and the filters `text`, `hint`, `furigana`, `kana`, `kanji`, `cloze`, `type` and `tts…`.
 */

export interface RenderOptions {
  /** The rendered question, for `{{FrontSide}}` on the answer side. */
  frontSide?: string
  /** Values of the specials (`Tags`, `Deck`, …); the rest are empty. */
  special?: Record<string, string>
}

export interface Rendered {
  html: string
  /** The fields a `{{type:…}}` asked the person to type; their places render nothing. */
  typed: string[]
}

interface Ref {
  field: string
  filters: string[]
}
interface Section {
  name: string
  inverted: boolean
  children: Node[]
}
type Node = string | Ref | Section

const TOKEN = /\{\{([^{}]*)\}\}/g
const SPECIAL = new Set(['Tags', 'Deck', 'Subdeck', 'Card', 'Type', 'CardFlag'])

function parse(format: string): Node[] {
  const root: Section = { name: '', inverted: false, children: [] }
  const stack = [root]
  const top = () => stack[stack.length - 1]!
  let last = 0
  for (const match of format.matchAll(TOKEN)) {
    if (match.index > last) top().children.push(format.slice(last, match.index))
    last = match.index + match[0].length
    const body = match[1]!.trim()
    const mark = body[0]
    if (mark === '!') continue
    if (mark === '#' || mark === '^') {
      const section: Section = { name: body.slice(1).trim(), inverted: mark === '^', children: [] }
      top().children.push(section)
      stack.push(section)
    } else if (mark === '/') {
      const name = body.slice(1).trim()
      const open = stack.findLastIndex((section) => section.name === name)
      if (open > 0) stack.length = open
    } else {
      const parts = body.split(':').map((part) => part.trim())
      top().children.push({ field: parts.pop() ?? '', filters: parts })
    }
  }
  if (last < format.length) top().children.push(format.slice(last))
  return root.children
}

/** Whether a field holds something to show: text, a picture or a sound. */
function filled(value: string | undefined): boolean {
  if (!value) return false
  if (/<img\b|<audio\b|<video\b|\[sound:/i.test(value)) return true
  return decodeEntities(value.replace(/<[^>]*>/g, '')).replace(/[\s ]+/g, '') !== ''
}

const READING = /([^\s[\]<>]+)\[(?!sound:)([^\]]*)\]/g

function applyFilter(filter: string, value: string): string {
  const name = filter.toLowerCase()
  if (name === 'text') return value.replace(/<[^>]*>/g, '')
  if (name === 'kanji') return value.replace(/\[(?!sound:)[^\]]*\]/g, '')
  if (name === 'kana') return value.replace(READING, '$2')
  if (name === 'furigana') return value.replace(READING, '$1($2)')
  // hint, cloze (the marks stay), tts and every filter we do not know show the field itself.
  return value
}

function renderNodes(
  nodes: Node[],
  fields: Record<string, string>,
  options: RenderOptions,
  typed: string[],
): string {
  let out = ''
  for (const node of nodes) {
    if (typeof node === 'string') out += node
    else if ('children' in node) {
      if (filled(fields[node.name]) !== node.inverted)
        out += renderNodes(node.children, fields, options, typed)
    } else if (node.filters.some((filter) => filter.toLowerCase() === 'type')) {
      if (node.field && !typed.includes(node.field)) typed.push(node.field)
    } else {
      let value =
        node.field === 'FrontSide'
          ? (options.frontSide ?? '')
          : SPECIAL.has(node.field)
            ? (options.special?.[node.field] ?? '')
            : (fields[node.field] ?? '')
      for (const filter of node.filters.toReversed()) value = applyFilter(filter, value)
      out += value
    }
  }
  return out
}

/** One side of a card: the template with the note's fields in it. */
export function renderCard(
  format: string,
  fields: Record<string, string>,
  options: RenderOptions = {},
): Rendered {
  const typed: string[] = []
  return { html: renderNodes(parse(format), fields, options, typed), typed }
}

/** The field a cloze template shows, `{{cloze:Text}}` → "Text"; `null` when it names none. */
export function clozeFieldOf(format: string): string | null {
  const found = /\{\{(?:[^{}:]+:)*cloze:(?:[^{}:]+:)*([^{}:]+)\}\}/.exec(format)
  return found ? found[1]!.trim() : null
}

/** The visible words of some HTML, one line: no tags, comments or sounds. */
export function wordsOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\[sound:[^\]]*\]/g, '')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/[\s ]+/g, ' ')
    .trim()
}

const ANSWER_RULE = /<hr\s+id\s*=\s*["']?answer["']?[^>]*>/i
const ANY_RULE = /<hr\b[^>]*>/i

/**
 * What the answer side shows after the question: the part past `<hr id=answer>`, or, when the
 * answer begins by repeating the question's words and an `<hr>` follows, the part past that rule.
 * Otherwise the whole answer is new.
 */
export function answerPart(question: string, answer: string): string {
  const marked = ANSWER_RULE.exec(answer)
  if (marked) return answer.slice(marked.index + marked[0].length)
  const rule = ANY_RULE.exec(answer)
  const asked = wordsOf(question)
  if (rule && asked && wordsOf(answer.slice(0, rule.index)).startsWith(asked)) {
    return answer.slice(rule.index + rule[0].length)
  }
  return answer
}
