import { describe, expect, test } from 'bun:test'
import { htmlToMarkdown, looksLikeHtml } from './html-to-md'

const md = (html: string, image?: (src: string) => string | null) => htmlToMarkdown(html, { image }).markdown

describe('htmlToMarkdown', () => {
  test.each([
    ['line breaks', 'one<br>two<br/>three', 'one\ntwo\nthree'],
    ['two breaks make a blank line', 'one<br><br>two', 'one\n\ntwo'],
    ["Anki's lines in divs", '<div>one</div><div>two</div>', 'one\ntwo'],
    ['an empty div line is a blank line', '<div>one</div><div><br></div><div>three</div>', 'one\n\nthree'],
    ['a break that ends a div adds nothing', '<div>one<br></div><div>two</div>', 'one\ntwo'],
    ['paragraphs', '<p>one</p><p>two</p>', 'one\n\ntwo'],
    ['bold and italic', '<b>bold</b>, <strong>strong</strong>, <i>it</i>, <em>em</em>', '**bold**, **strong**, *it*, *em*'],
    ['emphasis keeps edge spaces outside', 'a<b> bold </b>b', 'a **bold** b'],
    ['nested bold is bold once', '<b>a <strong>b</strong></b>', '**a b**'],
    ['bold across lines wraps each line', '<b>one<br>two</b>', '**one**\n**two**'],
    ['underline keeps its text', 'an <u>underlined</u> word', 'an underlined word'],
    ['inline code', 'run <code>ls -la</code> now', 'run `ls -la` now'],
    ['inline code with a backtick', '<code>a`b</code>', '``a`b``'],
    ['a code block keeps its lines and language', '<pre class="language-ts">const a = 1;\n  return &lt;a&gt;</pre>', '```ts\nconst a = 1;\n  return <a>\n```'],
    ['a list', '<ul><li>one</li><li>two</li></ul>', '- one\n- two'],
    ['a numbered list', '<ol start="3"><li>three</li><li>four</li></ol>', '3. three\n4. four'],
    ['a nested list', '<ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul>', '- one\n  - inner\n- two'],
    ['list items left open', '<ul><li>one<li>two</ul>', '- one\n- two'],
    ['a link', '<a href="https://example.com/a b">site</a>', '[site](https://example.com/a%20b)'],
    ['a script link keeps only its text', '<a href="javascript:alert(1)">click</a>', 'click'],
    ['entities', 'a&nbsp;b &amp; c &lt;d&gt; &#233; &#x41; &hellip; &bogus;', 'a b & c \\<d> é A … &bogus;'],
    ['scripts and styles go with their content', 'a<script>alert(1)</script><style>b{}</style>b', 'ab'],
    ['an unclosed script removes the rest', 'a<script>alert(1)', 'a'],
    ['unknown tags keep their text', '<span style="color:red">red</span> <font>f</font> <custom-x>c</custom-x>', 'red f c'],
    ['comments go', 'a<!-- secret -->b', 'ab'],
    ['cloze marks stay', '{{c1::Paris::city}} is in {{c2::<b>France</b>}}', '{{c1::Paris::city}} is in {{c2::**France**}}'],
    ['Markdown syntax in text is escaped', '2*3*4 [x] snake_case _x_', '2\\*3\\*4 \\[x\\] snake_case \\_x\\_'],
    ['a line that would be a heading or list is escaped', '<div># not</div><div>- not</div><div>1. not</div><div>---</div>', '\\# not\n\\- not\n1\\. not\n\\---'],
    ['a heading', '<h2>Title</h2>text', '## Title\n\ntext'],
    ['whitespace collapses', '  one \n\t two  ', 'one two'],
  ])('%s', (_name, html, expected) => {
    expect(md(html)).toBe(expected)
  })

  test('sounds and videos are dropped and counted', () => {
    const result = htmlToMarkdown('word[sound:a.mp3] [sound:b.mp3]<audio src="c.mp3"></audio><video src="d.mp4"></video>')
    expect(result).toEqual({ markdown: 'word', sounds: 3, videos: 1, images: 0 })
  })

  test('images go through the resolver; dropped ones are counted', () => {
    const resolve = (src: string) => (src === 'cat.jpg' ? 'media/abc.jpg' : src.startsWith('https:') ? src : null)
    const result = htmlToMarkdown('<img src="cat.jpg" alt="a cat"><img src="dog.jpg"><img src="https://x.test/p.png">', {
      image: resolve,
    })
    expect(result.markdown).toBe('![a cat](media/abc.jpg)[image](https://x.test/p.png)')
    expect(result.images).toBe(1)
  })

  test('without a resolver every image is dropped', () => {
    expect(htmlToMarkdown('a<img src="x.png">').images).toBe(1)
  })

  test('markers inside the input cannot reach the output', () => {
    expect(md('a\u0001\u0004\u0006b')).toBe('ab')
  })

  test('deep nesting does not overflow', () => {
    expect(md(`${'<b><i><span>'.repeat(5000)}deep`)).toBe('***deep***')
  })

  test('a code block inside a list item keeps its indentation', () => {
    expect(md('<ul><li>run<pre>a\nb</pre></li></ul>')).toBe('- run\n\n  ```\n  a\n  b\n  ```')
  })
})

describe('looksLikeHtml', () => {
  test.each([
    ['a<br>b', true],
    ['<b>x</b>', true],
    ['caf&eacute;', true],
    ['a < b and c > d', false],
    ['plain', false],
  ])('%p → %p', (text, expected) => {
    expect(looksLikeHtml(text)).toBe(expected)
  })
})
