import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { kitDir, ROOT } from './kit'

/**
 * Check every mini app (or the ones named) with the same toolchain any mini app is checked with —
 * `mini-app check`: manifest, style, routes, store media, backend and UI builds, types and tests.
 * The template the authoring plugin copies, and its pattern gallery, are two of them.
 *
 * `mini-apps` checks every mini app and nothing else: what a Localix release runs against the kit it is
 * about to publish (`MINI_APP_KIT=<kit>`), where Claude Code is not installed.
 *
 * Named `plugins`, or with nothing named, it first checks the plugins: the authoring plugin's
 * types and tests and this repository's `.localix-mini-app/marketplace.json` with Localix's own
 * rules (the kit's, curation allowed: this is the Localix marketplace), then Claude Code's
 * validation — each plugin with `--strict`, the marketplace without it, because its Localix
 * curation (`plugins[].localix`, `metadata.localix.collections`) is a field Claude Code does not
 * know and ignores at load time.
 */
const MINI_APPS = join(ROOT, 'mini-apps')
const TEMPLATE = join(ROOT, 'plugins', 'mini-app-authoring', 'template')
/** The working screens `mini-app pattern` prints: checked against every kit, like the template. */
const PATTERNS = join(ROOT, 'plugins', 'mini-app-authoring', 'patterns')
const TOOL = join(ROOT, 'plugins', 'mini-app-authoring', 'bin', 'mini-app')

const onlyMiniApps = process.argv.includes('mini-apps')
const named = process.argv.slice(2).filter((name) => name !== 'mini-apps')
const PLUGINS = join(ROOT, 'plugins')

const env = { ...process.env, MINI_APP_KIT: await kitDir() }

function step(cmd: string[], cwd = ROOT): boolean {
  console.log(`$ ${cmd.join(' ')}`)
  return Bun.spawnSync(cmd, { cwd, env, stdout: 'inherit', stderr: 'inherit' }).exitCode === 0
}

function checkPlugins(): boolean {
  if (!Bun.which('claude')) {
    console.error('Claude Code is not installed: `claude plugin validate` checks the plugins.')
    return false
  }
  const plugins = readdirSync(PLUGINS)
    .filter((name) => existsSync(join(PLUGINS, name, '.claude-plugin', 'plugin.json')))
    .map((name) => join('plugins', name))
  return [
    step(['bun', 'run', 'type-check'], join(PLUGINS, 'mini-app-authoring')),
    step(['bun', 'run', 'test:plugins']),
    step([TOOL, 'marketplace', 'validate', '--curation']),
    ...plugins.map((plugin) => step(['claude', 'plugin', 'validate', '--strict', plugin])),
    step(['claude', 'plugin', 'validate', '.']),
  ].every(Boolean)
}

if (!onlyMiniApps && (!named.length || named.includes('plugins')) && !checkPlugins()) {
  console.error('\nThe plugins failed their checks.')
  process.exit(1)
}
const apps = named.filter((name) => name !== 'plugins')
if (named.length && !apps.length) process.exit(0)
const all = [
  ...readdirSync(MINI_APPS)
    .filter((name) => existsSync(join(MINI_APPS, name, '.localix-mini-app', 'mini-app.json')))
    .map((name) => join(MINI_APPS, name)),
  TEMPLATE,
  PATTERNS,
]
const targets = apps.length
  ? all.filter((dir) => apps.some((name) => dir.endsWith(`/${name}`)))
  : all

const failed: string[] = []
for (const dir of targets) {
  const args = dir === TEMPLATE ? ['check', dir, '--template'] : ['check', dir]
  const run = Bun.spawnSync([TOOL, ...args], { env, stdout: 'pipe', stderr: 'pipe' })
  const output = `${run.stdout.toString()}${run.stderr.toString()}`.trim()
  console.log(output)
  if (run.exitCode !== 0) failed.push(dir.replace(`${ROOT}/`, ''))
}
if (failed.length) {
  console.error(`\n${failed.length} of ${targets.length} failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`\nAll ${targets.length} mini apps pass.`)
