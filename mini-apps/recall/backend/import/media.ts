import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { decodeEntities } from './html-entities'
import { ImportError, MAX_FILE_BYTES, extensionOf, megabytes } from './common'

/**
 * Images an import brings along. A file is stored under its content's SHA-256 and a known image
 * extension, so the name never comes from the archive and nothing is written outside `mediaDir`;
 * the same picture imported twice is one file.
 */

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpg',
  jfif: 'jpg',
  gif: 'gif',
  webp: 'webp',
  avif: 'avif',
  svg: 'svg',
  bmp: 'bmp',
  ico: 'ico',
  tif: 'tif',
  tiff: 'tif',
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
}

/** The stored extension for an image's original name, or `null` when it is not an image. */
export function imageExtension(name: string): string | null {
  return IMAGE_EXTENSIONS[extensionOf(name)] ?? null
}

export class MediaStore {
  readonly media: { original: string; file: string }[] = []
  private readonly byOriginal = new Map<string, string>()
  private readonly files = new Set<string>()
  private readonly root: string

  constructor(mediaDir: string) {
    this.root = resolve(mediaDir)
  }

  /**
   * Writes one image; answers its file name (`<sha256>.<ext>`), or `null` when it is no image.
   * `original` names it in the batch's media list; an embedded image passes `null`.
   */
  write(
    original: string | null,
    bytes: Uint8Array,
    extension = original === null ? null : imageExtension(original),
  ): string | null {
    const known = original === null ? undefined : this.byOriginal.get(original)
    if (known) return known
    if (!extension || !/^[a-z0-9]{1,5}$/.test(extension)) return null
    if (bytes.length > MAX_FILE_BYTES) {
      throw new ImportError(
        `The image "${original ?? 'embedded in a card'}" is ${megabytes(bytes.length)}; images up to ${megabytes(MAX_FILE_BYTES)} can be imported.`,
      )
    }
    const file = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
    const target = join(this.root, file)
    if (dirname(target) !== this.root) throw new ImportError('An image name could not be made safe.')
    if (!existsSync(target)) {
      mkdirSync(this.root, { recursive: true })
      const partial = `${target}.${randomUUID()}.part`
      try {
        writeFileSync(partial, bytes, { flag: 'wx' })
        renameSync(partial, target)
      } finally {
        rmSync(partial, { force: true })
      }
    }
    if (original !== null) this.byOriginal.set(original, file)
    if (!this.files.has(file)) {
      this.files.add(file)
      this.media.push({ original: original ?? 'embedded image', file })
    }
    return file
  }
}

export interface ImageCounts {
  /** Images the notes name that the file does not hold. */
  missing: number
  /** Files referenced as images that are no image type Recall shows. */
  unsupported: number
  /** Images embedded in the text as `data:` URLs. */
  embedded: number
}

/**
 * Finds an image the file holds by the name a note uses: its stored file name, `null` when the file
 * holds it but it is no image, `undefined` when the file does not hold it.
 */
export type ImageLookup = (name: string) => string | null | undefined

/**
 * The `image` option of `htmlToMarkdown`: a local name goes through `lookup`, a `data:` image is
 * stored, a web address stays a web address (the converter makes it a plain link, so a card never
 * loads a remote picture by itself), anything else is dropped and counted.
 */
export function createImageResolver(
  store: MediaStore,
  lookup: ImageLookup,
  counts: ImageCounts,
): (src: string) => string | null {
  return (rawSrc) => {
    const src = rawSrc.trim()
    if (/^https?:\/\//i.test(src)) return src
    const data = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(src)
    if (data) {
      const extension = MIME_EXTENSIONS[data[1]!.toLowerCase()]
      if (!extension) {
        counts.unsupported++
        return null
      }
      const bytes = Uint8Array.from(Buffer.from(data[2]!.replace(/\s+/g, ''), 'base64'))
      counts.embedded++
      return `media/${store.write(null, bytes, extension)}`
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(src) || !src) {
      counts.unsupported++
      return null
    }
    const names = [src, decodeEntities(src)]
    try {
      names.push(decodeURIComponent(src))
    } catch {
      // not URL-encoded
    }
    for (const name of names) {
      const file = lookup(name)
      if (file === undefined) continue
      if (file) return `media/${file}`
      counts.unsupported++
      return null
    }
    counts.missing++
    return null
  }
}

export function imageWarnings(counts: ImageCounts): string[] {
  const warnings: string[] = []
  if (counts.missing) {
    warnings.push(
      `${counts.missing === 1 ? '1 image is' : `${counts.missing} images are`} not in the file and ${counts.missing === 1 ? 'was' : 'were'} dropped.`,
    )
  }
  if (counts.unsupported) {
    warnings.push(
      `${counts.unsupported === 1 ? '1 image is' : `${counts.unsupported} images are`} of a type Recall cannot show and ${counts.unsupported === 1 ? 'was' : 'were'} dropped.`,
    )
  }
  return warnings
}
