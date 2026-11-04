import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { parseImport } from './index'
import { AT, SILENCE, buildApkg, greekDeck, tempDir, type Fixture, type Type } from './test-support'

const dirs: { remove: () => void }[] = []
afterEach(() => dirs.splice(0).forEach((dir) => dir.remove()))
function workspace() {
  const dir = tempDir()
  dirs.push(dir)
  return { root: dir.path, media: join(dir.path, 'media') }
}
const sha = (bytes: number[]) => createHash('sha256').update(new Uint8Array(bytes)).digest('hex')
const audio = (bytes: number[]) => `[audio](media/${sha(bytes)}.mp3)`

/** A package of one note type whose notes are `[fields]`, each with the cards `ords`. */
function pack(
  type: Type,
  notes: { fields: string[]; ords?: number[]; queue?: number }[],
  extra: Partial<Fixture> = {},
): Fixture {
  const fixture: Fixture = { types: [type], notes: [], cards: [], revlog: [], ...extra }
  notes.forEach((note, index) => {
    const id = 500 + index
    fixture.notes.push([id, type.id, note.fields, '', 2])
    for (const ord of note.ords ?? type.templates.map((_, i) => i))
      fixture.cards.push([id * 10 + ord, id, ord, note.queue ?? 0])
  })
  return fixture
}

describe.each(['old', 'new'] as const)('a deck of Greek words, %s schema', (schema) => {
  async function read(count = 12, mode?: 'preview') {
    const { media } = workspace()
    const { fixture, media: files, names } = greekDeck(count)
    const batch = await parseImport({
      name: 'greek.apkg',
      bytes: buildApkg(schema, { fixture, media: files, mediaNames: names }),
      mediaDir: media,
      mode,
    })
    return { batch, media }
  }

  test('each note is one reversed card: word with its sound, meaning, and the examples with theirs', async () => {
    const { batch } = await read()
    expect(batch.notes).toHaveLength(12)
    expect(new Set(batch.notes.map((note) => note.kind))).toEqual(new Set(['reversed']))
    const [first] = batch.notes
    expect(first!.front).toBe(`1\\. λέξη1\n${audio([1, 1])}`)
    expect(first!.back).toBe('word 1')
    expect(first!.extra).toBe(`Παράδειγμα 1.\n\nExample 1.\n\n${audio([2, 1])}`)
    expect(first!.deck).toBe('Learning Greek: 2500 words')
    expect(batch.format).toBe('apkg')
  })

  test('the silent clip every note plays is left out, and said once; nothing is called a leftover', async () => {
    const { batch, media } = await read()
    expect(readdirSync(media)).toHaveLength(24)
    expect(batch.media.every((entry) => !entry.original.includes('silence'))).toBe(true)
    expect(batch.notes.some((note) => note.extra.includes(sha([0, 0, 0])))).toBe(false)
    // Information, not a problem: it is a notice, and nothing was lost or skipped.
    expect(batch.notices).toEqual([
      'A silent clip on every card was left out.',
      'No study history in the file, so every card starts as new.',
    ])
    expect(batch.warnings).toEqual([])
    expect(batch.mediaCounts).toEqual({ pictures: 0, sounds: 24 })
  })

  test('a preview counts the sounds and writes nothing', async () => {
    const { batch, media } = await read(12, 'preview')
    expect(existsSync(media)).toBe(false)
    expect(batch.preview).toBe(true)
    expect(batch.media).toEqual([])
    expect(batch.mediaCounts).toEqual({ pictures: 0, sounds: 24 })
    expect(batch.notes).toHaveLength(12)
    expect(batch.notes[0]!.front).toMatch(/^1\\\. λέξη1\n\[audio\]\(media\/[0-9a-f]{64}\.mp3\)$/)
  })

  test('with fewer than ten notes the clip is not decoration: a few cards may use one on purpose', async () => {
    const { batch } = await read(9)
    expect(batch.notices.some((notice) => /silent clip/.test(notice))).toBe(false)
    expect(batch.notes[0]!.extra).toContain(`[audio](media/${sha([0, 0, 0])}.mp3)`)
  })
})

