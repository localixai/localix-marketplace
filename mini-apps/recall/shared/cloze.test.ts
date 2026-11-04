import { describe, expect, test } from 'bun:test'
import { cardFaces, clozeNumbers, clozeParts, duplicateKey, noteProblem, variantsFor } from './cloze'

describe('cloze and card faces', () => {
  const text = '{{c1::Paris}} is the capital of {{c2::France::country}}; {{c1::it}} lies on the Seine.'

  test('numbers and variants come from the marks', () => {
    expect(clozeNumbers(text)).toEqual([1, 2])
    expect(variantsFor('cloze', text)).toEqual(['c1', 'c2'])
    expect(variantsFor('reversed', 'x')).toEqual(['forward', 'reverse'])
    expect(variantsFor('typed', 'x')).toEqual(['forward'])
    expect(variantsFor('cloze', 'no marks')).toEqual([])
  })

  test('a cloze card blanks its own number and shows the others', () => {
    const c2 = cardFaces({ kind: 'cloze', front: text, back: 'Back', extra: '' }, 'c2')
    expect(c2.prompt).toBe('Paris is the capital of [country]; it lies on the Seine.')
    expect(c2.answer).toBe('Paris is the capital of **France**; it lies on the Seine.')
    expect(c2.expected).toBe('France')
    expect(c2.extra).toBe('Back')
    expect(clozeParts(text, 1, false).filter((part) => part.type === 'blank')).toHaveLength(2)
  })

  test('a reverse card asks the back', () => {
    expect(cardFaces({ kind: 'reversed', front: 'Hund', back: 'dog', extra: '' }, 'reverse')).toMatchObject({
      prompt: 'dog',
      answer: 'Hund',
    })
  })

  test('what makes a note unsaveable, in words', () => {
    expect(noteProblem('cloze', 'plain', '')).toContain('{{c1::')
    expect(noteProblem('basic', 'Q', ' ')).toBe('Write the back.')
    expect(noteProblem('cloze', text, '')).toBeNull()
  })

  test('duplicates compare text without case, marks or punctuation', () => {
    expect(duplicateKey({ kind: 'basic', front: 'What is  DNA?' })).toBe(duplicateKey({ kind: 'basic', front: 'what is dna' }))
    expect(duplicateKey({ kind: 'cloze', front: '{{c1::DNA}} is…' })).toBe('dna is')
  })
})
