import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { zipSync } from 'fflate'
import { parseImport } from './index'
import { zstdDecompress } from './zip'
import { AT, PNG, buildApkg, tempDir } from './test-support'

const MP3 = new Uint8Array([9, 9])

const dirs: { remove: () => void }[] = []
afterEach(() => dirs.splice(0).forEach((dir) => dir.remove()))
function workspace() {
  const dir = tempDir()
  dirs.push(dir)
  return { root: dir.path, media: join(dir.path, 'media') }
}

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const iso = (ms: number) => new Date(ms).toISOString()

describe.each(['old', 'new'] as const)('an Anki package, %s schema', (schema) => {
  async function read() {
    const { media } = workspace()
    const batch = await parseImport({ name: 'spanish.apkg', bytes: buildApkg(schema), mediaDir: media })
    return { batch, media }
  }

  test('note types are mapped by shape, with decks, tags and Markdown', async () => {
    const { batch } = await read()
    const file = `${sha(PNG)}.png`
    const sound = `${sha(MP3)}.mp3`
    expect(batch.source).toBe('spanish.apkg')
    expect(batch.format).toBe('apkg')
    expect(batch.notes.map((note) => [note.kind, note.front, note.back, note.extra, note.deck])).toEqual([
      ['basic', `hola\n\n[audio](media/${sound})`, `**hello**![](media/${file})`, '', 'Spanish / Verbs'],
      ['reversed', 'uno', 'one', '', 'Spanish / Verbs'],
      ['cloze', '{{c1::Paris}} and {{c2::Rome}}', '', 'capitals', undefined],
      ['basic', 'casa', 'house', '', 'Spanish / Verbs'],
    ])
    expect(batch.notes[0]!.tags).toEqual(['greek', 'foo'])
    expect(batch.decks.map((deck) => deck.name)).toEqual(['Spanish / Verbs'])
  })

  test('the review log becomes progress per card variant, oldest first, manual entries skipped', async () => {
    const { batch } = await read()
    expect(batch.notes[0]!.progress).toEqual({
      forward: [
        { rating: 3, reviewedAt: iso(AT), durationMs: 5000 },
        { rating: 1, reviewedAt: iso(AT + 2000), durationMs: 5000 },
      ],
    })
    expect(batch.notes[1]!.progress).toEqual({ reverse: [{ rating: 4, reviewedAt: iso(AT + 7), durationMs: 5000 }] })
    expect(batch.notes[2]!.progress).toEqual({ c2: [{ rating: 3, reviewedAt: iso(AT + 5), durationMs: 5000 }] })
  })

  test('suspended cards pause the note; an unknown note type is a warning, an empty note is skipped', async () => {
    const { batch } = await read()
    expect(batch.notes[3]!.paused).toBe(true)
    expect(batch.notes[0]!.paused).toBeUndefined()
    expect(batch.warnings.some((warning) => /sound/.test(warning))).toBe(false)
    expect(batch.warnings).toContain('1 note without a front or back skipped')
    expect(batch.warnings).toContain('1 note of the note type "Vocabulary" imported as basic cards from their first two fields')
  })

  test('only the pictures and sounds the notes use are written, under their hash, and recorded', async () => {
    const { batch, media } = await read()
    const file = `${sha(PNG)}.png`
    const sound = `${sha(MP3)}.mp3`
    expect(readdirSync(media).sort()).toEqual([file, sound].sort())
    expect(batch.media).toEqual([
      { original: 'a.mp3', file: sound },
      { original: 'cat.png', file },
    ])
    expect(batch.mediaCounts).toEqual({ pictures: 1, sounds: 1 })
  })

  test('a name that tries to leave the folder never decides where a file goes', async () => {
    const { root, media } = workspace()
    const bytes = buildApkg(schema, { mediaNames: ['../../evil.png', 'cat.png'], media: { '../../evil.png': PNG, 'cat.png': PNG } })
    // The note refers to the hostile name; the file is stored by its hash.
    const batch = await parseImport({ name: 'x.apkg', bytes, mediaDir: media })
    expect(readdirSync(media)).toEqual([`${sha(PNG)}.png`])
    expect(existsSync(join(root, '..', 'evil.png'))).toBe(false)
    expect(batch.media.every((entry) => /^[0-9a-f]{64}\.png$/.test(entry.file))).toBe(true)
  })

  test('an image the file does not hold is dropped and counted', async () => {
    const { media } = workspace()
    const batch = await parseImport({ name: 'x.apkg', bytes: buildApkg(schema, { mediaNames: ['a.mp3'] }), mediaDir: media })
    expect(batch.warnings).toContain('1 image is not in the file and was dropped.')
    expect(batch.notes[0]!.back).toBe('**hello**')
  })

  test('an image over 50 MB aborts with a clear error', async () => {
    const { media } = workspace()
    const big = new Uint8Array(51 * 1024 * 1024)
    const bytes = buildApkg(schema, { mediaNames: ['cat.png'], media: { 'cat.png': big } })
    await expect(parseImport({ name: 'x.apkg', bytes, mediaDir: media })).rejects.toThrow(/up to 50 MB/)
    expect(existsSync(media) ? readdirSync(media) : []).toEqual([])
  })
})

describe('damaged packages', () => {
  test('a zip without a collection is not an Anki package', async () => {
    const { media } = workspace()
    const bytes = zipSync({ 'notes.txt': new Uint8Array([1]) })
    await expect(parseImport({ name: 'a.apkg', bytes, mediaDir: media })).rejects.toThrow(/holds no collection/)
  })

  test('a collection that is not SQLite is refused', async () => {
    const { media } = workspace()
    const bytes = zipSync({ 'collection.anki2': new TextEncoder().encode('not a database at all') })
    await expect(parseImport({ name: 'a.apkg', bytes, mediaDir: media })).rejects.toThrow(/not readable/)
  })

  test('a file that is not a zip is refused', async () => {
    const { media } = workspace()
    await expect(parseImport({ name: 'a.apkg', bytes: new Uint8Array([1, 2, 3]), mediaDir: media })).rejects.toThrow(/not a zip/)
  })

  test('a zstd stream that expands past the limit stops at the limit', () => {
    const bomb = Bun.zstdCompressSync(new Uint8Array(5 * 1024 * 1024))
    expect(() => zstdDecompress(bomb, 'collection.anki21b', 1024 * 1024)).toThrow(/expands to more than 1 MB/)
  })
})
