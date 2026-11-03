import { existsSync, promises as fs } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { PLUGIN_PATTERNS } from '../kit/kit'
import { UserError } from '../lib/errors'
import type { Command } from './context'

/**
 * `mini-app pattern`: working screens to start from. The plugin ships a gallery — a mini app of its
 * own, checked against every kit like the template — with one file per pattern (a page frame, a
 * board, master-detail, a data table, a form dialog, a dashboard, the loading/empty/error states)
 * and the formatting helpers they share. Described in prose, an agent built thin screens: narrow
 * fixed columns, raw `12000`, "1 deals", one state for all three. Printed, it copies a screen that
 * already passes `mini-app check` and renames its domain.
 *
 * A pattern is `ui/patterns/<name>.tsx`, printed with its `<name>-*.tsx` parts and its
 * `<name>.dom.test.tsx`, then names the gallery files they import, each printed by its path;
 * `format` is `ui/format.ts` with its test. A file's first doc comment says what it is for.
 */

const PATTERNS = 'ui/patterns'
const FORMAT = 'format'

interface Pattern {
  name: string
  summary: string
  /** The files printed, relative to the gallery: the pattern, its parts, then its tests. */
  files: string[]
}

/**
 * What a file is for: the first sentence of its first doc comment (`/** … *\/`, wherever it sits —
 * the gallery puts it on the export, after the imports), else of its leading `//` lines, without a
 * `NAME — ` label.
 */
function summaryOf(source: string): string {
  const doc = /\/\*\*([\s\S]*?)\*\//u.exec(source)?.[1]
  const lines = doc
    ? doc.split('\n').map((line) => line.replace(/^\s*\*\s?/u, ''))
    : (/^(?:\s*\/\/.*\n?)+/u.exec(source)?.[0] ?? '').split('\n').map((line) => line.replace(/^\s*\/\/\s?/u, ''))
  const prose = lines.join(' ').replace(/\s+/gu, ' ').trim().replace(/^[A-Z][A-Z -]+ — /u, '')
  return /^(.*?[.!?])(?:\s|$)/u.exec(prose)?.[1] ?? prose
}

async function readGallery(dir: string): Promise<Pattern[]> {
  const names = existsSync(join(dir, PATTERNS)) ? await fs.readdir(join(dir, PATTERNS)) : []
  // `test-*` files are helpers the patterns' tests share, printed with a test that imports them.
  const sources = names.filter(
    (file) => /\.tsx?$/u.test(file) && !/\.test\.tsx?$/u.test(file) && !file.startsWith('test-'),
  )
  const isPart = (file: string) =>
    sources.some((other) => other !== file && file.startsWith(`${other.replace(/\.tsx?$/u, '')}-`))
  const patterns: Pattern[] = []
  for (const file of sources.filter((source) => !isPart(source)).sort()) {
    const name = file.replace(/\.tsx?$/u, '')
    const parts = sources.filter((other) => other.startsWith(`${name}-`)).sort()
    const tests = names.filter((other) => other.startsWith(`${name}.`) && /\.test\.tsx?$/u.test(other))
    patterns.push({
      name,
      summary: summaryOf(await fs.readFile(join(dir, PATTERNS, file), 'utf8')),
      files: [file, ...parts, ...tests.sort()].map((part) => `${PATTERNS}/${part}`),
    })
  }
  const format = `ui/${FORMAT}.ts`
  if (existsSync(join(dir, format)))
    patterns.push({
      name: FORMAT,
      summary: summaryOf(await fs.readFile(join(dir, format), 'utf8')),
      files: [format, `ui/${FORMAT}.test.ts`].filter((file) => existsSync(join(dir, file))),
    })
  return patterns
}

const LOCAL_IMPORT = /(?:from|import)\s+'(\.{1,2}\/[^']+)'/gu

/** The gallery file a relative specifier names, tried as written, then as .ts, .tsx, /index.ts. */
function resolveLocal(dir: string, from: string, specifier: string): string | null {
  const base = join(dirname(join(dir, from)), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')])
    if (existsSync(candidate) && /\.tsx?$/u.test(candidate)) return relative(dir, candidate)
  return null
}

/**
 * The gallery files `files` import, then what those import, once each and not `files` themselves:
 * the formatting helpers, the shared model, the test helpers. Printed in full with every pattern
 * they were most of each print, read again for each; named, the agent prints each once by path.
 */
async function importsOf(dir: string, files: string[]): Promise<string[]> {
  const seen = new Set(files)
  const found: string[] = []
  const queue = [...files]
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    const text = await fs.readFile(join(dir, file), 'utf8')
    for (const [, specifier] of text.matchAll(LOCAL_IMPORT)) {
      const target = resolveLocal(dir, file, specifier!)
      if (target && !seen.has(target)) {
        seen.add(target)
        found.push(target)
        queue.push(target)
      }
    }
  }
  return found
}

const print = async (dir: string, file: string) =>
  `// ${file}\n${(await fs.readFile(join(dir, file), 'utf8')).trimEnd()}`

/** A gallery file named by its path: inside the gallery, a source file. */
function galleryFile(dir: string, name: string): string | null {
  const path = resolve(dir, name)
  const inside = relative(dir, path)
  if (inside.startsWith('..') || !/\.tsx?$/u.test(path) || !existsSync(path)) return null
  return inside
}

export const patternCommand: Command = async (args, context) => {
  const dir = context.patternsDir ?? PLUGIN_PATTERNS
  const patterns = await readGallery(dir)
  const [name] = args.positional
  if (!name) {
    context.out(
      [
        'Working screens to start from: `mini-app pattern <name>` prints one whole, with its test. Copy it into the app, rename the domain, keep the structure.',
        ...patterns.map((pattern) => `  ${pattern.name} — ${pattern.summary}`),
      ].join('\n'),
    )
    return 0
  }
  const pattern = patterns.find((candidate) => candidate.name === name)
  if (!pattern) {
    const file = galleryFile(dir, name)
    if (!file)
      throw new UserError(
        `No pattern "${name}". There are: ${patterns.map((candidate) => candidate.name).join(', ')}; a file they import prints by its path.`,
      )
    context.out(await print(dir, file))
    return 0
  }
  const own = await Promise.all(pattern.files.map((file) => print(dir, file)))
  const imports = await importsOf(dir, pattern.files)
  const uses = await Promise.all(
    imports.map(async (file) => {
      const summary = summaryOf(await fs.readFile(join(dir, file), 'utf8'))
      return `  mini-app pattern ${file}${summary ? ` — ${summary}` : ''}`
    }),
  )
  context.out(
    [
      own.join('\n\n'),
      ...(uses.length
        ? [
            '',
            'It imports from the gallery — print each once (they are shared by every pattern), then keep them as the app\'s own: shared/model.ts becomes the app\'s model.',
            ...uses,
          ]
        : []),
    ].join('\n'),
  )
  return 0
}
