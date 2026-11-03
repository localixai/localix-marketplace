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
// The template and the pattern gallery are mini apps of the plugin's own: a change to one checks it.
const GALLERIES = { template: 'plugins/mini-app-authoring/template/', patterns: 'plugins/mini-app-authoring/patterns/' }
const galleries = Object.entries(GALLERIES)
  .filter(([, prefix]) => staged.some((file) => file.startsWith(prefix)))
  .map(([name]) => name)
const plugin = staged.some(
  (file) =>
    file.startsWith('scripts/') ||
    (file.startsWith('plugins/') &&
      !Object.values(GALLERIES).some((prefix) => file.startsWith(prefix))),
)

const run = (cmd: string[], cwd = ROOT) => {
  console.log(`$ ${cmd.join(' ')}`)
  const result = Bun.spawnSync(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1)
}

// The authoring plugin builds every mini app: a change to it checks the plugins and them all.
if (plugin || staged.includes('.claude-plugin/marketplace.json')) run(['bun', 'scripts/check.ts'])
else if (miniApps.length || galleries.length)
  run(['bun', 'scripts/check.ts', ...miniApps, ...galleries])
