import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { MANIFEST_FILE, runMiniAppTests } from '../check/check'
import { writeMiniAppTsconfig } from '../check/typecheck'
import { type Command, readManifest } from './context'

/**
 * `mini-app test [folder] [files…]`: the app's tests alone, as `mini-app check` runs them — the
 * generated `tsconfig.json` resolving the SDK and the kit, and the kit's preload serving the
 * modules the host lends. A plain `bun test` in a mini app cannot resolve either, so an agent
 * fixing one failing test re-ran every gate to see it.
 */
export const testCommand: Command = async (args, context) => {
  const [first, ...rest] = args.positional
  // The first name is the app's folder when it is one; inside the app, every name is a file.
  const named = first ? resolve(context.cwd, first) : null
  const isApp = named !== null && existsSync(join(named, MANIFEST_FILE))
  const dir = isApp ? named : context.cwd
  const filters = isApp ? rest : args.positional
  await readManifest(dir)
  const { kit } = await context.kit()
  await writeMiniAppTsconfig(kit, dir)
  const run = context.runTests ?? runMiniAppTests
  const result = await run({
    miniAppDir: dir,
    preload: join(kit.dir, kit.manifest.authoring.testPreload),
    filters,
  })
  context.out(result.output.trimEnd())
  return result.ok ? 0 : 1
}
