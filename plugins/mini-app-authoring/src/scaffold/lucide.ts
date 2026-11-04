import { existsSync, promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

import { UserError } from '../lib/errors'

/**
 * A lucide icon's shapes by its name, from the lucide-react the kit vendors for the screen — the
 * same icons a mini app's UI imports, so the store tile can match the app's own. Each icon module
 * keeps its 24×24 shapes as data (`__iconData.node`: `[tag, attributes]` pairs) and its old names in
 * `aliases`; a name that is only an alias has no module of its own.
 */

const ICONS = 'ui/vendor/lucide-react/dist/esm/icons'

/** A bare lucide name (`house`, `chart-column`), as opposed to markup or a file path. */
export const isLucideName = (glyph: string) => /^[a-z][a-z0-9-]*$/u.test(glyph)

type IconNode = [tag: string, attributes: Record<string, string>][]

/** The shapes in an icon module, read as text; an old name's module re-exports the icon's. */
async function iconNode(file: string, seen = 0): Promise<IconNode> {
  const text = await fs.readFile(file, 'utf8')
  const target = /export \{ default \} from '\.\/([a-z0-9-]+\.mjs)'/u.exec(text)?.[1]
  if (target && !text.includes('__iconData') && seen < 3) {
    return iconNode(join(dirname(file), target), seen + 1)
  }
  const node = /node: (\[[\s\S]*?\]),?\n\s*(?:aliases|\})/u.exec(text)?.[1]
  if (!node) throw new UserError(`${file} holds no lucide icon data.`)
  // The node is a JS literal of strings and plain objects: quote its keys and parse it as JSON.
  return JSON.parse(node.replace(/([{,]\s*)([a-zA-Z][\w-]*)\s*:/gu, '$1"$2":')) as IconNode
}

/** The module whose `aliases` name `name`, read only when no module is named so. */
async function aliasFile(dir: string, name: string): Promise<string | null> {
  const alias = `"${name}"`
  for (const file of await fs.readdir(dir)) {
    if (!file.endsWith('.mjs')) continue
    const text = await fs.readFile(join(dir, file), 'utf8')
    const aliases = /aliases: \[([^\]]*)\]/u.exec(text)?.[1]
    if (aliases?.includes(alias)) return join(dir, file)
  }
  return null
}

/** The icon's shapes as SVG markup, `<path d="…"/>…`, ready for `drawIcon`. */
export async function lucideGlyph(kitDir: string, name: string): Promise<string> {
  const dir = join(kitDir, ICONS)
  const own = join(dir, `${name}.mjs`)
  const file = existsSync(own) ? own : existsSync(dir) ? await aliasFile(dir, name) : null
  if (!file) {
    throw new UserError(
      `No lucide icon "${name}" in this kit. Use a name from lucide.dev/icons (the ones the screen imports from lucide-react, in kebab case), or give the glyph as markup: --glyph '<path d="…"/>'.`,
    )
  }
  return (await iconNode(file))
    .map(([tag, { key: _key, ...attributes }]) => {
      const attrs = Object.entries(attributes).map(([k, v]) => `${k}="${v}"`)
      return `<${tag} ${attrs.join(' ')}/>`
    })
    .join('')
}
