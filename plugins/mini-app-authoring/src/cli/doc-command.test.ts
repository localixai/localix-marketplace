import { describe, expect, test } from 'bun:test'

import { PLUGIN_BUILD_SKILL } from '../kit/kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import type { CliContext } from './commands'
import { runCli } from './main'

const tempDir = tempDirPerTest('mini-app-doc-')

/** The shape of the build skill the plugin ships: the skill, its references, its examples. */
const SKILL = {
  'SKILL.md': '---\nname: build\ndescription: How to build.\n---\n\n# Build a Localix mini app\n\nOrder of work.\n',
  'references/data.md': 'Read this for collections.\n\n# Data\n',
  'references/canvas.md': 'Read this for boards on the canvas.\n\n# Canvas\n',
  'examples/board/README.md': '# Board example\n\nA kanban per chat.\n',
  'examples/board/backend/index.ts': 'export const register = 1\n',
  'examples/board/ui/App.tsx': 'export function App() {}\n',
  'examples/board/ui/App.dom.test.tsx': 'test("moves", () => {})\n',
  'examples/board/dist/ui.js': 'built\n',
  'examples/board/KIT.md': 'generated\n',
}

function cli(skillDir: string = tempDir()) {
  const lines: string[] = []
  const context: CliContext = {
    cwd: tempDir(),
    out: (text) => lines.push(text),
    kit: async () => {
      throw new Error('a doc needs no kit')
    },
    skillDir,
  }
  return { context, output: () => lines.join('\n') }
}

function withSkill() {
  const dir = tempDir()
  writeTree(dir, SKILL)
  return cli(dir)
}

describe('mini-app doc', () => {
  // Inside Localix an agent may not read the plugin's folder, but it may always run `mini-app`.
  test('with no topic, prints the skill without its front matter, then every topic and example', async () => {
    const { context, output } = withSkill()
    expect(await runCli(['doc'], context)).toBe(0)
    const text = output()
    expect(text).toContain('# Build a Localix mini app')
    expect(text).not.toContain('name: build')
    expect(text).toContain('mini-app doc canvas — Read this for boards on the canvas.')
    expect(text).toContain('mini-app doc data — Read this for collections.')
    expect(text).toContain('mini-app doc board — A kanban per chat.')
  })

  test('prints a reference by its topic', async () => {
    const { context, output } = withSkill()
    expect(await runCli(['doc', 'data'], context)).toBe(0)
    expect(output()).toContain('# Data')
  })

  test('prints an example’s README and the files to print next, without built or generated ones', async () => {
    const { context, output } = withSkill()
    expect(await runCli(['doc', 'board'], context)).toBe(0)
    const text = output()
    expect(text).toContain('A kanban per chat.')
    expect(text).toContain('mini-app doc board/ui/App.tsx')
    expect(text).toContain('mini-app doc board/ui/App.dom.test.tsx')
    expect(text).not.toContain('dist/ui.js')
    expect(text).not.toContain('KIT.md')
  })

  test('prints one file of an example by its path', async () => {
    const { context, output } = withSkill()
    expect(await runCli(['doc', 'board/backend/index.ts'], context)).toBe(0)
    expect(output()).toContain('export const register = 1')
  })

  test('refuses a path that leaves the examples, and names what there is', async () => {
    const { context, output } = withSkill()
    expect(await runCli(['doc', 'board/../../SKILL.md'], context)).toBe(1)
    expect(await runCli(['doc', 'nothing'], context)).toBe(1)
    expect(output()).toContain('No topic or example "nothing"')
    expect(output()).toContain('data')
  })

  // The skill the plugin ships: every row of its table names a topic and an example that print.
  test('every reference and example the shipped skill names exists', async () => {
    const { context, output } = cli(PLUGIN_BUILD_SKILL)
    expect(await runCli(['doc'], context)).toBe(0)
    const text = output()
    const named = [...text.matchAll(/`(references|examples)\/([a-z-]+)(?:\.md|\/)`/gu)]
    expect(named.length).toBeGreaterThan(10)
    for (const [, , topic] of named) expect(text).toContain(`mini-app doc ${topic} — `)
  })
})
