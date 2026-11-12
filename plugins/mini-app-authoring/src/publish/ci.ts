import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { type LocalixPin, localixPin } from '../kit/resolve'
import { UserError } from '../lib/errors'
import { MANIFEST_FILE } from '../lib/manifest-file'

/**
 * Publishing through GitHub: the mini app's repository carries its source, and a workflow builds and
 * releases it, so a release is made from the committed source by the same checks Localix applies —
 * never a package someone built on their own computer and uploaded by hand.
 *
 * The workflow builds against the kit of ONE Localix release, the one the app was made with,
 * downloaded from that release's assets and verified against its checksums; an app made with a
 * development build follows the latest release instead, since no release carries that build. The
 * toolchain is this plugin, checked out alone from the marketplace it is published in.
 */

/** Where the workflow is written inside the mini app. */
export const WORKFLOW_FILE = '.github/workflows/mini-app.yml'

/**
 * What git never carries from a mini app: what the checks write (`tsconfig.json` names this
 * computer's kit by absolute path, `KIT.md` is regenerated), builds, dependencies and local data.
 */
export const GENERATED_IGNORES = [
  'node_modules/',
  'dist/',
  '.turbo/',
  '.preview-data/',
  '*.tsbuildinfo',
  'tsconfig.json',
  'KIT.md',
]

/** The marketplace this plugin is published in: the workflow checks the toolchain out of it. */
export const MARKETPLACE_REPO = 'localixai/localix-marketplace'

/** Add what `GENERATED_IGNORES` lacks to the mini app's `.gitignore`; the lines it added. */
export async function ensureGitignore(dir: string): Promise<string[]> {
  const path = join(dir, '.gitignore')
  const text = await fs.readFile(path, 'utf8').catch(() => '')
  const present = new Set(text.split('\n').map((line) => line.trim()))
  const added = GENERATED_IGNORES.filter((line) => !present.has(line))
  if (added.length) {
    const head = text && !text.endsWith('\n') ? `${text}\n` : text
    await fs.writeFile(path, `${head}${added.join('\n')}\n`)
  }
  return added
}

/** The workflow: check every push and pull request; on a tag `v<version>`, release the marketplace. */
export function releaseWorkflow(input: { displayName: string; pin: LocalixPin }): string {
  const { displayName, pin } = input
  const tool = 'localix/plugins/mini-app-authoring/bin/mini-app'
  const onTag = "startsWith(github.ref, 'refs/tags/v')"
  return `# ${displayName}: checked on every push and pull request; a tag v<version> (the version in
# .localix-mini-app/mini-app.json) releases it as a mini app marketplace. People add <owner>/<repo>
# in Localix: Store → Sources → Add source. Written by \`mini-app ci\`; run it again after
# updating Localix.
name: Mini app

on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:

permissions:
  contents: write

env:
  # The Localix this app is built against: the kit of its release ${pin.ref}.
  MINI_APP_KIT_RELEASES: ${pin.kitReleases}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          path: app
      - name: The mini app toolchain
        uses: actions/checkout@v5
        with:
          repository: ${MARKETPLACE_REPO}
          path: localix
          sparse-checkout: plugins/mini-app-authoring
          filter: blob:none
      - uses: oven-sh/setup-bun@v2
      - name: Check
        if: \${{ !${onTag} }}
        run: ${tool} check app
      - name: The tag is the version in its manifest
        if: \${{ ${onTag} }}
        run: |
          version=$(bun -e "process.stdout.write((await Bun.file('app/${MANIFEST_FILE}').json()).version)")
          if [ "v$version" != "$GITHUB_REF_NAME" ]; then
            echo "::error::The tag $GITHUB_REF_NAME is not v$version, the version in ${MANIFEST_FILE}: tag v$version, or raise the version first."
            exit 1
          fi
      - name: Check and pack
        if: \${{ ${onTag} }}
        run: ${tool} pack app --out marketplace
      # Localix updates the app on its own only from a signed marketplace: \`mini-app keygen\`, then
      # \`gh secret set MINI_APP_SIGNING_KEY\` with the key it made. Without it the release is unsigned.
      - name: Sign the marketplace
        if: \${{ ${onTag} }}
        env:
          MINI_APP_SIGNING_KEY: \${{ secrets.MINI_APP_SIGNING_KEY }}
        run: |
          if [ -z "$MINI_APP_SIGNING_KEY" ]; then
            echo "::notice::The marketplace is not signed: Localix updates this app only when people choose Update. Run mini-app keygen and set the MINI_APP_SIGNING_KEY secret to sign it."
          else
            ${tool} sign marketplace
          fi
      - name: Release
        if: \${{ ${onTag} }}
        env:
          GH_TOKEN: \${{ github.token }}
        run: gh release create "$GITHUB_REF_NAME" marketplace/* --repo "$GITHUB_REPOSITORY" --title "${displayName.replaceAll('"', '')} $GITHUB_REF_NAME" --generate-notes
`
}

/**
 * Set a mini app up to be released from GitHub: the workflow, the ignore file, and the publisher
 * kept as `author` in the manifest (the workflow packs with it). A named publisher replaces the
 * author kept; without one, the kept author stays. A named repository (`<owner>/<repo>` or its
 * address) is kept as `repository`: the Store's page of the app links there.
 */
export async function writeReleaseSetup(input: {
  dir: string
  manifest: Record<string, unknown>
  manifestFile: string
  localixVersion: string | undefined
  publisher: string | undefined
  repository?: string
}): Promise<LocalixPin> {
  const { dir, manifest, publisher } = input
  const repository = input.repository && repositoryAddress(input.repository)
  const kept = {
    ...manifest,
    ...(publisher ? { author: publisher } : {}),
    ...(repository ? { repository } : {}),
  }
  if (kept.author !== manifest.author || kept.repository !== manifest.repository) {
    await fs.writeFile(join(dir, input.manifestFile), `${JSON.stringify(kept, null, 2)}\n`)
  }
  const pin = localixPin(input.localixVersion)
  const displayName = String(manifest.displayName ?? manifest.name ?? 'Mini app')
  await fs.mkdir(join(dir, '.github', 'workflows'), { recursive: true })
  await fs.writeFile(join(dir, WORKFLOW_FILE), releaseWorkflow({ displayName, pin }))
  await ensureGitignore(dir)
  return pin
}

/** A repository's address: `<owner>/<repo>` on GitHub, or an `https://` address as given. */
function repositoryAddress(repository: string): string {
  const value = repository.trim()
  if (value.startsWith('https://')) return value
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) return `https://github.com/${value}`
  throw new UserError(
    `Name the repository as <owner>/<repo> or its https:// address, not ${value}.`,
  )
}
