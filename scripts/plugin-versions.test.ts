import { describe, expect, test } from 'bun:test'

import { unbumpedPlugins } from './plugin-versions'

/** Versions of each plugin before and after the change, as its plugin.json says. */
const versions =
  (table: Record<string, [before: string | undefined, after: string | undefined]>) =>
  (plugin: string, side: 'before' | 'after') =>
    table[plugin]?.[side === 'before' ? 0 : 1]

describe('a change to a plugin in this marketplace', () => {
  // Localix, like Claude Code, updates an installed plugin only when its version moves:
  // 67aa4252 changed mini-app-authoring at 0.8.0 and no install ever received it.
  test('is refused when the plugin keeps its version', () => {
    const changed = ['plugins/mini-app-authoring/patterns/board/ui/Board.tsx']
    expect(
      unbumpedPlugins(changed, versions({ 'mini-app-authoring': ['0.8.0', '0.8.0'] })),
    ).toEqual([{ plugin: 'mini-app-authoring', before: '0.8.0', after: '0.8.0' }])
  })

  test('is refused when the version goes down', () => {
    const changed = ['plugins/team/agents/architect.md']
    expect(unbumpedPlugins(changed, versions({ team: ['0.2.0', '0.1.9'] }))).toHaveLength(1)
  })

  test('passes once the version goes up', () => {
    const changed = [
      'plugins/mini-app-authoring/skills/build/SKILL.md',
      'plugins/mini-app-authoring/.claude-plugin/plugin.json',
    ]
    expect(
      unbumpedPlugins(changed, versions({ 'mini-app-authoring': ['0.8.0', '0.9.0'] })),
    ).toEqual([])
  })

  test('a new or removed plugin, and files outside any plugin, ask nothing', () => {
    const changed = [
      'plugins/fresh/README.md',
      'plugins/gone/x.md',
      'plugins/README.md',
      'mini-apps/crm/app.ts',
    ]
    const table = versions({ fresh: [undefined, '0.1.0'], gone: ['1.0.0', undefined] })
    expect(unbumpedPlugins(changed, table)).toEqual([])
  })
})
