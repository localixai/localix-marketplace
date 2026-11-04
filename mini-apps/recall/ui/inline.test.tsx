import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { InlineMd, plainInline } from './inline'

const html = (text: string) => renderToStaticMarkup(<InlineMd>{text}</InlineMd>)

test('titles draw code and emphasis and drop the rest of the syntax', () => {
  expect(html('`==` vs `===`?')).toBe('<code class="recall-code">==</code> vs <code class="recall-code">===</code>?')
  expect(html('`const` makes a **binding** and *not* a value')).toBe(
    '<code class="recall-code">const</code> makes a <strong>binding</strong> and <em>not</em> a value',
  )
  expect(html('## A [link](http://x.y) and ![alt](media/a.png)')).toBe('A link and alt')
  expect(html('- one\n- two')).toBe('one two')
})

test('syntax that does not pair up stays as written, and snake_case is not emphasis', () => {
  expect(html('2 * 3 = 6')).toBe('2 * 3 = 6')
  expect(html('use my_var_name here')).toBe('use my_var_name here')
  expect(html('open `tick')).toBe('open `tick')
})

test('the plain version is what an accessible name should say', () => {
  expect(plainInline('`const` makes **it**')).toBe('const makes it')
})

test('a sound is left out of a row\'s title, never shown as the word "audio"', () => {
  expect(html('hola\n\n[audio](media/a.mp3)')).toBe('hola')
  expect(plainInline('[audio](media/a.mp3) hola [audio](media/b.mp3)')).toBe('hola')
  expect(html('[audio](media/a.mp3)')).toBe('')
})

test('the backslashes the importer writes before a list number or a marker do not show', () => {
  expect(html('1\\. λέξη1')).toBe('1. λέξη1')
  expect(plainInline('\\# not a heading')).toBe('# not a heading')
  expect(html('keep a\\b and `x\\.y`')).toBe('keep a\\b and <code class="recall-code">x\\.y</code>')
})
