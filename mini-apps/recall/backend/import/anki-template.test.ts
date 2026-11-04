import { describe, expect, test } from 'bun:test'
import { answerPart, clozeFieldOf, renderCard } from './anki-template'

const fields = {
  Front: 'hola',
  Back: '<b>hello</b>',
  Empty: '',
  Blank: '<br> ',
  'Greek Word': 'να',
  Text: 'A {{c1::cat}} sat',
}
const html = (format: string, over: Record<string, string> = {}, frontSide?: string) =>
  renderCard(format, { ...fields, ...over }, { frontSide }).html

describe('fields and FrontSide', () => {
  test('a field is replaced by its value, one with a space in its name too', () => {
    expect(html('{{Front}} - {{Greek Word}}')).toBe('hola - να')
  })
  test('an unknown field renders nothing and a comment is dropped', () => {
    expect(html('a{{Nope}}b{{! a note }}c')).toBe('abc')
  })
  test('FrontSide is the question, and nothing on the question itself', () => {
    expect(html('{{FrontSide}}<hr id=answer>{{Back}}', {}, 'hola')).toBe(
      'hola<hr id=answer><b>hello</b>',
    )
    expect(html('{{FrontSide}}{{Front}}')).toBe('hola')
  })
  test('the special fields Tags and Deck are empty unless given', () => {
    expect(html('[{{Tags}}][{{Deck}}]')).toBe('[][]')
    expect(renderCard('{{Tags}}', fields, { special: { Tags: 'a b' } }).html).toBe('a b')
  })
})

describe('sections', () => {
  test('{{#F}} shows its body only for a field that holds something', () => {
    expect(
      html('{{#Front}}[{{Front}}]{{/Front}}{{#Empty}}no{{/Empty}}{{#Blank}}no{{/Blank}}'),
    ).toBe('[hola]')
  })
  test('{{^F}} shows its body only for an empty field', () => {
    expect(html('{{^Empty}}empty{{/Empty}}{{^Front}}no{{/Front}}{{^Blank}}blank{{/Blank}}')).toBe(
      'emptyblank',
    )
  })
  test('sections nest, and a field holding only an image or a sound is filled', () => {
    expect(html('{{#Front}}a{{#Empty}}b{{/Empty}}{{^Empty}}c{{/Empty}}{{/Front}}')).toBe('ac')
    expect(html('{{#Back}}x{{/Back}}', { Back: '<img src="a.png">' })).toBe('x')
    expect(html('{{#Back}}x{{/Back}}', { Back: '[sound:a.mp3]' })).toBe('x')
  })
  test('an unclosed section runs to the end instead of losing the card', () => {
    expect(html('{{#Front}}kept')).toBe('kept')
  })
})

describe('filters', () => {
  test('text: strips the HTML', () => {
    expect(html('{{text:Back}}')).toBe('hello')
  })
  test('hint: and tts show the field, as do unknown filters', () => {
    expect(html('{{hint:Back}}|{{tts en_US:Front}}|{{tts-voices:Front}}|{{whatever:Front}}')).toBe(
      '<b>hello</b>|hola|hola|hola',
    )
  })
  test('filters chain from the field outwards', () => {
    expect(html('{{hint:text:Back}}')).toBe('hello')
  })
  test('furigana, kana and kanji keep the readable text', () => {
    const over = { Back: '漢字[かんじ] です' }
    expect(html('{{kanji:Back}}', over)).toBe('漢字 です')
    expect(html('{{kana:Back}}', over)).toBe('かんじ です')
    expect(html('{{furigana:Back}}', over)).toBe('漢字(かんじ) です')
  })
  test('cloze: keeps the cloze marks', () => {
    expect(html('{{cloze:Text}}')).toBe('A {{c1::cat}} sat')
  })
  test('type: marks the card as typed and renders nothing, whatever it is chained with', () => {
    const rendered = renderCard('{{Front}}<br>{{type:Back}}', fields)
    expect(rendered).toEqual({ html: 'hola<br>', typed: ['Back'] })
    expect(renderCard('{{type:cloze:Text}}', fields).typed).toEqual(['Text'])
  })
})

describe('the cloze field', () => {
  test('is the one the question names, not the first', () => {
    expect(clozeFieldOf('{{Extra}}<br>{{cloze:Text}}')).toBe('Text')
    expect(clozeFieldOf('{{Front}}')).toBeNull()
  })
})

describe('the answer side, only what is new after the question', () => {
  test('cuts through <hr id=answer>', () => {
    expect(answerPart('hola', 'hola<hr id=answer>hello')).toBe('hello')
    expect(answerPart('hola', 'x<HR ID="answer" />hello<hr>more')).toBe('hello<hr>more')
  })
  test('cuts through the first <hr> when the answer starts by repeating the question text', () => {
    expect(
      answerPart('<div>1. να [sound:a.mp3]</div>', '<div>\n 1. να\n</div>\n<hr>\n<div>so</div>'),
    ).toBe('\n<div>so</div>')
  })
  test('leaves an <hr> alone when what comes before it is not the question', () => {
    expect(answerPart('hola', 'hello<hr>more')).toBe('hello<hr>more')
  })
  test('an answer that never repeats the question is all new', () => {
    expect(answerPart('hola', '<b>hello</b>')).toBe('<b>hello</b>')
  })
  test('a question with no text of its own cuts nothing', () => {
    expect(answerPart('[sound:a.mp3]', '<hr>hello')).toBe('<hr>hello')
  })
})
