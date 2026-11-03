import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PLUGIN_TEMPLATE } from '../kit/kit'
import { fakeKit } from '../testing/fake-kit'
import { agentInstruction, agentsMd, readme } from './prose'
import { listFiles, loadTemplateScaffold } from './template-layout'

const scaffold = loadTemplateScaffold(PLUGIN_TEMPLATE)
const kit = fakeKit({ dir: '/apps/budget/node_modules/@localixai/mini-app-kit' })
kit.templateDir = PLUGIN_TEMPLATE
const app = { name: 'budget', displayName: 'Budget', description: 'Spending by category.' }
const instruction = agentInstruction({ ...app, dir: '/apps/budget', kit, scaffold })
/** Whether the import line lets a file import `specifier`: named, or under a `prefix*` it does not except. */
function allows(line: string, specifier: string): boolean {
  if (line.includes(`not ${specifier}`)) return false
  if (line.includes(specifier)) return true
  return [...line.matchAll(/(@localixai\/[\w/-]+)\*/gu)].some(
    ([, prefix]) =>
      specifier.startsWith(prefix!) && !line.includes(`not ${specifier.slice(prefix!.length)}`),
  )
}
const templateTests = listFiles(PLUGIN_TEMPLATE).filter((file) => /\.test\.tsx?$/u.test(file))

describe('what a new mini app is told', () => {
  // A copy kept two of the template's tests about its old domain; the check then failed on each.
  test('names every test the template carries, to rewrite for the app', () => {
    expect(templateTests.length).toBeGreaterThan(0)
    for (const file of templateTests) expect(instruction).toContain(`/apps/budget/${file}`)
  })

  // The template renders its screen in a test; the instruction once said no test could.
  test('allows every module the template’s own tests import', () => {
    const imported = new Set(
      templateTests.flatMap((file) =>
        [
          ...readFileSync(join(PLUGIN_TEMPLATE, file), 'utf8').matchAll(
            /from '(@localixai\/[^']+)'/gu,
          ),
        ].map((match) => match[1]!),
      ),
    )
    expect(imported.size).toBeGreaterThan(0)
    const line = instruction.split('\n').find((text) => text.startsWith('Imports:'))!
    for (const specifier of imported) {
      expect(`${specifier}: ${allows(line, specifier)}`).toBe(`${specifier}: true`)
    }
  })

  // An agent that needed a table's or a dialog's props guessed them, or searched the disk.
  test('says how to read the props of any kit or SDK module, in the app and in later sessions', () => {
    expect(instruction).toContain('mini-app api ')
    expect(agentsMd({ ...app, kit, scaffold })).toContain('mini-app api ')
  })

  test('says how to run one test file alone', () => {
    expect(instruction).toContain('mini-app test /apps/budget')
  })

  // A CRM's first check failed on category "business": the instruction never named the choices.
  test('names the categories the kit accepts, read from the kit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prose-kit-'))
    try {
      writeFileSync(
        join(dir, 'API.md'),
        "## module @localixai/mini-app-sdk/manifest-primitives\n\n### MINI_APP_CATEGORIES\n\n```ts\nexport declare const MINI_APP_CATEGORIES: readonly [\n    'development',\n    'data',\n    'games'\n];\n```\n\n### MINI_APP_TAGS_MAX\n",
      )
      const withApi = fakeKit({ dir })
      withApi.templateDir = PLUGIN_TEMPLATE
      const told = agentInstruction({ ...app, dir: '/apps/budget', kit: withApi, scaffold })
      expect(told).toContain('category (one of development, data, games)')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('the README describes the app, not the template it was copied from', () => {
    const text = readme(app)
    expect(text).toContain('Spending by category.')
    expect(text).not.toContain(scaffold.domainName)
  })
})