describe.each(['old', 'new'] as const)('note types with real templates, %s schema', (schema) => {
  async function read(fixture: Fixture, media: Record<string, Uint8Array> = {}) {
    const ws = workspace()
    const names = Object.keys(media)
    return parseImport({
      name: 'x.apkg',
      bytes: buildApkg(schema, { fixture, media, mediaNames: names }),
      mediaDir: ws.media,
    })
  }

  test('one template is a basic card: the question, then only what the answer adds', async () => {
    const type: Type = {
      id: 20,
      name: 'Vocab',
      fields: ['Word', 'Meaning', 'Example'],
      templates: ['Card 1'],
      formats: [
        [
          '<b>{{Word}}</b>',
          '{{FrontSide}}<hr id=answer>{{Meaning}}<br>{{#Example}}e.g. {{Example}}{{/Example}}',
        ],
      ],
    }
    const batch = await read(
      pack(type, [{ fields: ['casa', 'house', 'mi casa'] }, { fields: ['sol', 'sun', ''] }]),
    )
    expect(batch.notes.map((note) => [note.kind, note.front, note.back, note.extra])).toEqual([
      ['basic', '**casa**', 'house\ne.g. mi casa', ''],
      ['basic', '**sol**', 'sun', ''],
    ])
    expect(batch.warnings.some((warning) => /first two fields/.test(warning))).toBe(false)
  })

  test('a question with {{type:…}} is a typed card and its expected answer is that field', async () => {
    const type: Type = {
      id: 21,
      name: 'Basic (type in the answer)',
      fields: ['Front', 'Back'],
      templates: ['Card 1'],
      formats: [['{{Front}}\n\n{{type:Back}}', '{{Front}}\n\n<hr id=answer>\n\n{{type:Back}}']],
    }
    const batch = await read(pack(type, [{ fields: ['capital of France', 'Paris'] }]))
    expect(batch.notes.map((note) => [note.kind, note.front, note.back])).toEqual([
      ['typed', 'capital of France', 'Paris'],
    ])
  })

  test('a cloze card takes the field its template names, and its extra is what the answer adds', async () => {
    const type: Type = {
      id: 22,
      name: 'Cloze (extra first)',
      cloze: true,
      fields: ['Back Extra', 'Text'],
      templates: ['Cloze'],
      formats: [['{{cloze:Text}}', '{{cloze:Text}}<br>\n{{Back Extra}}']],
    }
    const batch = await read(
      pack(type, [{ fields: ['capitals', '{{c1::Paris}} and {{c2::Rome}}'] }]),
    )
    expect(batch.notes.map((note) => [note.kind, note.front, note.back, note.extra])).toEqual([
      ['cloze', '{{c1::Paris}} and {{c2::Rome}}', '', 'capitals'],
    ])
  })

  test('two mirrored templates are one reversed note, and an optional reverse only where it is filled', async () => {
    const type: Type = {
      id: 23,
      name: 'Basic (optional reversed card)',
      fields: ['Front', 'Back', 'Add Reverse'],
      templates: ['Card 1', 'Card 2'],
      formats: [
        ['{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}'],
        ['{{#Add Reverse}}{{Back}}{{/Add Reverse}}', '{{FrontSide}}<hr id=answer>{{Front}}'],
      ],
    }
    const batch = await read(
      pack(type, [
        { fields: ['uno', 'one', 'y'] },
        { fields: ['dos', 'two', ''], ords: [0] },
        { fields: ['tres', 'three', 'y'] },
      ]),
    )
    expect(batch.notes.map((note) => [note.kind, note.front, note.back, note.extra])).toEqual([
      ['reversed', 'uno', 'one', ''],
      ['basic', 'dos', 'two', ''],
      ['reversed', 'tres', 'three', ''],
    ])
  })

  test('templates that do not mirror each other make each Anki card its own basic note, with its own progress', async () => {
    const type: Type = {
      id: 24,
      name: 'Three views',
      fields: ['Word', 'Meaning', 'Use'],
      templates: ['Meaning', 'Word', 'Use'],
      formats: [
        ['What is {{Word}}?', '{{FrontSide}}<hr id=answer>{{Meaning}}'],
        ['Say {{Meaning}}', '{{FrontSide}}<hr id=answer>{{Word}}'],
        ['Use {{Word}}', '{{FrontSide}}<hr id=answer>{{Use}}'],
      ],
    }
    const fixture = pack(type, [
      { fields: ['casa', 'house', 'mi casa'], queue: 0 },
      { fields: ['sol', 'sun', 'el sol'], ords: [0, 2] },
    ])
    fixture.revlog.push([5002, AT, 3, 0], [5001, AT + 1, 1, 0])
    const batch = await read(fixture)
    expect(batch.notes.map((note) => [note.kind, note.front, note.back])).toEqual([
      ['basic', 'What is casa?', 'house'],
      ['basic', 'Say house', 'casa'],
      ['basic', 'Use casa', 'mi casa'],
      ['basic', 'What is sol?', 'sun'],
      ['basic', 'Use sol', 'el sol'],
    ])
    expect(batch.notes[2]!.progress).toEqual({
      forward: [{ rating: 3, reviewedAt: new Date(AT).toISOString(), durationMs: 5000 }],
    })
    expect(batch.notes[1]!.progress).toEqual({
      forward: [{ rating: 1, reviewedAt: new Date(AT + 1).toISOString(), durationMs: 5000 }],
    })
    expect(batch.warnings).toContain(
      '5 cards of the note type "Three views" were imported as separate basic notes; each keeps its own progress',
    )
  })

  test('a sound with a name that tries to leave the folder, or that is no audio, never reaches the disk', async () => {
    const type: Type = {
      id: 25,
      name: 'Plain',
      fields: ['Front', 'Back'],
      templates: ['Card 1'],
      formats: [['{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}']],
    }
    const ws = workspace()
    const bytes = buildApkg(schema, {
      fixture: pack(type, [
        { fields: ['a [sound:../../evil.mp3]', 'b [sound:run.exe] [sound:gone.mp3]'] },
      ]),
      media: { '../../evil.mp3': new Uint8Array([7]), 'run.exe': new Uint8Array([8]) },
      mediaNames: ['../../evil.mp3', 'run.exe'],
    })
    const batch = await parseImport({ name: 'x.apkg', bytes, mediaDir: ws.media })
    expect(readdirSync(ws.media)).toEqual([`${sha([7])}.mp3`])
    expect(existsSync(join(ws.root, '..', 'evil.mp3'))).toBe(false)
    expect(batch.notes[0]!.front).toBe(`a\n${audio([7])}`)
    expect(batch.notes[0]!.back).toBe('b')
    expect(batch.warnings).toContain('1 sound is of a type Recall cannot play and was dropped.')
    expect(batch.warnings).toContain('1 sound is not in the file and was dropped.')
  })

  test('a sound over 50 MB aborts with a clear error and writes nothing', async () => {
    const type: Type = {
      id: 26,
      name: 'Plain',
      fields: ['Front', 'Back'],
      templates: ['Card 1'],
      formats: [['{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}']],
    }
    const ws = workspace()
    const bytes = buildApkg(schema, {
      fixture: pack(type, [{ fields: ['a [sound:big.mp3]', 'b'] }]),
      media: { 'big.mp3': new Uint8Array(51 * 1024 * 1024) },
      mediaNames: ['big.mp3'],
    })
    await expect(parseImport({ name: 'x.apkg', bytes, mediaDir: ws.media })).rejects.toThrow(
      /up to 50 MB/,
    )
    expect(existsSync(ws.media) ? readdirSync(ws.media) : []).toEqual([])
  })
})

