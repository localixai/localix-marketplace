import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { tempDirPerTest, writeTree } from '../testing/temp'
import { checksumOf, KIT_ARCHIVE, kitCacheRoot, resolveKit } from './resolve'

const tempDir = tempDirPerTest('mini-app-kit-resolve-')
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** Releases serving one kit; a URL containing any of `without` answers 404. */
async function release(
  files: Record<string, string>,
  sumsFor?: Uint8Array,
  without: readonly string[] = [],
) {
  const archive = await new Bun.Archive(files, { compress: 'gzip' }).bytes()
  const sums = `${sha(sumsFor ?? archive)}  ${KIT_ARCHIVE}\n${'0'.repeat(64)}  Localix-macos-arm64.dmg\n`
  const asked: string[] = []
  const fetchImpl = (async (url: string | URL) => {
    asked.push(String(url))
    if (without.some((part) => String(url).includes(part)))
      return new Response('missing', { status: 404 })
    if (String(url).endsWith('/SHA256SUMS.txt')) return new Response(sums)
    if (String(url).endsWith(`/${KIT_ARCHIVE}`)) return new Response(archive)
    return new Response('missing', { status: 404 })
  }) as unknown as typeof fetch
  return { fetchImpl, asked }
}

const offlineDeps = (home: string, fetchImpl: typeof fetch) => ({
  env: { MINI_APP_KIT_RELEASES: 'https://releases.test' },
  home,
  fetch: fetchImpl,
  runtime: null,
})

