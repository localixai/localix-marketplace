import { useCallback, useEffect, useState } from 'react'
import type { LibraryQuery } from '../../shared/model'
import type { LibraryPage, LibraryRow } from '../../shared/payloads'
import { messageOf, useCall, useDebounced, useShared } from '../data'
import type { CardsFilters } from '../nav'

export const PAGE = 50

/** The filters as the library route's query (the tag box is a plain word, the deck a select). */
export function queryOf(filters: CardsFilters, q: string): LibraryQuery {
  const query: LibraryQuery = { sort: filters.sort }
  if (q.trim()) {
    query.q = q.trim()
    query.mode = filters.mode
  }
  if (filters.deck !== 'all') query.deckIds = [filters.deck]
  if (filters.tag.trim()) query.tags = [filters.tag.trim().replace(/^#/, '').toLowerCase()]
  if (filters.state !== 'all') query.states = [filters.state as NonNullable<LibraryQuery['states']>[number]]
  if (filters.kind !== 'all') query.kinds = [filters.kind as NonNullable<LibraryQuery['kinds']>[number]]
  return query
}

export interface Library {
  rows: LibraryRow[]
  total: number
  /** How the last search was matched, when there was one. */
  by: LibraryPage['by'] | null
  loading: boolean
  error: string | null
  hasMore: boolean
  showMore: () => void
  refresh: () => void
}

/**
 * The library, page by page: "Show more" asks for the next page and keeps the ones read. When
 * the filters change the list starts again; when a write moves the revision every shown page is
 * read again, so the list stays where the person scrolled to. Typing waits for a pause first.
 */
export function useLibrary(filters: CardsFilters, active: boolean): Library {
  const ask = useCall()
  const { revision } = useShared()
  const q = useDebounced(filters.q)
  const query = queryOf(filters, q)
  const key = JSON.stringify(query)
  const [paging, setPaging] = useState({ key, pages: 1 })
  const pages = paging.key === key ? paging.pages : 1
  const [state, setState] = useState<{ key: string; rows: LibraryRow[]; total: number; by: LibraryPage['by'] | null; next: number | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [again, setAgain] = useState(0)

  useEffect(() => {
    if (!active) return
    let live = true
    ;(async () => {
      const rows: LibraryRow[] = []
      let last: LibraryPage | null = null
      for (let index = 0; index < pages; index += 1) {
        last = await ask('library', { query: { ...query, offset: index * PAGE, limit: PAGE } })
        rows.push(...last.rows)
        if (last.nextOffset === null) break
      }
      if (live && last) {
        setState({ key, rows, total: last.total, by: query.q ? last.by : null, next: last.nextOffset })
        setError(null)
      }
    })().catch((failure: unknown) => live && setError(messageOf(failure, 'Could not read the cards.')))
    return () => {
      live = false
    }
  }, [key, pages, revision, active, again, ask])

  const showMore = useCallback(() => setPaging({ key, pages: pages + 1 }), [key, pages])
  const refresh = useCallback(() => setAgain((n) => n + 1), [])
  return {
    rows: state?.rows ?? [],
    total: state?.total ?? 0,
    by: state?.by ?? null,
    loading: state === null && error === null,
    error,
    hasMore: state?.next != null,
    showMore,
    refresh,
  }
}

