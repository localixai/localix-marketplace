import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * The Localix mini app kit every app here is checked, tested and built against: the SDK, the UI
 * kit, the host theme and the host's test harness, as one package (`@localixai/mini-app-kit`).
 *
 * Where it comes from, first match wins:
 *   1. `MINI_APP_KIT=<dir>` — an unpacked kit, e.g. one staged from a Localix checkout;
 *   2. `node_modules/@localixai/mini-app-kit` — a kit linked with `bun link` (development);
 *   3. the Localix release `localix.kit` in package.json names (`latest` or a version), downloaded
 *      once into `.kit/<hash>` and checked against the release's SHA256SUMS.txt.
 */

export const ROOT = resolve(import.meta.dir, '..')
const RELEASES = 'https://github.com/rsaryev/localix-studio/releases'
const ARCHIVE = 'mini-app-kit.tar.gz'
const LINKED = join(ROOT, 'node_modules', '@localixai', 'mini-app-kit')

function releaseBase(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const pin = String(pkg.localix?.kit ?? 'latest').trim()
  if (pin === 'latest') return `${RELEASES}/latest/download`
  return `${RELEASES}/download/${pin.startsWith('v') ? pin : `v${pin}`}`
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not download ${url} (HTTP ${response.status}).`)
  return response
}

async function download(): Promise<string> {
  const base = releaseBase()
  const sums = await (await fetchOk(`${base}/SHA256SUMS.txt`)).text()
  const expected = sums
    .split('\n')
    .map((line) => line.trim().split(/\s+/u))
    .find(([, file]) => file === ARCHIVE)?.[0]
  if (!expected) throw new Error(`${base}/SHA256SUMS.txt lists no ${ARCHIVE}.`)
  const dir = join(ROOT, '.kit', expected.slice(0, 16))
  if (existsSync(join(dir, 'kit.json'))) return dir

  const bytes = new Uint8Array(await (await fetchOk(`${base}/${ARCHIVE}`)).arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error(`${ARCHIVE} does not match its checksum.`)
  const next = `${dir}.next-${process.pid}`
  rmSync(next, { recursive: true, force: true })
  mkdirSync(next, { recursive: true })
  await Bun.write(join(next, ARCHIVE), bytes)
  const tar = Bun.spawnSync(['tar', '-xzf', join(next, ARCHIVE), '-C', next], { stderr: 'pipe' })
  if (tar.exitCode !== 0) throw new Error(`Could not unpack the kit: ${tar.stderr.toString()}`)
  rmSync(join(next, ARCHIVE))
  rmSync(dir, { recursive: true, force: true })
  renameSync(next, dir)
  return dir
}

/** The kit folder this checkout uses. */
export async function kitDir(): Promise<string> {
  const override = process.env.MINI_APP_KIT?.trim()
  if (override) return resolve(override)
  if (existsSync(join(LINKED, 'kit.json'))) return LINKED
  return download()
}

if (import.meta.main) {
  const dir = await kitDir()
  const kit = JSON.parse(readFileSync(join(dir, 'kit.json'), 'utf8'))
  console.log(
    `kit: Localix ${kit.localixVersion}, apiVersion ${kit.apiVersion}, ${dir.replace(ROOT, '.')}`,
  )
  // Installed as the package too: a mini app's bunfig preloads `@localixai/mini-app-kit/test-preload`.
  if (dir !== LINKED && !existsSync(LINKED)) {
    mkdirSync(dirname(LINKED), { recursive: true })
    symlinkSync(dir, LINKED, 'dir')
  }
  // Hooks are versioned with the repository; a clone uses them without a setup step.
  if (existsSync(join(ROOT, '.git')))
    Bun.spawnSync(['git', 'config', 'core.hooksPath', '.githooks'], { cwd: ROOT })
}