describe('resolveKit', () => {
  test('a kit someone named wins over everything else', async () => {
    const source = await resolveKit({ env: { MINI_APP_KIT: '/somewhere/kit' } })
    expect(source).toEqual({ dir: '/somewhere/kit', from: 'named' })
  })

  // A mini app that has its kit installed (or a repository that pins one, or `bun link`s one)
  // builds against that one, not against whatever Localix happens to be running.
  test('a kit installed beside the app wins over the running Localix’s release', async () => {
    const repo = tempDir()
    writeTree(join(repo, 'node_modules/@localixai/mini-app-kit'), { 'kit.json': '{}' })
    const app = join(repo, 'mini-apps', 'chess')
    writeTree(app, { '.localix-mini-app/mini-app.json': '{}' })
    const fetchImpl = (() => {
      throw new Error('fetched')
    }) as unknown as typeof fetch
    const source = await resolveKit({
      env: {},
      fetch: fetchImpl,
      runtime: { baseUrl: 'http://127.0.0.1:5051', version: '0.4.0' },
      near: [app],
    })
    expect(source).toEqual({
      dir: join(repo, 'node_modules/@localixai/mini-app-kit'),
      from: 'installed',
    })
  })

  test('the running Localix’s release kit is the one downloaded', async () => {
    const { fetchImpl, asked } = await release({ 'kit.json': '{"kitModules":[]}' })
    const source = await resolveKit({
      env: {},
      home: tempDir(),
      fetch: fetchImpl,
      runtime: { baseUrl: 'http://127.0.0.1:5051', version: '0.4.0' },
    })
    expect(source.from).toBe('release')
    expect(asked).toContain(
      `https://github.com/localixai/localix-studio/releases/download/v0.4.0/${KIT_ARCHIVE}`,
    )
  })

  // A release from before the kit was published, or one that cannot be read, still leaves a kit.
  test('a release without the kit gives way to the latest one', async () => {
    const { fetchImpl, asked } = await release({ 'kit.json': '{"kitModules":[]}' }, undefined, [
      '/download/v0.0.9/',
    ])
    const source = await resolveKit({
      env: {},
      home: tempDir(),
      fetch: fetchImpl,
      runtime: { baseUrl: 'http://127.0.0.1:5051', version: '0.0.9' },
    })
    expect(source.from).toBe('release')
    expect(asked.at(-1)).toBe(
      `https://github.com/localixai/localix-studio/releases/latest/download/${KIT_ARCHIVE}`,
    )
    // The app is then built for another Localix than the one running it: that is said.
    expect(source.note).toContain('Localix 0.0.9')
    expect(source.note).toContain('latest release')
  })

  test('a release asked for by name that has no kit is said, not swapped for the latest', async () => {
    const { fetchImpl } = await release({ 'kit.json': '{}' }, undefined, ['/download/v0.0.9/'])
    await expect(
      resolveKit({ env: {}, home: tempDir(), fetch: fetchImpl, runtime: null, version: '0.0.9' }),
    ).rejects.toThrow('v0.0.9')
  })

  // `mini-app kit --update`: the app's installed kit is what is being replaced.
  test('asked for the running release, the installed kit is passed over', async () => {
    const app = tempDir()
    writeTree(join(app, 'node_modules/@localixai/mini-app-kit'), { 'kit.json': '{}' })
    const { fetchImpl, asked } = await release({ 'kit.json': '{"kitModules":[]}' })
    const source = await resolveKit({
      env: {},
      home: tempDir(),
      fetch: fetchImpl,
      runtime: { baseUrl: 'http://127.0.0.1:5051', version: '0.4.0' },
      near: [app],
      version: 'running',
    })
    expect(source.from).toBe('release')
    expect(asked[0]).toBe(
      'https://github.com/localixai/localix-studio/releases/download/v0.4.0/SHA256SUMS.txt',
    )
  })

  test('a Localix run from source, or none running, builds against the latest release', async () => {
    for (const runtime of [{ baseUrl: 'http://127.0.0.1:5051' }, null]) {
      const { fetchImpl, asked } = await release({ 'kit.json': '{"kitModules":[]}' })
      await resolveKit({ env: {}, home: tempDir(), fetch: fetchImpl, runtime })
      expect(asked[0]).toBe(
        'https://github.com/localixai/localix-studio/releases/latest/download/SHA256SUMS.txt',
      )
    }
  })

  test('without Localix, the release kit is downloaded once, verified and kept', async () => {
    const home = tempDir()
    const { fetchImpl, asked } = await release({ 'kit.json': '{"kitModules":[]}' })
    const first = await resolveKit(offlineDeps(home, fetchImpl))
    expect(first.from).toBe('release')
    expect(readFileSync(join(first.dir, 'kit.json'), 'utf8')).toContain('kitModules')
    const second = await resolveKit(offlineDeps(home, fetchImpl))
    expect(second.dir).toBe(first.dir)
    expect(asked.filter((url) => url.endsWith(KIT_ARCHIVE))).toHaveLength(1)
  })

  test('an archive that does not match its checksum is refused and nothing is kept', async () => {
    const home = tempDir()
    const { fetchImpl } = await release({ 'kit.json': '{}' }, new Uint8Array([1, 2, 3]))
    await expect(resolveKit(offlineDeps(home, fetchImpl))).rejects.toThrow('checksum')
    expect(existsSync(kitCacheRoot({}, home))).toBe(false)
  })

  test('offline, the newest downloaded kit is used and nothing is fetched', async () => {
    const home = tempDir()
    writeTree(kitCacheRoot({}, home), { 'aaaa/kit.json': '{}' })
    const fetchImpl = (() => {
      throw new Error('fetched')
    }) as unknown as typeof fetch
    const source = await resolveKit({ ...offlineDeps(home, fetchImpl), offline: true })
    expect(source.dir).toBe(join(kitCacheRoot({}, home), 'aaaa'))
  })

  test('offline with nothing downloaded says so', async () => {
    const home = tempDir()
    await expect(resolveKit({ ...offlineDeps(home, fetch), offline: true })).rejects.toThrow(
      'No mini app kit',
    )
  })
})

test('checksumOf reads the line of one file', () => {
  const sums = `${'a'.repeat(64)}  one.tar.gz\n${'b'.repeat(64)} *two.tar.gz\n`
  expect(checksumOf(sums, 'two.tar.gz')).toBe('b'.repeat(64))
  expect(checksumOf(sums, 'three.tar.gz')).toBeNull()
})

test('downloaded kits live in the plugin data folder when Claude Code gives one', () => {
  expect(kitCacheRoot({ CLAUDE_PLUGIN_DATA: '/data/plugin' }, '/home/me')).toBe('/data/plugin/kits')
})
