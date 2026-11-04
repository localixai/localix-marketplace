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
