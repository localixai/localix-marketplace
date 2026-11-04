import { ROOT } from './kit'

/** What the staged change touches, checked the way CI checks it — nothing else. */
const staged = Bun.spawnSync(['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMRD'], {
  cwd: ROOT,
})
  .stdout.toString()
  .split('\n')
  .filter(Boolean)

const miniApps = [
  ...new Set(staged.flatMap((file) => /^mini-apps\/([^/]+)\//u.exec(file)?.[1] ?? [])),
].sort()
// The starter and the build skill's example apps are mini apps of the plugin's own: a change to one
// checks it (`template`, `examples/<name>`), not the whole plugin.
const TEMPLATE = 'plugins/mini-app-authoring/template/'
const EXAMPLES = /^plugins\/mini-app-authoring\/skills\/build\/examples\/([^/]+)\//u
/** The plugin's own mini app a file belongs to, as `scripts/check.ts` names it, or null. */
function ownMiniApp(file: string): string | null {
  if (file.startsWith(TEMPLATE)) return 'template'
  const example = EXAMPLES.exec(file)?.[1]
  return example ? `examples/${example}` : null
}
const galleries = [...new Set(staged.flatMap((file) => ownMiniApp(file) ?? []))].sort()
const plugin = staged.some(
  (file) =>
    file.startsWith('scripts/') ||
    (file.startsWith('plugins/') && !ownMiniApp(file)),
)

const run = (cmd: string[], cwd = ROOT) => {
  console.log(`$ ${cmd.join(' ')}`)
  const result = Bun.spawnSync(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1)
}

// A plugin that changes must raise its version, or no install ever receives the change.
run(['bun', 'scripts/plugin-versions.ts', '--staged'])

// The authoring plugin builds every mini app: a change to it checks the plugins and them all.
if (plugin || staged.includes('.claude-plugin/marketplace.json')) run(['bun', 'scripts/check.ts'])
else if (miniApps.length || galleries.length)
  run(['bun', 'scripts/check.ts', ...miniApps, ...galleries])
