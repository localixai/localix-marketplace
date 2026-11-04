import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LIBRARY_SORTS, LIBRARY_STATES } from '../../shared/model'
import { openDb } from '../db'
import { notBuried, studiable } from './filters'
import { countSql, libraryWhere, pageSql } from './library'

/**
 * A library with thousands of notes must answer a filter or a sort at once. Every per-note question
 * about its cards has to seek that note's cards; one that scans cards by state or pause instead
 * walks all of them for each note, and the page takes seconds.
 */

const dir = mkdtempSync(join(tmpdir(), 'recall-plan-'))
const db = openDb(dir)
afterAll(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

/** The lines of the plan that read the `cards` table (aliased `c` in every per-note subquery). */
function cardReads(sql: string): string[] {
  const plan = db.query(`EXPLAIN QUERY PLAN ${sql}`).all({ limit: 50, offset: 0 }) as { detail: string }[]
  return plan.map((row) => row.detail).filter((detail) => /^(SEARCH|SCAN) c\b/.test(detail))
}

describe('the library query seeks the cards of each note', () => {
  for (const state of LIBRARY_STATES) {
    test(`filter by ${state}`, () => {
      const where = libraryWhere({ sort: 'newest', states: [state] })
      for (const sql of [countSql(where), pageSql(where, 'newest')]) {
        for (const read of cardReads(sql)) expect(read).toContain('note_id=?')
      }
    })
  }
  for (const sort of LIBRARY_SORTS) {
    test(`sort by ${sort}`, () => {
      for (const read of cardReads(pageSql(libraryWhere({ sort }), sort))) expect(read).toContain('note_id=?')
    })
  }
  test('the plans read cards at all (the check is not looking at nothing)', () => {
    expect(cardReads(pageSql(libraryWhere({ sort: 'due', states: ['paused'] }), 'due')).length).toBeGreaterThan(0)
  })
})

describe('the queue and the counts do not scan reviews or cards once per row', () => {
  const plan = (sql: string) =>
    (db.query(`EXPLAIN QUERY PLAN ${sql}`).all({ start: '', now: '', end: '' }) as { detail: string }[]).map((r) => r.detail)

  test('the reviews of a card\'s note are looked up by note, not scanned', () => {
    const lines = plan(
      `SELECT COUNT(*) FROM cards c CROSS JOIN notes n ON n.id = c.note_id WHERE c.paused = 0 AND c.state = 2 AND c.due < $end AND ${notBuried} AND ${studiable}`,
    )
    // r is the per-card check; r0 is read once. Neither may be a full scan of reviews.
    for (const line of lines.filter((l) => /^(SEARCH|SCAN) r0?\b/.test(l))) expect(line).not.toMatch(/^SCAN/)
  })

  test('the counts per deck read each table once', () => {
    const lines = plan(
      "SELECT n.deck_id AS deckId, COUNT(*) AS n FROM cards c CROSS JOIN notes n ON n.id = c.note_id WHERE c.paused = 1 AND n.status = 'active' GROUP BY n.deck_id",
    )
    expect(lines.filter((l) => /^SCAN/.test(l)).length).toBeLessThanOrEqual(1)
  })
})
