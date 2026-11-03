import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The kit's `API.md`: every module a mini app may import, a `## module <specifier>` section each,
 * with a `### <export>` heading and the declaration per export. `mini-app api` prints it; the
 * creation instruction reads the few values it names from it, so they never drift from the kit.
 */
export const API_FILE = 'API.md'

/** A declared tuple of strings in the kit's API (`MINI_APP_CATEGORIES`), or null without one. */
export function apiStringTuple(kitDir: string, name: string): string[] | null {
  let text: string
  try {
    text = readFileSync(join(kitDir, API_FILE), 'utf8')
  } catch {
    return null
  }
  const start = text.indexOf(`### ${name}\n`)
  if (start < 0) return null
  const end = text.indexOf(`\n### `, start + 1)
  const block = text.slice(start, end < 0 ? undefined : end)
  // The declarations are printed by TypeScript, which quotes with ' or " by its settings.
  const values = [...block.matchAll(/(['"])([^'"]+)\1/gu)].map((match) => match[2]!)
  return values.length ? values : null
}
