import type { AgentToolResult, MiniAppContext } from '@localixai/mini-app-sdk/backend'
import { isImportError, RecallError } from '../errors'
import type { JudgeDeps } from '../judge'
import type { Service } from '../service'

/**
 * What every tool shares: the read and write presets, the error mapping (a domain error is a call
 * that did nothing: `isError`), and the judge's deps for the calling chat.
 */

export interface ToolDeps {
  ctx: MiniAppContext
  service: Service
}

export const write = {
  executionMode: 'sequential',
  mutates: true,
  classify: () => ({ effect: 'host' as const }),
  permissionPaths: () => [],
} as const

export const remove = {
  ...write,
  classify: () => ({ effect: 'host' as const, irreversible: true }),
} as const

export const read = { executionMode: 'parallel', mutates: false, permissionPaths: () => [] } as const

/** Run a tool body; a domain or import error answers `isError` with its sentence. */
export async function run(body: () => Promise<string> | string): Promise<AgentToolResult> {
  try {
    return { content: await body() }
  } catch (error) {
    if (error instanceof RecallError || isImportError(error)) return { content: error.message, isError: true }
    throw error
  }
}

export function judgeFor(deps: ToolDeps, sessionId: string | undefined): JudgeDeps {
  return { core: deps.service.core, ctx: deps.ctx, sessionId }
}

/** A deck given by id or by name: an existing id, else a name (made when new). */
export function deckRef(service: Service, value: string | undefined): { deckId?: string | null; deckName?: string } {
  if (value === undefined) return {}
  const text = value.trim()
  if (!text || text.toLowerCase() === 'inbox') return { deckId: null }
  const decks = service.decks().decks
  const byId = decks.find((deck) => deck.id === text)
  if (byId) return { deckId: byId.id }
  return { deckName: text }
}

/** An existing deck by id or name (case-insensitive), or null. */
export function findDeck(service: Service, value: string) {
  const text = value.trim().toLowerCase()
  return service.decks().decks.find((deck) => deck.id === value.trim() || deck.name.toLowerCase() === text) ?? null
}

/** Note ids for ids the agent gives: note ids as they are, card ids mapped to their note. */
export function noteIdsFor(service: Service, ids: readonly string[]): { found: string[]; unknown: string[] } {
  return service.core.read((db) => {
    const found = new Set<string>()
    const unknown: string[] = []
    const noteQuery = db.query('SELECT id FROM notes WHERE id = $id')
    const cardQuery = db.query('SELECT note_id AS id FROM cards WHERE id = $id')
    for (const id of new Set(ids)) {
      const row = (noteQuery.get({ id }) ?? cardQuery.get({ id })) as { id: string } | null
      if (row) found.add(row.id)
      else unknown.push(id)
    }
    return { found: [...found], unknown }
  })
}

export const idsHint = 'Read recall_find_cards for the ids.'
