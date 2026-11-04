import { describe, expect, test } from 'bun:test'

import { PLUGIN_TEMPLATE } from '../kit/kit'
import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import type { CliContext } from './commands'
import { runCli } from './main'

const tempDir = tempDirPerTest('mini-app-cli-')

function cli(cwd = tempDir()) {
  const lines: string[] = []
  const context: CliContext = {
    cwd,
    out: (text) => lines.push(text),
    kit: async () => ({ kit: fakeKit(), source: { dir: '/kit', from: 'named' } }),
  }
  return { context, output: () => lines.join('\n') }
}

describe('mini-app', () => {
  test('with no command, prints what it can do', async () => {
    const { context, output } = cli()
    expect(await runCli([], context)).toBe(0)
    expect(output()).toContain('mini-app create <name>')
  })

  test('an unknown command is a usage error', async () => {
    const { context, output } = cli()
    expect(await runCli(['publish-everything'], context)).toBe(2)
    expect(output()).toContain('Unknown command "publish-everything"')
  })

  test('a folder that is not a mini app is said plainly, without a stack', async () => {
    const { context, output } = cli()
    expect(await runCli(['check'], context)).toBe(1)
    expect(output()).toMatch(
      /is not a mini app: it has no readable \.localix-mini-app\/mini-app\.json\.$/u,
    )
  })

  // Earlier mini apps kept the manifest at the folder's root; Localix no longer reads it there.
  test('a manifest at the folder’s root is said to move into .localix-mini-app/', async () => {
    const { context, output } = cli()
    writeTree(context.cwd, { 'mini-app.json': '{"name":"meal-log"}' })
    expect(await runCli(['check'], context)).toBe(1)
    expect(output()).toContain(
      'keeps its manifest at mini-app.json; move it to .localix-mini-app/mini-app.json',
    )
  })

  test('validate judges a package folder and fails on its problems', async () => {
    const dir = tempDir()
    writeTree(dir, { '.localix-mini-app/mini-app.json': '{"name":"gpu-monitor","backend":"./backend/index.ts"}' })
    const { context, output } = cli(dir)
    expect(await runCli(['validate', '.'], context)).toBe(1)
    expect(output()).toContain('backend ./backend/index.ts is a source file')
  })

  test('pack asks who publishes the app before building anything', async () => {
    const dir = tempDir()
    writeTree(dir, { '.localix-mini-app/mini-app.json': '{"name":"gpu-monitor"}' })
    const { context, output } = cli(dir)
    expect(await runCli(['pack'], context)).toBe(1)
    expect(output()).toContain('--publisher')
  })

  test('ci sets the app up to be released from GitHub, built with its Localix', async () => {
    const dir = tempDir()
    writeTree(dir, { '.localix-mini-app/mini-app.json': '{"name":"meal-log","displayName":"Meal Log"}' })
    const { context, output } = cli(dir)
    const kit = fakeKit()
    kit.manifest.localixVersion = '0.1.0-beta.18'
    context.kit = async () => ({ kit, source: { dir: '/kit', from: 'named' } })

    expect(await runCli(['ci'], context)).toBe(1)
    expect(output()).toContain('--publisher')

    expect(await runCli(['ci', '--publisher', 'rsaryev'], context)).toBe(0)
    const workflow = await Bun.file(`${dir}/.github/workflows/mini-app.yml`).text()
    expect(workflow).toContain('releases/download/v0.1.0-beta.18')
    expect(await Bun.file(`${dir}/.localix-mini-app/mini-app.json`).json()).toMatchObject({ author: 'rsaryev' })
    expect(await Bun.file(`${dir}/.gitignore`).text()).toContain('tsconfig.json')
    expect(output()).toContain('git tag v')

    // Named again, the publisher replaces the one kept, such as an app's copied "Localix".
    expect(await runCli(['ci', '--publisher', 'Ada'], context)).toBe(0)
    expect(await Bun.file(`${dir}/.localix-mini-app/mini-app.json`).json()).toMatchObject({ author: 'Ada' })
  })

  // The Store's page of the app, installed from its folder or from the catalog, links there.
  test('ci keeps the repository the app is released from in mini-app.json', async () => {
    const dir = tempDir()
    writeTree(dir, { '.localix-mini-app/mini-app.json': '{"name":"meal-log","author":"rsaryev"}' })
    const { context } = cli(dir)
    const kit = fakeKit()
    context.kit = async () => ({ kit, source: { dir: '/kit', from: 'named' } })

    expect(await runCli(['ci', '--repository', 'rsaryev/meal-log'], context)).toBe(0)
    expect(await Bun.file(`${dir}/.localix-mini-app/mini-app.json`).json()).toMatchObject({
      author: 'rsaryev',
      repository: 'https://github.com/rsaryev/meal-log',
    })
  })

  test('kit names where the kit came from', async () => {
    const { context, output } = cli()
    expect(await runCli(['kit'], context)).toBe(0)
    expect(output()).toContain('Kit: /kit (from named)')
  })

  test('kit says when the running Localix is newer than the kit the app builds against', async () => {
    const { context, output } = cli()
    const kit = fakeKit()
    kit.manifest.localixVersion = '0.4.0'
    context.kit = async () => ({ kit, source: { dir: '/app/kit', from: 'installed' } })
    context.runningLocalix = async () => ({ baseUrl: 'http://127.0.0.1:5051', version: '0.5.0' })
    expect(await runCli(['kit'], context)).toBe(0)
    expect(output()).toContain('Localix 0.5.0 is running; this app builds against 0.4.0')
    expect(output()).toContain('mini-app kit --update')
  })

  test('kit says when the app’s kit is exactly the running Localix’s contract', async () => {
    const { context, output } = cli()
    const kit = fakeKit()
    kit.manifest.contract = 'c'.repeat(64)
    context.kit = async () => ({ kit, source: { dir: '/app/kit', from: 'installed' } })
    context.runningLocalix = async () => ({
      baseUrl: 'http://127.0.0.1:5051',
      miniAppContract: 'c'.repeat(64),
    })
    expect(await runCli(['kit'], context)).toBe(0)
    expect(output()).toContain('matches the running Localix exactly')
  })

  // A development Localix implements a contract no release's kit carries.
  test('kit --update says how to build against a checkout when no release matches', async () => {
    const dir = tempDir()
    writeTree(dir, { '.localix-mini-app/mini-app.json': '{"name":"meal-log"}' })
    const { context, output } = cli(dir)
    context.updateKit = async (appDir) => {
      const kit = fakeKit()
      kit.manifest.localixVersion = '0.5.0'
      kit.manifest.contract = 'a'.repeat(64)
      return { kit, source: { dir: `${appDir}/kit`, from: 'installed' } }
    }
    context.runningLocalix = async () => ({
      baseUrl: 'http://127.0.0.1:5051',
      miniAppContract: 'b'.repeat(64),
    })
    expect(await runCli(['kit', '--update'], context)).toBe(0)
    expect(output()).toContain('bun run mini-app-kit')
    expect(output()).toContain('MINI_APP_KIT=<localix checkout>/.turbo/mini-app-kit')
    // A release asked for by name is what was wanted, whatever runs.
    const before = output().length
    expect(await runCli(['kit', '--update', '--version', '0.4.0'], context)).toBe(0)
    expect(output().slice(before)).not.toContain('MINI_APP_KIT=')
  })

  test('kit --update installs a release’s kit into the app', async () => {
    const dir = tempDir()
    writeTree(dir, { '.localix-mini-app/mini-app.json': '{"name":"meal-log"}' })
    const { context, output } = cli(dir)
    const asked: unknown[] = []
    context.updateKit = async (appDir, version) => {
      asked.push({ appDir, version })
      const kit = fakeKit()
      kit.manifest.localixVersion = '0.5.0'
      return {
        kit,
        source: { dir: `${appDir}/node_modules/@localixai/mini-app-kit`, from: 'installed' },
      }
    }
    expect(await runCli(['kit', '--update'], context)).toBe(0)
    expect(await runCli(['kit', '.', '--update', '--version', '0.4.0'], context)).toBe(0)
    expect(asked).toEqual([
      { appDir: dir, version: undefined },
      { appDir: dir, version: '0.4.0' },
    ])
    expect(output()).toContain('now builds against Localix 0.5.0')
  })

  // The new app keeps its own kit, so the agent reads the SDK from the app's folder.
  test('create puts the kit into the new app and builds with that one', async () => {
    const cwd = tempDir()
    const { context } = cli(cwd)
    const asked: (string | undefined)[] = []
    context.kit = async (appDir) => {
      asked.push(appDir)
      const kit = fakeKit()
      kit.templateDir = PLUGIN_TEMPLATE
      kit.manifest.apiVersion = 2
      return { kit, source: { dir: '/kit', from: appDir ? 'installed' : 'release' } }
    }
    expect(await runCli(['create', 'meal-log', '--no-check'], context)).toBe(0)
    expect(asked).toEqual([undefined, `${cwd}/meal-log`])
  })

  // A plugin newer than the person's Localix would print a contract its kit cannot build.
  test('create refuses a kit older than the app layer, and says how to update', async () => {
    const { context, output } = cli()
    expect(await runCli(['create', 'meal-log'], context)).toBe(1)
    expect(output()).toContain('mini-app get-localix')
  })
})
