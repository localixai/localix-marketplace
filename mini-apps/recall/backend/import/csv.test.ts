import { describe, expect, test } from 'bun:test'
import { parseImport } from './index'

const read = (name: string, text: string | Uint8Array) =>
  parseImport({ name, bytes: typeof text === 'string' ? new TextEncoder().encode(text) : text, mediaDir: '/nonexistent' })
const cards = async (name: string, text: string) =>
  (await read(name, text)).notes.map((note) => [note.front, note.back, note.tags, note.deck ?? null])

describe('CSV and TSV', () => {
  test('front and back without a header', async () => {
    expect(await cards('a.csv', 'hola,hello\nadios,goodbye\n')).toEqual([
      ['hola', 'hello', [], null],
      ['adios', 'goodbye', [], null],
    ])
  })

  test('a header names the columns in any order and case', async () => {
    const batch = await read('a.csv', 'Deck,BACK,Front,Tags\nSpanish,hello,hola,"a, #B c"\n')
    expect(batch.notes).toEqual([{ kind: 'basic', front: 'hola', back: 'hello', extra: '', tags: ['a', 'b', 'c'], deck: 'Spanish' }])
    expect(batch.decks).toEqual([{ name: 'Spanish', description: '' }])
  })

  test('question and answer are headers too', async () => {
    expect(await cards('a.csv', 'Question;Answer\n2+2;4\n')).toEqual([['2+2', '4', [], null]])
  })

  test('the delimiter is sniffed: tab, semicolon, pipe', async () => {
    expect(await cards('a.txt', 'a\tb,c\nd\te,f\n')).toEqual([['a', 'b,c', [], null], ['d', 'e,f', [], null]])
    expect(await cards('a.csv', 'a;b\nc;d\n')).toEqual([['a', 'b', [], null], ['c', 'd', [], null]])
    expect(await cards('a.csv', 'a|b\nc|d\n')).toEqual([['a', 'b', [], null], ['c', 'd', [], null]])
  })

  test('quoted fields keep delimiters, doubled quotes and newlines; Windows line ends work', async () => {
    const batch = await read('a.csv', 'front,back\r\n"Say ""hi"", then\r\nwait",ok\r\nx,"line1\nline2"\r\n')
    expect(batch.notes.map((note) => [note.front, note.back])).toEqual([
      ['Say "hi", then\nwait', 'ok'],
      ['x', 'line1\nline2'],
    ])
  })

  test('a byte order mark is ignored, so the header is still found', async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('front,back\na,b\n')])
    expect((await read('a.csv', bytes)).notes.map((note) => note.front)).toEqual(['a'])
  })

  test('empty rows and rows without a front or back are skipped and counted', async () => {
    const batch = await read('a.csv', 'front,back\n\n,\na,b\n,orphan\nlonely,\n   ,   \n')
    expect(batch.notes.map((note) => note.front)).toEqual(['a'])
    expect(batch.warnings).toEqual(['3 empty rows skipped.', '1 row without a front skipped.', '1 row without a back skipped.'])
  })

  test('cloze marks make a cloze card that needs no back', async () => {
    const batch = await read('a.csv', 'front,back\n"The {{c1::sun}} is a star",\n')
    expect(batch.notes[0]).toMatchObject({ kind: 'cloze', front: 'The {{c1::sun}} is a star', back: '' })
  })

  test('HTML in a cell becomes Markdown and sounds are dropped', async () => {
    const batch = await read('a.csv', 'front,back\n<b>hola</b>[sound:x.mp3],hello<br>there\n')
    expect(batch.notes[0]).toMatchObject({ front: '**hola**', back: 'hello\nthere' })
    expect(batch.warnings).toEqual(['1 sound dropped.'])
  })

  test("Anki's text export header is understood", async () => {
    const text = '#separator:tab\n#html:false\n#tags column:3\n#deck column:4\nq1\ta1\tx y\tGeo::EU\n'
    const batch = await read('notes.txt', text)
    expect(batch.notes).toEqual([{ kind: 'basic', front: 'q1', back: 'a1', extra: '', tags: ['x', 'y'], deck: 'Geo / EU' }])
  })

  test('Windows-1252 text is read with a warning', async () => {
    const batch = await read('a.csv', new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x62, 0x0a]))
    expect(batch.notes[0]!.front).toBe('café')
    expect(batch.warnings[0]).toContain('Windows-1252')
  })

  test('an unterminated quote is read to the end with a warning', async () => {
    const batch = await read('a.csv', 'a,"b\nc')
    expect(batch.notes[0]).toMatchObject({ front: 'a', back: 'b\nc' })
    expect(batch.warnings[0]).toContain('never closed')
  })

  test('a file that is not text, JSON or a package is refused by extension', async () => {
    await expect(read('a.pdf', 'x')).rejects.toThrow(/cannot be imported/)
    await expect(read('a.csv', new Uint8Array())).rejects.toThrow(/empty/)
  })
})
