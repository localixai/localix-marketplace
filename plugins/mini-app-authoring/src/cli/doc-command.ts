import { existsSync, promises as fs } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { PLUGIN_BUILD_SKILL } from '../kit/kit'
import { UserError } from '../lib/errors'
import type { Command } from './context'

/**
 * `mini-app doc`: the build skill, printed. The skill is the plugin's knowledge of how to build a
 * mini app — its SKILL.md routes a task to a reference (`references/<topic>.md`) and to a working
 * example app (`examples/<name>/`). Claude Code reads those files from the skill's folder; an agent
 * inside Localix may not be allowed to read outside the project, but it may always run `mini-app`,
 * so every file prints here by the same name.
 *
 * - `mini-app doc` — the skill, then each topic and example with its first line;
 * - `mini-app doc <topic>` — one reference;
 * - `mini-app doc <example>` — its README and the files to print next;
 * - `mini-app doc <example>/<path>` — one file of it.
 */

const REFERENCES = 'references'
const EXAMPLES = 'examples'
/** What a check writes into an example and nobody should copy. */
const GENERATED = /^(?:dist\/|node_modules\/|KIT\.md$|tsconfig\.json$)/u

const stripFrontMatter = (text: string) => text.replace(/^---\n[\s\S]*?\n---\n+/u, '')

/** A file's first sentence: a reference opens with when to read it, a README after its title. */
function firstLine(text: string): string {
  const paragraph = stripFrontMatter(text)
    .split(/\n\s*\n/u)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#'))
  const prose = (paragraph ?? '').replace(/\s+/gu, ' ')
  return /^(.*?[.!?])(?:\s|$)/u.exec(prose)?.[1] ?? prose
}

async function names(dir: string, keep: (name: string) => boolean): Promise<string[]> {
  return existsSync(dir) ? (await fs.readdir(dir)).filter(keep).sort() : []
}

async function filesOf(dir: string, base = dir): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    const rel = relative(base, path)
    if (GENERATED.test(entry.isDirectory() ? `${rel}/` : rel)) continue
    if (entry.isDirectory()) out.push(...(await filesOf(path, base)))
    else out.push(rel)
  }
  return out.sort()
}

/** The topics and examples, each `mini-app doc <name> — <first line>`. */
async function index(skillDir: string): Promise<string[]> {
  const topics = await names(join(skillDir, REFERENCES), (n) => n.endsWith('.md'))
  const examples = await names(join(skillDir, EXAMPLES), (n) =>
    existsSync(join(skillDir, EXAMPLES, n, 'README.md')),
  )
  const line = async (name: string, file: string) =>
    `  mini-app doc ${name} — ${firstLine(await fs.readFile(file, 'utf8'))}`
  return [
    'References:',
    ...(await Promise.all(
      topics.map((t) => line(t.replace(/\.md$/u, ''), join(skillDir, REFERENCES, t))),
    )),
    'Examples (working apps; copy from them):',
    ...(await Promise.all(
      examples.map((e) => line(e, join(skillDir, EXAMPLES, e, 'README.md'))),
    )),
  ]
}

export const docCommand: Command = async (args, context) => {
  const skillDir = context.skillDir ?? PLUGIN_BUILD_SKILL
  const [name] = args.positional
  if (!name) {
    const skill = stripFrontMatter(await fs.readFile(join(skillDir, 'SKILL.md'), 'utf8')).trimEnd()
    context.out([skill, '', ...(await index(skillDir))].join('\n'))
    return 0
  }

  const reference = join(skillDir, REFERENCES, `${name}.md`)
  if (!name.includes('/') && existsSync(reference)) {
    context.out((await fs.readFile(reference, 'utf8')).trimEnd())
    return 0
  }

  const examples = resolve(skillDir, EXAMPLES)
  const path = resolve(examples, name)
  const inside = relative(examples, path)
  if (!inside.startsWith('..') && existsSync(path) && !GENERATED.test(inside.replace(/^[^/]+\//u, ''))) {
    const stat = await fs.stat(path)
    if (stat.isFile()) {
      context.out(`// ${name}\n${(await fs.readFile(path, 'utf8')).trimEnd()}`)
      return 0
    }
    if (!inside.includes('/') && existsSync(join(path, 'README.md'))) {
      const readme = (await fs.readFile(join(path, 'README.md'), 'utf8')).trimEnd()
      const files = (await filesOf(path)).filter((file) => file !== 'README.md')
      context.out(
        [readme, '', 'Its files, each printed by:', ...files.map((f) => `  mini-app doc ${name}/${f}`)].join('\n'),
      )
      return 0
    }
  }
  throw new UserError(
    `No topic or example "${name}". \`mini-app doc\` lists them:\n${(await index(skillDir)).join('\n')}`,
  )
}
