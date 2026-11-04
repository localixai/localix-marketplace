import type { LibraryQuery, LibrarySort, LibraryState, Note } from '../../shared/model'
import type { Db } from '../db'
import { escapeLike, filterClause, inList, type Clause } from './filters'
import { toNote } from './notes'

/**
 * The library's page query: one WHERE built from the filters, a COUNT for the total and a page
 * with LIMIT/OFFSET. Never loads more than a page of notes. A meaning search passes the ranked ids
 * (`rankedIds`); the page keeps their order.
 */

const STATE_SQL: Record<LibraryState, string> = {
  new: 'EXISTS (SELECT 1 FROM cards c WHERE c.note_id = n.id AND c.state = 0 AND c.paused = 0)',
  learning: 'EXISTS (SELECT 1 FROM cards c WHERE c.note_id = n.id AND c.state IN (1, 3) AND c.paused = 0)',
  review: 'EXISTS (SELECT 1 FROM cards c WHERE c.note_id = n.id AND c.state = 2 AND c.paused = 0)',
  paused: 'EXISTS (SELECT 1 FROM cards c WHERE c.note_id = n.id AND c.paused = 1)',
  hard: 'EXISTS (SELECT 1 FROM cards c WHERE c.note_id = n.id AND c.leech = 1)',
  draft: "n.status = 'draft'",
}

const SORT_SQL: Record<LibrarySort, string> = {
  newest: 'n.created_at DESC, n.id',
  oldest: 'n.created_at, n.id',
  updated: 'n.updated_at DESC, n.id',
  due: "(SELECT MIN(c.due) FROM cards c WHERE c.note_id = n.id AND c.paused = 0) IS NULL, (SELECT MIN(c.due) FROM cards c WHERE c.note_id = n.id AND c.paused = 0), n.id",
  hardest: '(SELECT MAX(c.lapses) FROM cards c WHERE c.note_id = n.id) DESC, n.created_at DESC',
  alpha: 'n.front COLLATE NOCASE, n.id',
}

/** The WHERE of a library query, without its text part when `rankedIds` replaces it. */
export function libraryWhere(query: LibraryQuery, rankedIds?: readonly string[]): Clause {
  const parts: string[] = []
  const scope = filterClause(query, 'l')
  const params: Clause['params'] = { ...scope.params }
  parts.push(scope.sql)
  if (rankedIds) {
    const list = inList(rankedIds, 'r')
    Object.assign(params, list.params)
    parts.push(`n.id IN (${list.sql})`)
  } else if (query.q) {
    params.q = `%${escapeLike(query.q)}%`
    parts.push(
      `(n.front LIKE $q ESCAPE '\\' OR n.back LIKE $q ESCAPE '\\' OR n.extra LIKE $q ESCAPE '\\' OR n.tags LIKE $q ESCAPE '\\')`,
    )
  }
  if (query.states?.length) parts.push(`(${query.states.map((state) => STATE_SQL[state]).join(' OR ')})`)
  if (query.kinds?.length) {
    const list = inList(query.kinds, 'k')
    Object.assign(params, list.params)
    parts.push(`n.kind IN (${list.sql})`)
  }
  if (query.status) {
    params.status = query.status
    parts.push('n.status = $status')
  }
  return { sql: parts.join(' AND '), params }
}

export function countWhere(db: Db, where: Clause): number {
  return (db.query(`SELECT COUNT(*) AS n FROM notes n WHERE ${where.sql}`).get(where.params) as { n: number }).n
}

/** One page of notes. With `rankedIds`, in that order. */
export function pageWhere(
  db: Db,
  where: Clause,
  sort: LibrarySort,
  offset: number,
  limit: number,
  rankedIds?: readonly string[],
): Note[] {
  if (rankedIds) {
    const rows = db.query(`SELECT n.* FROM notes n WHERE ${where.sql}`).all(where.params) as Parameters<
      typeof toNote
    >[0][]
    const order = new Map(rankedIds.map((id, index) => [id, index]))
    return rows
      .map(toNote)
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .slice(offset, offset + limit)
  }
  return (
    db
      .query(`SELECT n.* FROM notes n WHERE ${where.sql} ORDER BY ${SORT_SQL[sort]} LIMIT $limit OFFSET $offset`)
      .all({ ...where.params, limit, offset }) as Parameters<typeof toNote>[0][]
  ).map(toNote)
}

/** Ids of every note a WHERE matches, up to `cap` (`-1`: all of them): for bulk actions over a filter. */
export function idsWhere(db: Db, where: Clause, cap: number): string[] {
  return (
    db.query(`SELECT n.id FROM notes n WHERE ${where.sql} LIMIT $cap`).all({ ...where.params, cap }) as {
      id: string
    }[]
  ).map((row) => row.id)
}
