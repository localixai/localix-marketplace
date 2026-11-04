import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { decodeEntities } from './html-entities'
import { ImportError, MAX_FILE_BYTES, extensionOf, megabytes } from './common'

/**
 * Pictures and sounds an import brings along. A file is stored under its content's SHA-256 and a
 * known image or audio extension, so the name never comes from the archive and nothing is written
 * outside `mediaDir`; the same file imported twice is one file. A preview (`dryRun`) counts the same
 * files and writes none.
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

const SOUND_EXTENSIONS: Record<string, string> = {
  mp3: 'mp3',
  m4a: 'm4a',
  aac: 'aac',
  ogg: 'ogg',
  oga: 'oga',
  opus: 'opus',
  wav: 'wav',
  flac: 'flac',
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

/** The stored extension for a sound's original name, or `null` when it is no sound Recall plays. */
export function soundExtension(name: string): string | null {
  return SOUND_EXTENSIONS[extensionOf(name)] ?? null
}

/** Whether a stored media file is a sound (the rest are pictures). */
export const isSoundFile = (file: string): boolean => extensionOf(file) in SOUND_EXTENSIONS

export class MediaStore {
  readonly media: { original: string; file: string }[] = []
  private readonly byOriginal = new Map<string, string>()
  private readonly files = new Set<string>()
  private readonly root: string

  constructor(
    mediaDir: string,
    private readonly options: { dryRun?: boolean } = {},
  ) {
    this.root = resolve(mediaDir)
  }

  /** The pictures and sounds seen so far, each file once; in a dry run, those that would be stored. */
  counts(): { pictures: number; sounds: number } {
    let sounds = 0
    for (const file of this.files) if (isSoundFile(file)) sounds++
    return { pictures: this.files.size - sounds, sounds }
  }

  /**
   * Counts a file of the archive without reading it (a preview): answers the name it would be
   * stored under, and refuses what the import would refuse for its size.
   */
  plan(original: string, extension: string, size: number): string {
    const known = this.byOriginal.get(original)
    if (known) return known
    this.checkSize(original, extension, size)
    const file = `${createHash('sha256').update(original).digest('hex')}.${extension}`
    this.byOriginal.set(original, file)
    this.files.add(file)
    return file
  }

  private checkSize(original: string | null, extension: string, size: number): void {
    if (size <= MAX_FILE_BYTES) return
    const kind = SOUND_EXTENSIONS[extension] ? 'sound' : 'image'
    throw new ImportError(
      `The ${kind} "${original ?? 'embedded in a card'}" is ${megabytes(size)}; ${kind}s up to ${megabytes(MAX_FILE_BYTES)} can be imported.`,
    )
  }

  /**
   * Writes one file; answers its file name (`<sha256>.<ext>`), or `null` when it has no known type.
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
    this.checkSize(original, extension, bytes.length)
    const file = `${createHash('sha256').update(bytes).digest('hex')}.${extension}`
    const target = join(this.root, file)
    if (dirname(target) !== this.root) throw new ImportError('A file name could not be made safe.')
    if (!this.options.dryRun && !existsSync(target)) {
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
      if (!this.options.dryRun) this.media.push({ original: original ?? 'embedded image', file })
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

export interface SoundCounts {
  /** Sounds the notes name that the file does not hold. */
  missing: number
  /** Sounds of a type Recall cannot play, or on the web. */
  unsupported: number
  /** Files on nearly every note, left out as decoration. */
  decorative: Set<string>
}

/**
 * Finds a sound the file holds by the name a note uses: its stored file name, `null` when the file
 * holds it but it is no sound Recall plays, `undefined` when the file does not hold it.
 */
export type SoundLookup = (name: string) => string | null | undefined

/**
 * The `sound` option of `htmlToMarkdown`: a local name goes through `lookup`; a decorative file (a
 * clip every card plays) and anything that cannot be kept is dropped, and counted unless decoration.
 */
export function createSoundResolver(
  lookup: SoundLookup,
  counts: SoundCounts,
  decorative: ReadonlySet<string>,
): (src: string) => string | null {
  return (rawSrc) => {
    const src = rawSrc.trim()
    if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src)) {
      counts.unsupported++
      return null
    }
    const names = [src, decodeEntities(src)]
    try {
      names.push(decodeURIComponent(src))
    } catch {
      // not URL-encoded
    }
    if (names.some((name) => decorative.has(name))) return null
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

export function soundWarnings(counts: SoundCounts): string[] {
  const warnings: string[] = []
  const many = (count: number) => (count === 1 ? '1 sound is' : `${count} sounds are`)
  const verb = (count: number) => (count === 1 ? 'was' : 'were')
  if (counts.missing) warnings.push(`${many(counts.missing)} not in the file and ${verb(counts.missing)} dropped.`)
  if (counts.unsupported) {
    warnings.push(`${many(counts.unsupported)} of a type Recall cannot play and ${verb(counts.unsupported)} dropped.`)
  }
  return warnings
}

/** A clip on nearly every card is decoration, left out on purpose: information, not a problem. */
export function soundNotices(counts: SoundCounts): string[] {
  if (!counts.decorative.size) return []
  return [counts.decorative.size === 1 ? 'A silent clip on every card was left out.' : 'Sounds that play on every card were left out.']
}
