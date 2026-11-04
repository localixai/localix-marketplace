import { mkdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, resolve } from 'node:path'
import { z } from 'zod'
import { describeImportResult, describePreview } from '../../shared/describe'
import { countOf } from '../../shared/format'
import { exportFormatSchema } from '../../shared/payloads-more'
import { invalid } from '../errors'
import { exportCollection, parseImport } from '../import'
import { MAX_UPLOAD_BYTES } from '../routes-files'
import { findDeck, run, type ToolDeps } from './common'

/** Importing a file by its path, and exporting the collection to one. */

/** A path the agent gives: absolute, `~/…`, or relative to the project folder. */
export function resolvePath(cwd: string, path: string): string {
  const trimmed = path.trim()
  if (trimmed === '~' || trimmed.startsWith('~/')) return resolve(homedir(), trimmed.slice(2))
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(cwd, trimmed)
}

const pathField = z.string().trim().min(1).max(4096)
const EXTENSIONS = { json: 'json', csv: 'csv', markdown: 'md' } as const

export function fileTools(deps: ToolDeps) {
  const { ctx, service } = deps
  const pathOf = (input: unknown) => {
    const path = (input as { path?: unknown })?.path
    return typeof path === 'string' && path.trim() ? [resolvePath(ctx.cwd, path)] : []
  }
  return [
    ctx.defineTool({
      name: 'recall_import_file',
      label: 'Import a file',
      activeVerb: 'Importing',
      description:
        'Import an Anki .apkg/.colpkg, a CSV/TSV, a Markdown Q:/A: file or a Recall JSON backup by its path. With dryRun it only previews (counts, decks, duplicates, warnings); otherwise it imports and answers with what it did.',
      inputSchema: z.object({
        path: pathField.describe('The file: absolute, ~/…, or relative to the project folder.'),
        deck: z.string().optional().describe('Put every note in this existing deck (id or name). Leave out to use the file\'s decks (none → Inbox).'),
        draft: z.boolean().optional().describe('true (default): drafts the person accepts on the screen; false: ready to study.'),
        keepProgress: z.boolean().optional().describe('Keep the file\'s review history (default true).'),
        dryRun: z.boolean().optional().describe('Only preview; change nothing.'),
      }),
      executionMode: 'sequential',
      mutates: true,
      classify: (input: unknown) =>
        (input as { dryRun?: boolean })?.dryRun ? { effect: 'read' as const } : { effect: 'host' as const },
      permissionPaths: pathOf,
      async execute(_id, input) {
        return run(async () => {
          const path = resolvePath(ctx.cwd, input.path)
          const info = await stat(path).catch(() => null)
          if (!info?.isFile()) throw invalid(`There is no file at ${path}.`)
          if (info.size > MAX_UPLOAD_BYTES) throw invalid('That file is larger than 512 MB.')
          let deckId: string | undefined
          if (input.deck) {
            const deck = findDeck(service, input.deck)
            if (!deck) throw invalid(`No deck is called "${input.deck}"; leave deck out to use the file's decks, or make it with recall_save_deck.`)
            deckId = deck.id
          }
          const bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
          const batch = await parseImport({ name: path.split('/').pop() ?? path, bytes, mediaDir: service.core.mediaDir })
          if (input.dryRun) return `Preview (nothing imported):\n${describePreview(service.previewImport(batch))}`
          const result = await service.commitImport(batch, {
            deckId,
            status: input.draft === false ? 'active' : 'draft',
            keepProgress: input.keepProgress ?? true,
          })
          const next = result.status === 'draft' && result.added ? '\nNext: offer to review the drafts on the Recall screen.' : ''
          return describeImportResult(result) + next
        })
      },
    }),
    ctx.defineTool({
      name: 'recall_export',
      label: 'Export cards',
      activeVerb: 'Exporting',
      description:
        'Write the whole collection to a file: json (a full backup with progress, imports back losslessly), csv or markdown. Answers with the path and counts.',
      inputSchema: z.object({
        format: exportFormatSchema.describe('json (full backup), csv or markdown.'),
        path: pathField.describe('Where to write: a file path, or a folder (a dated name is added). Absolute, ~/… or relative to the project folder.'),
      }),
      executionMode: 'sequential',
      mutates: true,
      classify: () => ({ effect: 'files' as const }),
      permissionPaths: pathOf,
      async execute(_id, input) {
        return run(async () => {
          const data = service.exportData()
          let path = resolvePath(ctx.cwd, input.path)
          if ((await stat(path).catch(() => null))?.isDirectory()) {
            path = resolve(path, `recall-${data.exportedAt.slice(0, 10)}.${EXTENSIONS[input.format]}`)
          }
          const text = exportCollection(data, input.format)
          await mkdir(dirname(path), { recursive: true })
          await writeFile(path, text)
          return `Exported ${countOf(data.notes.length, 'note')}, ${countOf(data.cards.length, 'card')} and ${countOf(data.reviews.length, 'answer')} as ${input.format} to ${path}.`
        })
      },
    }),
  ]
}
