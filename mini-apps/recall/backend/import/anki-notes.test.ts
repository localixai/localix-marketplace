import { describe, expect, test } from 'bun:test'
import { added, tidy } from './anki-notes'

describe('what an answer adds', () => {
  test('tidy drops lone punctuation, rules and runs of blank lines', () => {
    expect(tidy('.\nreal text\n\n\n\n***\n-\nmore\n.')).toBe('real text\n\nmore')
  })
  test('a line the question or an earlier answer already shows is not repeated', () => {
    const known = ['1\\. να\n[audio](media/a.mp3)', 'so (that), to']
    const answers = [
      'so (that), to\n\nΘα του πω.',
      '1. να\n[audio](media/a.mp3)\n\nΘα του πω.\nI will.',
    ]
    expect(added(known, answers)).toBe('Θα του πω.\n\nI will.')
  })
  test('nothing new is empty text, not a stray dot', () => {
    expect(added(['one'], ['one\n.'])).toBe('')
  })
})
