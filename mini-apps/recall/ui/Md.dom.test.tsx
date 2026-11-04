import { expect, test } from 'bun:test'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Md } from './Md'
import { FakeAudio, bindBackend, click, setupDom, setupFakeAudio } from './test-support'

setupDom()
setupFakeAudio()

async function render(markdown: string) {
  const fake = bindBackend()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<Md>{markdown}</Md>))
  return {
    container,
    done: async () => {
      await act(async () => root.unmount())
      container.remove()
      fake.unbind()
    },
  }
}

test('sounds leave the text and come back as play buttons after it, one per sound', async () => {
  const view = await render('Hola\n\n[audio](media/a.mp3)\n\nMore text\n\n[audio](media/b.ogg)')
  try {
    expect(view.container.textContent).toContain('Hola')
    expect(view.container.textContent).toContain('More text')
    expect(view.container.textContent).not.toMatch(/audio|media\//)
    const names = [...view.container.querySelectorAll('button')].map((b) =>
      b.getAttribute('aria-label'),
    )
    expect(names).toEqual(['Play sound', 'Play sound 2'])
    await act(async () => click(view.container.querySelectorAll('button')[1]!))
    expect(FakeAudio.instances.map((a) => a.src)).toEqual(['/rpc/recall/media/b.ogg'])
  } finally {
    await view.done()
  }
})

test('a text with no sound has no buttons, and a sound alone has no empty text block', async () => {
  const plain = await render('Just words')
  expect(plain.container.querySelectorAll('button')).toHaveLength(0)
  await plain.done()
  const alone = await render('[audio](media/a.mp3)')
  try {
    expect(alone.container.querySelectorAll('button')).toHaveLength(1)
    expect(alone.container.querySelector('.recall-md')?.children).toHaveLength(1)
  } finally {
    await alone.done()
  }
})
