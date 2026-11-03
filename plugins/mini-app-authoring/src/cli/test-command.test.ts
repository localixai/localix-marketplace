import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { TestRunner } from '../check/check'
import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import type { CliContext } from './commands'
import { runCli } from './main'

const tempDir = tempDirPerTest('mini-app-test-')

function cli(result = { ok: true, output: '3 pass\n0 fail' }) {
  const cwd = tempDir()
  writeTree(cwd, {
    'budget/.localix-mini-app/mini-app.json': '{"name":"budget"}',
    'budget/backend/index.test.ts': "test('adds', () => {})\n",
  })
  const runs: Parameters<TestRunner>[0][] = []
  const lines: string[] = []
  const kit = fakeKit({ dir: '/kit' })
  const context: CliContext = {
    cwd,
    out: (text) => lines.push(text),
    kit: async () => ({ kit, source: { dir: '/kit', from: 'named' } }),
    runTests: async (input) => {
      runs.push(input)
      return result
    },
  }
  return { context, runs, output: () => lines.join('\n'), app: join(cwd, 'budget'), kit }
}

describe('mini-app test', () => {
  test('runs the app’s tests the way check does, with the kit serving the host’s modules', async () => {
    const { context, runs, output, app, kit } = cli()
    expect(await runCli(['test', 'budget'], context)).toBe(0)
    expect(runs).toEqual([
      { miniAppDir: app, preload: join(kit.dir, kit.manifest.authoring.testPreload), filters: [] },
    ])
    // The SDK and the kit resolve through the paths check writes.
    expect(existsSync(join(app, 'tsconfig.json'))).toBe(true)
    expect(output()).toContain('3 pass')
  })

  test('runs only the files named after the folder', async () => {
    const { context, runs } = cli()
    await runCli(['test', 'budget', 'ui/App.dom.test.tsx', 'shared'], context)
    expect(runs[0]?.filters).toEqual(['ui/App.dom.test.tsx', 'shared'])
  })

  test('inside the app, every name is a file to run', async () => {
    const { context, runs, app } = cli()
    context.cwd = app
    await runCli(['test', 'ui/App.dom.test.tsx'], context)
    expect(runs[0]).toMatchObject({ miniAppDir: app, filters: ['ui/App.dom.test.tsx'] })
  })

  test('a failing test fails the command and shows bun’s report', async () => {
    const { context, output } = cli({ ok: false, output: '(fail) adds\n1 fail' })
    expect(await runCli(['test', 'budget'], context)).toBe(1)
    expect(output()).toContain('(fail) adds')
  })
})
