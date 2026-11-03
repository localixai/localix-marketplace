import { describe, expect, test } from 'bun:test'

import { fakeKit } from '../testing/fake-kit'
import { tempDirPerTest, writeTree } from '../testing/temp'
import type { CliContext } from './commands'
import { runCli } from './main'

const tempDir = tempDirPerTest('mini-app-api-')

/** The shape of the `API.md` a kit carries: a section per module, a heading per export. */
const API = `# Mini app API

apiVersion: 2

## Served to a mini app UI

- @localixai/kit/dialog

## module @localixai/kit/dialog

### Dialog

\`\`\`ts
export declare const Dialog: (props: { open?: boolean }) => React.ReactElement | null;
\`\`\`

### DialogContent

\`\`\`ts
export declare const DialogContent: (props: { layout?: DialogContentLayout }) => React.ReactElement | null;
\`\`\`

## module @localixai/kit/dialog-hero

### DialogHero

\`\`\`ts
export declare const DialogHero: (props: { icon: React.ReactNode }) => React.ReactElement | null;
\`\`\`

## module @localixai/mini-app-sdk/ui

### TableGrid

\`\`\`ts
export declare function TableGrid(props: MiniAppTableGridProps): import("react").JSX.Element;
\`\`\`

## module @localixai/mini-app-sdk/ui/components

### MiniAppTableGridProps

\`\`\`ts
export interface MiniAppTableGridProps { rows: readonly TableRow[] }
\`\`\`

### TableGrid

\`\`\`ts
export declare function TableGrid(props: MiniAppTableGridProps): import("react").JSX.Element;
\`\`\`
`

function cli(api: string | null = API) {
  const kitDir = tempDir()
  if (api !== null) writeTree(kitDir, { 'API.md': api })
  const lines: string[] = []
  const context: CliContext = {
    cwd: tempDir(),
    out: (text) => lines.push(text),
    kit: async () => ({ kit: fakeKit({ dir: kitDir }), source: { dir: kitDir, from: 'named' } }),
  }
  return { context, output: () => lines.join('\n'), kitDir }
}

describe('mini-app api', () => {
  test('with no module, lists every module the kit documents', async () => {
    const { context, output } = cli()
    expect(await runCli(['api'], context)).toBe(0)
    const lines = output().split('\n')
    expect(lines).toContain('@localixai/kit/dialog')
    expect(lines).toContain('@localixai/kit/dialog-hero')
    expect(lines).toContain('@localixai/mini-app-sdk/ui/components')
    expect(output()).not.toContain('Served to a mini app UI')
  })

  test('prints one module whole, named in full or by its last part', async () => {
    for (const name of ['@localixai/kit/dialog', 'dialog']) {
      const { context, output } = cli()
      expect(await runCli(['api', name], context)).toBe(0)
      expect(output()).toContain('## module @localixai/kit/dialog\n')
      expect(output()).toContain('export declare const DialogContent')
      // The neighbour whose name only starts the same is not part of it.
      expect(output()).not.toContain('DialogHero')
    }
  })

  test('prints one export of a module, with the types its props name', async () => {
    const { context, output } = cli()
    expect(await runCli(['api', 'ui/components', 'TableGrid'], context)).toBe(0)
    expect(output()).toContain('export declare function TableGrid')
    expect(output()).not.toContain('export interface MiniAppTableGridProps')
    expect(output()).toContain('mini-app api ui/components MiniAppTableGridProps')
  })

  // `mini-app api backend callTool` printed every backend export; callTool lives in its testing module.
  test('an export asked of the wrong module is shown from the module that has it', async () => {
    const { context, output } = cli()
    expect(await runCli(['api', 'kit/dialog-hero', 'DialogContent'], context)).toBe(0)
    expect(output()).toContain('@localixai/kit/dialog-hero exports no DialogContent; it is in')
    expect(output()).toContain('## module @localixai/kit/dialog\n')
    expect(output()).toContain('export declare const DialogContent')
    expect(output()).not.toContain('DialogHero:')
  })

  test('an export named alone is shown from the narrowest module that exports it', async () => {
    const { context, output } = cli()
    expect(await runCli(['api', 'TableGrid'], context)).toBe(0)
    expect(output()).toContain('## module @localixai/mini-app-sdk/ui/components')
    expect(output()).toContain('export declare function TableGrid')
    expect(output()).toContain('Also exported by @localixai/mini-app-sdk/ui')
  })

  test('a word that names nothing lists the modules and exports that contain it', async () => {
    const { context, output } = cli()
    expect(await runCli(['api', 'grid'], context)).toBe(0)
    expect(output()).toContain(
      '@localixai/mini-app-sdk/ui/components: MiniAppTableGridProps, TableGrid',
    )
    expect(output()).not.toContain('@localixai/kit/dialog')
  })

  test('a word nothing contains says so and how to list the modules', async () => {
    const { context, output } = cli()
    expect(await runCli(['api', 'spreadsheet'], context)).toBe(1)
    expect(output()).toContain('Nothing in the kit is named like "spreadsheet"')
    expect(output()).toContain('mini-app api')
  })

  test('a kit without API.md says to update it', async () => {
    const { context, output, kitDir } = cli(null)
    expect(await runCli(['api', 'dialog'], context)).toBe(1)
    expect(output()).toContain(`The kit at ${kitDir} documents no API`)
    expect(output()).toContain('mini-app kit --update')
  })
})
