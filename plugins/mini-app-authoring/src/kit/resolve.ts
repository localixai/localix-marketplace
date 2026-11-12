import { createHash, randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { UserError } from '../lib/errors'
import { isPathBelow } from '../lib/paths'
import { findLocalix, type LocalixRuntime } from '../localix/runtime'
import { INSTALLED_KIT } from './install-kit'
import { KIT_MANIFEST } from './kit'

/**
 * Which kit to build with. Localix neither carries nor serves one: each release publishes its kit
 * as `mini-app-kit.tar.gz`, and a mini app keeps the one it is built against in its own
 * `node_modules`, like any development dependency (`install-kit.ts`). In order:
 *
 * 1. `MINI_APP_KIT` (or `--kit`): a kit someone named (one staged from a Localix checkout).
 * 2. A kit installed as the package `@localixai/mini-app-kit` in a `node_modules` above the app:
 *    the app's own, or a repository's that pins one.
 * 3. A release's kit, downloaded once, verified against the release's `SHA256SUMS.txt` and kept by
 *    its hash: the running Localix's release, so the app is built for exactly what will run it;
 *    the latest release when Localix runs from source, is not running, or its release has no kit —
 *    so Claude Code without Localix can still create, build and share a mini app.
 */

export const KIT_ARCHIVE = 'mini-app-kit.tar.gz'
/** Localix's repository: its releases carry the kit, its tags the toolchain. */
export const LOCALIX_REPO = 'localixai/localix-studio'
export const RELEASES = `https://github.com/${LOCALIX_REPO}/releases/latest/download`

const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u

export interface LocalixPin {
  /** The Localix release the kit comes from (`v<version>`), or `latest`. */
  ref: string
  /** The release folder the kit is downloaded from (`MINI_APP_KIT_RELEASES`). */
  kitReleases: string
}

/** The Localix release a kit belongs to, or the latest one for a build no release carries. */
export function localixPin(localixVersion: string | undefined): LocalixPin {
  const releases = `https://github.com/${LOCALIX_REPO}/releases`
  return localixVersion && RELEASE_VERSION.test(localixVersion)
    ? { ref: `v${localixVersion}`, kitReleases: `${releases}/download/v${localixVersion}` }
    : { ref: 'latest', kitReleases: RELEASES }
}

export interface KitSource {
  dir: string
  /** Where the kit came from, for the report. */
  from: 'named' | 'installed' | 'release'
  /** Why this kit is not the one asked for (the running release had none), to tell the person. */
  note?: string
}

export interface ResolveKitDeps {
  env?: Record<string, string | undefined>
  home?: string
  fetch?: typeof fetch
  /** The running Localix, when the caller already looked. */
  runtime?: LocalixRuntime | null
  /**
   * A release's kit, passing over an installed one (`mini-app kit --update`): a version, `latest`,
   * or `running` for the running Localix's (the latest without it).
   */
  version?: string
  /** Folders to look above for an installed kit: the app's, then the working directory. */
  near?: readonly string[]
  /** Never download: fall back to the newest kit already downloaded (an edit hook must be quick). */
  offline?: boolean
}

/** Where downloaded kits are kept: the plugin's data folder, else the user's cache. */
export function kitCacheRoot(env: Record<string, string | undefined>, home: string): string {
  const data = env.CLAUDE_PLUGIN_DATA?.trim()
  return data ? join(data, 'kits') : join(home, '.cache', 'localix-mini-app-authoring', 'kits')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The kit's line in a `SHA256SUMS.txt`: `<hex>  <file>`. */
export function checksumOf(sums: string, file: string): string | null {
  for (const line of sums.split('\n')) {
    const [hash, name] = line.trim().split(/\s+\*?/u)
    if (name === file && hash && /^[0-9a-f]{64}$/u.test(hash)) return hash
  }
  return null
}

async function downloadKit(
  base: string,
  cacheRoot: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const sumsResponse = await fetchImpl(`${base}/SHA256SUMS.txt`)
  if (!sumsResponse.ok) {
    throw new UserError(
      `Could not read the Localix release checksums (${base}/SHA256SUMS.txt: HTTP ${sumsResponse.status}).`,
    )
  }
  const expected = checksumOf(await sumsResponse.text(), KIT_ARCHIVE)
  if (!expected) throw new UserError(`The Localix release at ${base} publishes no ${KIT_ARCHIVE}.`)
  const dir = join(cacheRoot, expected.slice(0, 16))
  if (existsSync(join(dir, KIT_MANIFEST))) return dir

  const response = await fetchImpl(`${base}/${KIT_ARCHIVE}`)
  if (!response.ok) {
    throw new UserError(`Could not download ${KIT_ARCHIVE} (HTTP ${response.status}).`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (sha256(bytes) !== expected) {
    throw new UserError(`${KIT_ARCHIVE} does not match its published checksum; nothing was kept.`)
  }
  const staging = join(cacheRoot, `.unpack-${randomUUID()}`)
  await fs.mkdir(staging, { recursive: true })
  try {
    for (const [path, file] of await new Bun.Archive(bytes).files()) {
      const target = join(staging, path)
      if (!isPathBelow(staging, target)) {
        throw new UserError(`${KIT_ARCHIVE} names a path outside itself: ${path}`)
      }
      await Bun.write(target, file)
    }
    if (!existsSync(join(staging, KIT_MANIFEST))) {
      throw new UserError(`${KIT_ARCHIVE} has no ${KIT_MANIFEST} at its root.`)
    }
    await fs.rm(dir, { recursive: true, force: true })
    await fs.rename(staging, dir)
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
  return dir
}

export async function resolveKit(deps: ResolveKitDeps = {}): Promise<KitSource> {
  const env = deps.env ?? process.env
  const home = deps.home ?? homedir()
  const fetchImpl = deps.fetch ?? fetch

  const named = env.MINI_APP_KIT?.trim()
  if (named) return { dir: named, from: 'named' }

  if (deps.version === undefined) {
    const installed = installedKit(deps.near ?? [])
    if (installed) return { dir: installed, from: 'installed' }
  }

  const cacheRoot = kitCacheRoot(env, home)
  if (deps.offline) {
    const cached = await newestCachedKit(cacheRoot)
    if (cached) return { dir: cached, from: 'release' }
    throw new UserError('No mini app kit on this computer yet; any mini-app command downloads one.')
  }
  const override = env.MINI_APP_KIT_RELEASES?.trim()
  if (override) return { dir: await downloadKit(override, cacheRoot, fetchImpl), from: 'release' }
  if (deps.version !== undefined && deps.version !== 'running') {
    // A release asked for by name is that release or an error, never another one.
    const { kitReleases } = localixPin(deps.version === 'latest' ? undefined : deps.version)
    return { dir: await downloadKit(kitReleases, cacheRoot, fetchImpl), from: 'release' }
  }
  const runtime =
    deps.runtime === undefined ? await findLocalix({ env, home, fetch: fetchImpl }) : deps.runtime
  return runningReleaseKit(runtime?.version, cacheRoot, fetchImpl)
}

/** The running release's kit; the latest release's, said, when it has none or cannot be read. */
async function runningReleaseKit(
  version: string | undefined,
  cacheRoot: string,
  fetchImpl: typeof fetch,
): Promise<KitSource> {
  const pin = localixPin(version)
  if (pin.ref === 'latest') {
    return { dir: await downloadKit(RELEASES, cacheRoot, fetchImpl), from: 'release' }
  }
  try {
    return { dir: await downloadKit(pin.kitReleases, cacheRoot, fetchImpl), from: 'release' }
  } catch (error) {
    if (!(error instanceof UserError)) throw error
    return {
      dir: await downloadKit(RELEASES, cacheRoot, fetchImpl),
      from: 'release',
      note: `the kit of Localix ${version} could not be read (${error.message}); building against the latest release's kit, so the app may need a newer Localix than the one running.`,
    }
  }
}

/** The nearest `node_modules/@localixai/mini-app-kit` above any of `folders`, when there is one. */
function installedKit(folders: readonly string[]): string | null {
  for (const folder of folders) {
    let dir = resolve(folder)
    for (;;) {
      const kit = join(dir, INSTALLED_KIT)
      if (existsSync(join(kit, KIT_MANIFEST))) return kit
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

async function newestCachedKit(cacheRoot: string): Promise<string | null> {
  const entries = await fs.readdir(cacheRoot, { withFileTypes: true }).catch(() => [])
  let newest: { dir: string; at: number } | null = null
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const dir = join(cacheRoot, entry.name)
    const stat = await fs.stat(join(dir, KIT_MANIFEST)).catch(() => null)
    if (stat && (!newest || stat.mtimeMs > newest.at)) newest = { dir, at: stat.mtimeMs }
  }
  return newest?.dir ?? null
}
