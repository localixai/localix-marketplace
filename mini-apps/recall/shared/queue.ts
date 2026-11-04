/**
 * The study queue, as a pure function over the candidate rows SQL picked (see
 * `backend/repo/queue.ts`): due learning cards first, then due reviews (least likely to be
 * remembered first, the order SQL gives), with new cards spread among them up to the day's
 * remaining new limit. Only one card of a note is shown per session: a sibling waits for tomorrow.
 */

export type QueueKind = 'learning' | 'review' | 'new'

export interface QueueCandidate {
  cardId: string
  noteId: string
  due: string
}

export interface QueueEntry extends QueueCandidate {
  kind: QueueKind
}

export interface QueueInput {
  /** Learning and relearning cards due now, any order. */
  learning: readonly QueueCandidate[]
  /** Review cards due today, most overdue first. */
  review: readonly QueueCandidate[]
  /** New cards in the order they were added. */
  fresh: readonly QueueCandidate[]
  /** How many new cards today still allows. */
  newLimit: number
}

/** Keep the first card of each note, skipping notes already taken. */
function onePerNote(rows: readonly QueueCandidate[], taken: Set<string>): QueueCandidate[] {
  const kept: QueueCandidate[] = []
  for (const row of rows) {
    if (taken.has(row.noteId)) continue
    taken.add(row.noteId)
    kept.push(row)
  }
  return kept
}

/** Spread `fresh` among `reviews`: one new card after every few reviews, evenly. */
export function interleave<T>(reviews: readonly T[], fresh: readonly T[]): T[] {
  if (!fresh.length) return [...reviews]
  if (!reviews.length) return [...fresh]
  const every = Math.max(1, Math.floor(reviews.length / fresh.length))
  const out: T[] = []
  let next = 0
  reviews.forEach((review, index) => {
    out.push(review)
    if ((index + 1) % every === 0 && next < fresh.length) out.push(fresh[next++]!)
  })
  while (next < fresh.length) out.push(fresh[next++]!)
  return out
}

export function buildQueue(input: QueueInput): QueueEntry[] {
  const learning = [...input.learning]
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
    .map((row) => ({ ...row, kind: 'learning' as const }))
  // A note with a learning card in the session shows nothing else of it.
  const taken = new Set(learning.map((row) => row.noteId))
  const review = onePerNote(input.review, taken).map((row) => ({ ...row, kind: 'review' as const }))
  const fresh = onePerNote(input.fresh, taken)
    .slice(0, Math.max(0, input.newLimit))
    .map((row) => ({ ...row, kind: 'new' as const }))
  return [...learning, ...interleave<QueueEntry>(review, fresh)]
}

export interface QueueCounts {
  learning: number
  review: number
  new: number
  total: number
}

export function countQueue(queue: readonly QueueEntry[]): QueueCounts {
  const counts = { learning: 0, review: 0, new: 0, total: queue.length }
  for (const entry of queue) counts[entry.kind] += 1
  return counts
}
