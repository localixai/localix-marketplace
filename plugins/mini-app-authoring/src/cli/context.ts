import { existsSync, promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'

import { MANIFEST_FILE, type TestRunner } from '../check/check'
import type { Kit } from '../kit/kit'
import type { KitSource } from '../kit/resolve'
import { UserError } from '../lib/errors'
import type { GetLocalixDeps } from '../localix/get-localix'
import type { InstallDeps } from '../localix/install'
import type { LocalixRuntime } from '../localix/runtime'
import type { ParsedArgs } from './args'

/** What a command reaches outside itself; tests replace each part. */
export interface CliContext {
  cwd: string
  out: (text: string) => void
  /**
   * The kit to build with, resolved on first use: by default the one of the mini app the command
   * names; with `appDir`, the one of that app (a release's is installed into it first).
   */
  kit: (appDir?: string) => Promise<{ kit: Kit; source: KitSource }>
  /** Install a release's kit into `appDir`: `version`'s, else the running Localix's, else the latest. */
  updateKit?: (appDir: string, version?: string) => Promise<{ kit: Kit; source: KitSource }>
  /** The running Localix: its release and the mini app contract it implements; null when none runs. */
  runningLocalix?: () => Promise<LocalixRuntime | null>
  runTests?: TestRunner
  /** The build skill `mini-app doc` prints from; the plugin's own by default. */
  skillDir?: string
  localix?: InstallDeps
  installer?: GetLocalixDeps
  /** The environment and home folder the signing key is found by; the process's by default. */
  env?: Record<string, string | undefined>
  home?: string
}

export type Command = (args: ParsedArgs, context: CliContext) => Promise<number>

export const folder = (args: ParsedArgs, context: CliContext) =>
  resolve(context.cwd, args.positional[0] ?? '.')

export async function readManifest(dir: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(join(dir, MANIFEST_FILE), 'utf8')) as Record<
      string,
      unknown
    >
  } catch {
    // The layout before `.localix-mini-app/`: name the move rather than call it no app at all.
    if (existsSync(join(dir, 'mini-app.json')))
      throw new UserError(
        `${dir} keeps its manifest at mini-app.json; move it to ${MANIFEST_FILE} (paths in it stay as they are).`,
      )
    throw new UserError(`${dir} is not a mini app: it has no readable ${MANIFEST_FILE}.`)
  }
}