describe.each(['old', 'new'] as const)('the order of the file, %s schema', (schema) => {
  test('notes come in the order Anki would show their new cards, the rest after them by note id', async () => {
    const type: Type = {
      id: 30,
      name: 'Plain',
      fields: ['Front', 'Back'],
      templates: ['Card 1'],
      formats: [['{{Front}}', '{{FrontSide}}<hr id=answer>{{Back}}']],
    }
    // Note ids 500..505; new positions 3, 1, (review), 2, 2, (review).
    const fixture = pack(
      type,
      ['a', 'b', 'c', 'd', 'e', 'f'].map((front) => ({ fields: [front, front.toUpperCase()] })),
    )
    const at = (note: number, type: number, due: number) => {
      const card = fixture.cards.find((entry) => entry[1] === 500 + note)!
      card[4] = type
      card[5] = due
    }
    at(0, 0, 3)
    at(1, 0, 1)
    at(2, 2, 900)
    at(3, 0, 2)
    at(4, 0, 2)
    at(5, 2, 5)
    const ws = workspace()
    const batch = await parseImport({
      name: 'x.apkg',
      bytes: buildApkg(schema, { fixture }),
      mediaDir: ws.media,
    })
    expect(batch.notes.map((note) => note.front)).toEqual(['b', 'd', 'e', 'a', 'c', 'f'])
  })
})
