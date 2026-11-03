import { describe, expect, test } from 'bun:test'

import { tempDirPerTest, writeTree } from '../testing/temp'
import type { CliContext } from './commands'
import { runCli } from './main'

const tempDir = tempDirPerTest('mini-app-pattern-')

/** The shape of the gallery the plugin ships: a pattern a file, its parts and its test beside it. */
const GALLERY = {
  'ui/format.ts': '/** Formatting helpers: money, percent, dates. More text. */\nexport const x = 1\n',
  'ui/format.test.ts': 'test("x", () => {})\n',
  'ui/patterns/board.tsx':
    "import { Card } from './board-parts'\n\n/**\n * BOARD — a kanban by stage, with drag and drop. Use it for anything with a status.\n */\nexport function Board() {}\n",
  'ui/patterns/board-parts.tsx':
    "// Board card.\nimport { STAGES } from '../../shared/model'\nimport { money } from '../format'\nexport function Card() {}\n",
  'ui/patterns/board.dom.test.tsx':
    "import { renderPattern } from './test-support'\ntest(\"moves a card\", () => {})\n",
  'ui/patterns/test-support.tsx':
    "// Test helpers shared by the patterns' tests.\nimport { money } from '../format'\nexport const renderPattern = money\n",
  'shared/model.ts': '// The gallery domain.\nexport const STAGES = []\n',
  'ui/patterns/form-dialog.tsx': '// Form dialog: add and edit in one dialog.\nexport function F() {}\n',
  'ui/patterns/form-dialog.dom.test.tsx': 'test("validates", () => {})\n',
}

function cli(files: Record<string, string> | null = GALLERY) {
  const patternsDir = tempDir()
  if (files) writeTree(patternsDir, files)
  const lines: string[] = []
  const context: CliContext = {
    cwd: tempDir(),
    out: (text) => lines.push(text),
    kit: async () => {
      throw new Error('a pattern needs no kit')
    },
    patternsDir,
  }
  return { context, output: () => lines.join('\n') }
}

describe('mini-app pattern', () => {
  test('with no name, lists each pattern with what it is for', async () => {
    const { context, output } = cli()
    expect(await runCli(['pattern'], context)).toBe(0)
    const lines = output().split('\n')
    expect(lines).toContain(
      '  board — a kanban by stage, with drag and drop.',
    )
    expect(lines).toContain('  form-dialog — Form dialog: add and edit in one dialog.')
    expect(lines).toContain('  format — Formatting helpers: money, percent, dates.')
    // Parts and tests are printed with their pattern, not listed as patterns of their own.
    expect(output()).not.toContain('board-parts —')
    expect(output()).not.toContain('board.dom.test')
    // Test helpers are not a pattern.
    expect(output()).not.toContain('test-support —')
  })

  test('prints a pattern whole: its file, its parts, then its test, each under its path', async () => {
    const { context, output } = cli()
    expect(await runCli(['pattern', 'board'], context)).toBe(0)
    const text = output()
    const at = (needle: string) => text.indexOf(needle)
    expect(at('// ui/patterns/board.tsx')).toBeGreaterThanOrEqual(0)
    expect(at('export function Board()')).toBeGreaterThan(at('// ui/patterns/board.tsx'))
    expect(at('// ui/patterns/board-parts.tsx')).toBeGreaterThan(at('export function Board()'))
    expect(at('// ui/patterns/board.dom.test.tsx')).toBeGreaterThan(at('export function Card()'))
    expect(text).toContain('test("moves a card"')
    expect(text).not.toContain('export function F()')
  })

  test('names the gallery files the pattern imports, once each, instead of printing them', async () => {
    const { context, output } = cli()
    expect(await runCli(['pattern', 'board'], context)).toBe(0)
    const text = output()
    // What its files import, then what those import — shared by every pattern, read once.
    const uses = text.slice(text.indexOf('It imports from the gallery'))
    for (const file of ['ui/format.ts', 'shared/model.ts', 'ui/patterns/test-support.tsx'])
      expect(uses).toContain(`mini-app pattern ${file}`)
    expect(text).not.toContain('export const STAGES')
    expect(text).not.toContain('// ui/format.ts\n')
  })

  test('prints one gallery file by its path', async () => {
    const { context, output } = cli()
    expect(await runCli(['pattern', 'shared/model.ts'], context)).toBe(0)
    expect(output()).toContain('// shared/model.ts\n')
    expect(output()).toContain('export const STAGES')
  })

  test('a path outside the gallery is refused', async () => {
    const { context } = cli()
    expect(await runCli(['pattern', '../package.json'], context)).toBe(1)
  })

  test('the formatting helpers are a pattern too, with their test', async () => {
    const { context, output } = cli()
    expect(await runCli(['pattern', 'format'], context)).toBe(0)
    expect(output()).toContain('// ui/format.ts')
    expect(output()).toContain('// ui/format.test.ts')
  })

  test('an unknown name is refused with the names there are', async () => {
    const { context, output } = cli()
    expect(await runCli(['pattern', 'kanban'], context)).toBe(1)
    expect(output()).toContain('No pattern "kanban"')
    expect(output()).toContain('board, form-dialog, format')
  })

  test('the gallery the plugin ships has every pattern the instruction names', async () => {
    const { context, output } = cli(null)
    // No patternsDir of its own: the plugin's gallery.
    delete context.patternsDir
    expect(await runCli(['pattern'], context)).toBe(0)
    for (const name of [
      'page-shell',
      'board',
      'master-detail',
      'data-table',
      'form-dialog',
      'dashboard',
      'states',
      'format',
    ])
      expect(output()).toContain(`  ${name} — `)
  })
})
