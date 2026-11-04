import type { LibraryQuery } from '../../shared/model'
import type { BulkRequest } from '../../shared/payloads'
import type { BulkBody } from './BulkDialogs'

/** What a bulk action applies to: the loaded cards picked by id, or every card the list matches. */
export type BulkTarget =
  | { all: false; ids: readonly string[] }
  | { all: true; match: LibraryQuery; expect: number }

/**
 * The one place a bulk request is built. In "all" mode it carries the list's own query and the count
 * the person was shown, never an id list, so no action can quietly shrink to the loaded rows.
 */
export function bulkRequest(target: BulkTarget, body: BulkBody): BulkRequest {
  return target.all
    ? { ...body, match: target.match, expect: target.expect }
    : { ...body, ids: [...target.ids] }
}
