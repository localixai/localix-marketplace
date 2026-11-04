import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import type { CliContext } from './commands'
import { runCli } from './main'

const tempDir = tempDirPerTest('mini-app-icon-')
const GLYPH = '<path d="M12 2v20"/><circle cx="12" cy="12" r="4"/>'

function miniApp() {
  const dir = tempDir()
  writeTree(dir, { '.localix-mini-app/mini-app.json': '{"name":"meal-log","icon":"./icon.svg"}' })
  const lines: string[] = []
  const context: CliContext = {
    cwd: dir,
    out: (text) => lines.push(text),
    kit: async () => ({ kit: fakeKit(), source: { dir: '/kit', from: 'named' } }),
  }
  return { dir, context, output: () => lines.join('\n') }
}

test('draws the glyph on the store tile into the icon the manifest names', async () => {
  const { dir, context, output } = miniApp()
  expect(await runCli(['icon', '.', '--glyph', GLYPH], context)).toBe(0)
  const icon = readFileSync(join(dir, 'icon.svg'), 'utf8')
  expect(icon).toStartWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"')
  expect(icon).toContain('<path d="M12 2v20"/><circle cx="12" cy="12" r="4"/>')
  expect(output()).toContain('icon.svg')
})

test('takes a whole 24×24 icon from a file, keeping only its shapes', async () => {
  const { dir, context } = miniApp()
  writeTree(dir, {
    'glyph.svg': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${GLYPH}</svg>`,
  })
  expect(await runCli(['icon', '.', '--glyph', 'glyph.svg', '--tint', '#4ade80'], context)).toBe(0)
  const icon = readFileSync(join(dir, 'icon.svg'), 'utf8')
  expect(icon).toContain(GLYPH)
  expect(icon).toContain('stroke="#4ade80"')
})

test('refuses markup that is not a plain shape, and writes nothing', async () => {
  const { dir, context, output } = miniApp()
  const glyph = '<path d="M1 1"/><script>alert(1)</script>'
  expect(await runCli(['icon', '.', '--glyph', glyph], context)).toBe(1)
  expect(output()).toContain('only path, circle, rect, line, polyline, polygon and ellipse')
  expect(() => readFileSync(join(dir, 'icon.svg'))).toThrow()
})

/** A kit whose vendored lucide-react holds `house` (aliased `home`), as a release's kit does. */
function withLucide() {
  const app = miniApp()
  const kitDir = tempDir()
  writeTree(kitDir, {
    'ui/vendor/lucide-react/dist/esm/icons/house.mjs': `const __iconData = {
  name: "house",
  size: 24,
  node: [
    ["path", { d: "M15 21v-8", key: "5wwlr5" }],
    ["circle", { cx: "12", cy: "7", r: "2", key: "abc" }]
  ],
  aliases: ["home"]
};
export { __iconData };
`,
    // An old name with a module of its own re-exports the icon, as `bar-chart-3.mjs` does.
    'ui/vendor/lucide-react/dist/esm/icons/home-alt.mjs': "export { default } from './house.mjs';\n",
  })
  app.context.kit = async () => ({ kit: fakeKit({ dir: kitDir }), source: { dir: kitDir, from: 'named' } })
  return app
}

// Every agent that drew an icon wrote its own script to turn a lucide name into markup.
test('takes a lucide icon by its name, or by one of its aliases, from the kit', async () => {
  for (const name of ['house', 'home', 'home-alt']) {
    const { dir, context } = withLucide()
    expect(await runCli(['icon', '.', '--glyph', name], context)).toBe(0)
    expect(readFileSync(join(dir, 'icon.svg'), 'utf8')).toContain(
      '<path d="M15 21v-8"/><circle cx="12" cy="7" r="2"/>',
    )
  }
})

test('names the miss when no lucide icon has that name', async () => {
  const { context, output } = withLucide()
  expect(await runCli(['icon', '.', '--glyph', 'no-such-icon'], context)).toBe(1)
  expect(output()).toContain('No lucide icon "no-such-icon"')
})
