import { describe, expect, test } from 'bun:test'
import { plainFront } from './cloze'
import { snippet } from './format'
import { soundFiles, soundsAsWords, textOnly, withoutSounds } from './sound'

const text = 'Θα του πω.\n\nI will.\n\n[audio](media/aa.mp3)\n[audio](media/bb.ogg)'

describe("sounds in a note's Markdown", () => {
  test('the files are listed in order, once each', () => {
    expect(soundFiles(`${text}\n[audio](media/aa.mp3)`)).toEqual(['aa.mp3', 'bb.ogg'])
    expect(soundFiles('a [audio](https://x.test/a.mp3) b [link](media/aa.mp3)')).toEqual([])
  })
  test('without sounds the links are gone and no gap is left behind', () => {
    expect(withoutSounds(text)).toBe('Θα του πω.\n\nI will.')
    expect(withoutSounds('[audio](media/aa.mp3)')).toBe('')
    expect(withoutSounds('one [audio](media/aa.mp3) two')).toBe('one two')
  })
  test('for the agent a sound is said as (sound)', () => {
    expect(soundsAsWords('hola\n\n[audio](media/aa.mp3)')).toBe('hola (sound)')
    expect(soundsAsWords('[audio](media/aa.mp3) [audio](media/bb.ogg)')).toBe('(sound)')
  })
  test('text only also drops pictures, for a look inside a file that has no media yet', () => {
    expect(textOnly('a ![cat](media/x.png) b\n[audio](media/aa.mp3)')).toBe('a b')
  })
  test('the plain front of a note and its duplicate key ignore sounds', () => {
    expect(plainFront({ kind: 'basic', front: 'hola\n[audio](media/aa.mp3)' })).toBe('hola')
    expect(
      snippet(plainFront({ kind: 'cloze', front: '{{c1::Paris}}\n[audio](media/aa.mp3)' })),
    ).toBe('Paris')
  })
})
