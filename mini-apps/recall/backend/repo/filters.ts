import { INBOX, type CardFilter } from '../../shared/model'

/**
 * SQL pieces shared by the queue, the counts and the library. Every value is bound as a
 * parameter; the clause text only ever holds placeholders.
 */

/** A card that can be studied now: active note, not paused, not skipped. Needs `c`, `n`, `$now`. */
export const studiable = `(n.status = 'active' AND c.paused = 0 AND (c.skip_until IS NULL OR c.skip_until <= $now))`

/**
 * No sibling of the card was answered today (bury siblings). Needs `c` and `$start`. The notes
 * answered today are found once (a small set); only cards of those notes run the per-card check.
 */
export const notBuried = `NOT (c.note_id IN (SELECT r0.note_id FROM reviews r0 WHERE r0.reviewed_at >= $start) AND EXISTS (SELECT 1 FROM reviews r WHERE r.note_id = c.note_id AND r.card_id <> c.id AND r.reviewed_at >= $start))`

export type Params = Record<string, string | number | null>

export interface Clause {
  sql: string
  params: Params
}

/** `' a b '` contains `' a '`: a tag match on the space-separated column. */
function tagMatch(alias: string, key: string): string {
  return `(' ' || ${alias}.tags || ' ') LIKE $${key}`
}

/** Decks (any of; `'inbox'` = no deck) and tags (any of), on the notes alias `n`. */
export function filterClause(filter: CardFilter = {}, prefix = 'f'): Clause {
  const parts: string[] = []
  const params: Params = {}
  const decks = filter.deckIds ?? []
  if (decks.length) {
    const named = decks.filter((id) => id !== INBOX)
    const ors = named.map((id, index) => {
      params[`${prefix}d${index}`] = id
      return `n.deck_id = $${prefix}d${index}`
    })
    if (decks.includes(INBOX)) ors.push('n.deck_id IS NULL')
    parts.push(`(${ors.join(' OR ')})`)
  }
  const tags = filter.tags ?? []
  if (tags.length) {
    const ors = tags.map((tag, index) => {
      params[`${prefix}t${index}`] = `% ${escapeLike(tag.toLowerCase())} %`
      return `${tagMatch('n', `${prefix}t${index}`)} ESCAPE '\\'`
    })
    parts.push(`(${ors.join(' OR ')})`)
  }
  return { sql: parts.length ? parts.join(' AND ') : '1', params }
}

/** A value made literal inside a LIKE pattern (with `ESCAPE '\'`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** `$p0, $p1, …` placeholders for a list, with their params. */
export function inList(values: readonly string[], prefix: string): Clause {
  const params: Params = {}
  const names = values.map((value, index) => {
    params[`${prefix}${index}`] = value
    return `$${prefix}${index}`
  })
  return { sql: names.length ? names.join(', ') : 'NULL', params }
}

/** Split long id lists so no statement exceeds SQLite's parameter limit. */
export function chunks<T>(values: readonly T[], size = 500): T[][] {
  const out: T[][] = []
  for (let at = 0; at < values.length; at += size) out.push(values.slice(at, at + size))
  return out
}
