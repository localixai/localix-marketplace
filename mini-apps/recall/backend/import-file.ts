import { readFile, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute } from 'node:path'
import { invalid, RecallError } from './errors'
import { parseImport, type ImportBatch } from './import'
import type { Service } from './service'

/**
 * Reading an import from a path on this computer: the screen opened an Anki file as a file tab, and
 * the agent's tool names a path. Both come here, so a path is judged the same way: full, a file, not
 * too big, and a kind of file Recall imports.
 */

/** The largest file an import accepts, uploaded or read from a path. */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024

const IMPORT_EXTENSIONS = new Set([
  '.apkg',
  '.colpkg',
  '.csv',
  '.tsv',
  '.txt',
  '.md',
  '.markdown',
  '.json',
])

export async function readImportFile(path: string): Promise<{ name: string; bytes: Uint8Array }> {
  if (!isAbsolute(path))
    throw invalid('Give the full path of the file, starting from the root of the disk.')
  const info = await stat(path).catch(() => null)
  if (!info) throw new RecallError('not_found', `There is no file at ${path}.`)
  if (!info.isFile()) throw invalid(`${path} is not a file.`)
  const extension = extname(path).toLowerCase()
  if (!IMPORT_EXTENSIONS.has(extension)) {
    throw invalid(
      `"${extension || basename(path)}" files cannot be imported. Use an Anki package, CSV, TSV, Markdown or a Recall backup.`,
    )
  }
  if (info.size > MAX_UPLOAD_BYTES) throw invalid('That file is larger than 512 MB.')
  const bytes = await readFile(path).catch(() => {
    throw invalid(`The file at ${path} could not be read. Check that you may open it.`)
  })
  return { name: basename(path), bytes: new Uint8Array(bytes) }
}

/** Read the file and parse it; `preview` counts its media and writes none. `size` is the file's. */
export async function parseImportFile(
  service: Service,
  path: string,
  mode: 'commit' | 'preview',
): Promise<{ batch: ImportBatch; size: number }> {
  const { name, bytes } = await readImportFile(path)
  return {
    batch: await parseImport({ name, bytes, mediaDir: service.core.mediaDir, mode }),
    size: bytes.length,
  }
}
