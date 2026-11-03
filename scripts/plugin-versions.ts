/**
 * A change to a plugin must raise its version. Localix, like Claude Code, updates an installed
 * plugin only when the version in its plugin.json moves; 67aa4252 changed mini-app-authoring and
 * kept 0.8.0, so no install ever received it.
 *
 *   bun scripts/plugin-versions.ts --staged        the commit being made (pre-commit)
 *   bun scripts/plugin-versions.ts <base> <head>   a pushed range (CI)
 */

export interface Unbumped {
  plugin: string
  before: string
  after: string
}

/** The plugins `changed` touches whose version did not go up. New and removed plugins pass. */
export function unbumpedPlugins(
  changed: string[],
  version: (plugin: string, side: 'before' | 'after') => string | undefined,
): Unbumped[] {
  const plugins = new Set(changed.flatMap((file) => /^plugins\/([^/]+)\//u.exec(file)?.[1] ?? []))
  const refused: Unbumped[] = []
  for (const plugin of [...plugins].sort()) {
    const before = version(plugin, 'before')
    const after = version(plugin, 'after')
    if (before === undefined || after === undefined) continue
    if (Bun.semver.order(after, before) <= 0) refused.push({ plugin, before, after })
  }
  return refused
}

const git = (args: string[]) => {
  const result = Bun.spawnSync(['git', ...args], { cwd: `${import.meta.dir}/..` })
  return result.exitCode === 0 ? result.stdout.toString() : undefined
}

/** The version in plugin.json at a git revision (`:` is the index). */
const versionAt = (revision: string, plugin: string) => {
  const text = git(['show', `${revision}plugins/${plugin}/.claude-plugin/plugin.json`])
  if (text === undefined) return undefined
  return (JSON.parse(text) as { version?: string }).version
}

if (import.meta.main) {
  const [first, second] = process.argv.slice(2)
  const staged = first === '--staged'
  if (!staged && (!first || !second)) {
    console.error('usage: plugin-versions.ts --staged | <base> <head>')
    process.exit(2)
  }
  const diff = staged
    ? ['diff', '--cached', '--name-only']
    : ['diff', '--name-only', `${first}...${second}`]
  const changed = (git(diff) ?? '').split('\n').filter(Boolean)
  const refused = unbumpedPlugins(changed, (plugin, side) =>
    side === 'before'
      ? versionAt(staged ? 'HEAD:' : `${first}:`, plugin)
      : versionAt(staged ? ':' : `${second}:`, plugin),
  )
  for (const { plugin, before, after } of refused) {
    console.error(
      `plugins/${plugin} changed but its version went ${before} → ${after}: raise "version" in ` +
        `plugins/${plugin}/.claude-plugin/plugin.json, or installs will never receive the change.`,
    )
  }
  process.exit(refused.length ? 1 : 0)
}
