import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { API_FILE } from '../kit/api-doc'
import { UserError } from '../lib/errors'
import type { Command } from './context'

/**
 * `mini-app api`: what a kit module exports, with its types — the props of every kit control, the
 * signature of every SDK call — read from the `API.md` the kit carries. The printed contract names
 * the calls a typical app makes; a screen with tables, dialogs, charts or several views needs the
 * rest, and an agent told to look only at the printed text guessed props or went searching the
 * disk for declarations it may not read. This is one command its permissions already allow.
 *
 * `API.md` holds a `## module <specifier>` section per module and a `### <export>` heading per
 * export, each followed by its declaration.
 */

const MODULE_HEADING = '## module '
const EXPORT_HEADING = '### '
const MAX_MATCHES = 40

interface ApiModule {
  specifier: string
  /** The section as written, from its heading to the next module's. */
  text: string
  exports: { name: string; text: string }[]
}

function parseApi(markdown: string): ApiModule[] {
  const modules: ApiModule[] = []
  let current: ApiModule | null = null
  let exported: { name: string; lines: string[] } | null = null
  let lines: string[] = []
  const closeExport = () => {
    if (current && exported)
      current.exports.push({ name: exported.name, text: exported.lines.join('\n').trimEnd() })
    exported = null
  }
  const closeModule = () => {
    closeExport()
    if (current) current.text = lines.join('\n').trimEnd()
    current = null
    lines = []
  }
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      closeModule()
      if (!line.startsWith(MODULE_HEADING)) continue
      current = { specifier: line.slice(MODULE_HEADING.length).trim(), text: '', exports: [] }
      modules.push(current)
    }
    if (!current) continue
    lines.push(line)
    if (line.startsWith(EXPORT_HEADING)) {
      closeExport()
      exported = { name: line.slice(EXPORT_HEADING.length).trim(), lines: [] }
    }
    exported?.lines.push(line)
  }
  closeModule()
  return modules
}

/** A module by its specifier, or by the part after the scope (`kit/dialog`, `ui/table`, `dialog`). */
function findModule(modules: ApiModule[], name: string): ApiModule | undefined {
  const exact = modules.find((module) => module.specifier === name)
  if (exact) return exact
  const tails = modules.filter((module) => module.specifier.endsWith(`/${name}`))
  // `table` names `@localixai/mini-app-sdk/ui/table`; a name two modules end with is a search.
  return tails.length === 1 ? tails[0] : undefined
}

const otherNames = (module: ApiModule, shown: string) =>
  module.exports.map((entry) => entry.name).filter((name) => name !== shown)

/** The other exports a declaration names (its props type), as the commands that print them. */
function relatedTypes(module: ApiModule, entry: { name: string; text: string }): string[] {
  const short = module.specifier.replace(/^@localixai\/(?:mini-app-sdk\/)?/u, '')
  return otherNames(module, entry.name)
    .filter((name) => new RegExp(`\\b${name}\\b`, 'u').test(entry.text))
    .map((name) => `mini-app api ${short} ${name}`)
}

function printExport(module: ApiModule, entry: { name: string; text: string }): string {
  const related = relatedTypes(module, entry)
  return [
    `## module ${module.specifier}`,
    '',
    entry.text,
    ...(related.length ? ['', `Types it names: ${related.join('; ')}`] : []),
  ].join('\n')
}

/** The modules that export `name`, the narrowest first: `ui/components` says more than `ui`. */
function narrowestFirst(modules: ApiModule[], name: string): ApiModule[] {
  const depth = (module: ApiModule) => module.specifier.split('/').length
  return modules
    .filter((candidate) => candidate.exports.some((entry) => entry.name === name))
    .sort((a, b) => depth(b) - depth(a))
}

async function readApi(kitDir: string): Promise<ApiModule[]> {
  const text = await fs.readFile(join(kitDir, API_FILE), 'utf8').catch(() => null)
  if (text === null) {
    throw new UserError(
      `The kit at ${kitDir} documents no API (${API_FILE} is missing): \`mini-app kit --update\` installs a newer release's kit.`,
    )
  }
  return parseApi(text)
}

export const apiCommand: Command = async (args, context) => {
  const { kit } = await context.kit()
  const modules = await readApi(kit.dir)
  const [name, exportName] = args.positional
  if (!name) {
    context.out(
      [
        `${modules.length} modules; \`mini-app api <module>\` prints one with its types, \`mini-app api <module> <export>\` one export, \`mini-app api <word>\` finds names.`,
        ...modules.map((module) => module.specifier),
      ].join('\n'),
    )
    return 0
  }

  const module = findModule(modules, name)
  if (module && !exportName) {
    context.out(module.text)
    return 0
  }
  if (module && exportName) {
    const entry = module.exports.find((candidate) => candidate.name === exportName)
    if (entry) {
      context.out(printExport(module, entry))
      return 0
    }
    // Asked of a neighbour (`backend callTool` is `backend/testing`'s): show it where it is.
    const owner = narrowestFirst(modules, exportName)[0]
    if (!owner) {
      throw new UserError(
        `${module.specifier} exports no ${exportName}, and no other module does; it exports ${module.exports.map((e) => e.name).join(', ')}.`,
      )
    }
    context.out(
      [
        `${module.specifier} exports no ${exportName}; it is in ${owner.specifier}.`,
        '',
        printExport(
          owner,
          owner.exports.find((candidate) => candidate.name === exportName)!,
        ),
      ].join('\n'),
    )
    return 0
  }

  // An export named alone: a module that exports it, and where else it comes from.
  const exporting = narrowestFirst(modules, name)
  if (exporting.length) {
    const [first, ...rest] = exporting
    const entry = first!.exports.find((candidate) => candidate.name === name)!
    context.out(
      [
        printExport(first!, entry),
        ...(rest.length
          ? ['', `Also exported by ${rest.map((other) => other.specifier).join(', ')}.`]
          : []),
      ].join('\n'),
    )
    return 0
  }

  const word = name.toLowerCase()
  const matches = modules.flatMap((candidate) => {
    const names = candidate.exports
      .map((entry) => entry.name)
      .filter((exported) => exported.toLowerCase().includes(word))
    if (!names.length && !candidate.specifier.toLowerCase().includes(word)) return []
    return [names.length ? `${candidate.specifier}: ${names.join(', ')}` : candidate.specifier]
  })
  if (!matches.length) {
    context.out(
      `Nothing in the kit is named like "${name}". \`mini-app api\` lists every module; KIT.md says which one does a job.`,
    )
    return 1
  }
  context.out(
    [
      ...matches.slice(0, MAX_MATCHES),
      ...(matches.length > MAX_MATCHES
        ? [`… ${matches.length - MAX_MATCHES} more; name the module to narrow it.`]
        : []),
    ].join('\n'),
  )
  return 0
}
