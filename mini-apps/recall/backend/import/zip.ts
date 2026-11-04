import { zstdDecompressSync } from 'node:zlib'
import { unzipSync } from 'fflate'
import { ImportError, MAX_FILE_BYTES, MAX_TOTAL_BYTES, megabytes } from './common'

/**
 * Reading an archive within the caps. fflate's `unzipSync` inflates each entry into a buffer of the
 * size the archive declares, so checking the declared sizes before extracting bounds the memory an
 * import takes, whatever the archive claims.
 */

export interface ZipEntry {
  name: string
  /** Declared uncompressed size. */
  size: number
  /** Stored (compressed) size. */
  stored: number
}

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)
}

export function isZstd(bytes: Uint8Array): boolean {
  return ZSTD_MAGIC.every((byte, index) => bytes[index] === byte)
}

function unzip(bytes: Uint8Array, keep: (entry: ZipEntry) => boolean): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes, {
      filter: (file) => keep({ name: file.name, size: file.originalSize, stored: file.size }),
    })
  } catch (error) {
    if (error instanceof ImportError) throw error
    throw new ImportError('The file is not a readable zip archive; it may be damaged.', {
      cause: error,
    })
  }
}

/** Every entry's name and declared size, extracting nothing. */
export function listZip(bytes: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = []
  unzip(bytes, (entry) => {
    entries.push(entry)
    return false
  })
  return entries
}

/**
 * Extracts from one archive while keeping count of what it expanded to, so an import as a whole stays
 * under `MAX_TOTAL_BYTES` and every file under `MAX_FILE_BYTES`.
 */
export class ZipReader {
  private expanded = 0
  readonly entries: Map<string, ZipEntry>

  constructor(private readonly bytes: Uint8Array) {
    this.entries = new Map(listZip(bytes).map((entry) => [entry.name, entry]))
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  /** Charges `size` bytes against the total, or aborts. */
  charge(name: string, size: number, limit = MAX_FILE_BYTES): void {
    if (size > limit) {
      throw new ImportError(
        `"${name}" in the archive is ${megabytes(size)} uncompressed; files up to ${megabytes(limit)} can be imported.`,
      )
    }
    this.expanded += size
    if (this.expanded > MAX_TOTAL_BYTES) {
      throw new ImportError(
        `The archive expands to more than ${megabytes(MAX_TOTAL_BYTES)}; split it into smaller files.`,
      )
    }
  }

  /** Extracts the named entries that exist, in batches of at most `MAX_FILE_BYTES` each. */
  *extract(names: Iterable<string>, limit = MAX_FILE_BYTES): Generator<[string, Uint8Array]> {
    let batch = new Set<string>()
    let batchSize = 0
    const flush = () => {
      const wanted = batch
      const files = unzip(this.bytes, (entry) => wanted.has(entry.name))
      batch = new Set()
      batchSize = 0
      return Object.entries(files)
    }
    for (const name of names) {
      const entry = this.entries.get(name)
      if (!entry || batch.has(name)) continue
      this.charge(name, Math.max(entry.size, entry.stored), limit)
      if (batchSize + entry.size > limit && batch.size) yield* flush()
      batch.add(name)
      batchSize += entry.size
    }
    if (batch.size) yield* flush()
  }

  read(name: string, limit = MAX_FILE_BYTES): Uint8Array | undefined {
    for (const [, bytes] of this.extract([name], limit)) return bytes
    return undefined
  }
}

/** Zstandard frames to bytes, stopping as soon as the output passes `limit`. */
export function zstdDecompress(bytes: Uint8Array, what: string, limit = MAX_FILE_BYTES): Uint8Array {
  try {
    return new Uint8Array(zstdDecompressSync(bytes, { maxOutputLength: limit }))
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
      throw new ImportError(
        `"${what}" expands to more than ${megabytes(limit)}; files up to ${megabytes(limit)} can be imported.`,
      )
    }
    throw new ImportError(`"${what}" could not be decompressed; the file may be damaged.`, {
      cause: error,
    })
  }
}
