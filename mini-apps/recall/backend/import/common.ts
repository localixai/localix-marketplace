/**
 * Helpers every import format shares: the size caps, the error an import aborts with, tag and deck
 * name normalisation, text decoding and the wording of warnings.
 */

/** No single file inside an archive (or a text import) may expand beyond this. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024
/** Everything one import expands to, together. */
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024

/** An import that cannot go on; the message is written for the person. */
export class ImportError extends Error {
  override name = 'ImportError'
}

export function megabytes(bytes: number): string {
  return `${Math.ceil(bytes / (1024 * 1024))} MB`
}

/** "1 sound", "3 sounds". */
export function plural(count: number, noun: string, nouns = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : nouns}`
}

/** Counts of things dropped or skipped, worded once at the end of a parse. */
export class Tally {
  private readonly counts = new Map<string, number>()

  add(key: string, count = 1): void {
    if (count > 0) this.counts.set(key, (this.counts.get(key) ?? 0) + count)
  }

  get(key: string): number {
    return this.counts.get(key) ?? 0
  }
}

/** Lower-case, `#`-less, whitespace-free tags, each once, in first-seen order. */
export function normalizeTags(raw: Iterable<string>): string[] {
  const tags = new Set<string>()
  for (const value of raw) {
    for (const part of value.split(/[\s,;]+/)) {
      const tag = part.replace(/^#+/, '').toLowerCase()
      if (tag && tag.length <= 100) tags.add(tag)
    }
  }
  return [...tags]
}

/** A deck name on one line, Anki's `::` hierarchy written as " / ". */
export function normalizeDeckName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .split('::')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' / ')
    .replace(/\s+/g, ' ')
    .slice(0, 200)
}

/** The file's own name: no folders, no control characters. */
export function sourceName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || 'import'
}

export function extensionOf(name: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(name)
  return match ? match[1]!.toLowerCase() : ''
}

/**
 * Bytes to text: a UTF-8 or UTF-16 byte order mark decides; otherwise UTF-8, and Windows-1252 when
 * the bytes are not valid UTF-8 (an old spreadsheet export), with a warning.
 */
export function decodeText(bytes: Uint8Array, warnings: string[]): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    warnings.push('The file is not UTF-8; it was read as Windows-1252 text.')
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** Text with Windows and old Mac line ends turned into `\n`. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

const CLOZE = /\{\{c\d+::/

export function hasCloze(text: string): boolean {
  return CLOZE.test(text)
}
