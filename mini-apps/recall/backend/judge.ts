import { decide, type MiniAppContext, type SemanticIndexHost, type SemanticMatch } from '@localixai/mini-app-sdk/backend'
import { cardFaces, duplicateKey, plainFront } from '../shared/cloze'
import { snippet } from '../shared/format'
import { INBOX, type Note, type NoteKind } from '../shared/model'
import type { CheckAnswerResult, Placement, SimilarHit } from '../shared/payloads'
import type { Db } from './db'
import { notFound } from './errors'
import { getCard } from './repo/cards'
import { listDecks } from './repo/decks'
import { getNote, noteIdsWhere, notesByIds, notesWithKeys } from './repo/notes'
import { readSettings } from './repo/settings'
import { NOTES_INDEX, type Core } from './service'

/**
 * Small judgments, each with a path that needs no model: similar cards (meaning, else exact text),
 * where an Inbox note belongs (nearest placed notes, else `decide`, else stay), and whether a typed
 * answer is right (exact, else `decide`, else the person grades). `decide` bills the person's chat
 * and needs one; without a chat or a decision model the fallback stands.
 */

export const SIMILAR_COSINE = 0.85
const PLACEMENT_SHARE = 0.6
const MAX_MODEL_DECKS = 12

export interface JudgeDeps {
  core: Core
  ctx: Pick<MiniAppContext, 'decisions' | 'host' | 'userId'>
  /** The chat a `decide` bills; none → no model judgment. */
  sessionId?: string
}

/** What the embedding model reads for a note. */
export function indexText(note: Pick<Note, 'kind' | 'front' | 'back'>): string {
  return snippet(`${plainFront(note)}\n${note.back}`, 2000)
}

function ready(semantic: SemanticIndexHost | undefined): semantic is SemanticIndexHost {
  try {
    return !!semantic?.status().ready
  } catch {
    return false
  }
}

/** Index the notes for meaning search (boot load only). Answers the release. */
export function registerNotesSource(core: Core, semantic: SemanticIndexHost, userId: string): () => void {
  const items = (db: Db, ids: readonly string[]) =>
    notesByIds(db, ids).map((note) => ({ key: note.id, userId, text: indexText(note), title: snippet(plainFront(note), 80) }))
  return semantic.registerSource({
    collection: NOTES_INDEX,
    label: 'Recall cards',
    version: 1,
    scan: async (cursor, limit) =>
      core.read((db) => {
        const sorted = (
          db.query(`SELECT id FROM notes WHERE ${cursor ? 'id > $cursor' : '1'} ORDER BY id LIMIT $limit`).all(
            cursor ? { cursor, limit } : { limit },
          ) as { id: string }[]
        ).map((row) => row.id)
        return { items: items(db, sorted), next: sorted.length === limit ? (sorted.at(-1) ?? null) : null }
      }),
    read: async (keys) => core.read((db) => items(db, keys)),
    count: async () => core.read((db) => (db.query('SELECT COUNT(*) AS n FROM notes').get() as { n: number }).n),
  })
}

async function nearest(deps: JudgeDeps, text: string, limit: number): Promise<{ key: string; cosine: number }[] | null> {
  const semantic = deps.core.semantic
  if (!ready(semantic)) return null
  try {
    return await semantic.query(deps.ctx.userId, NOTES_INDEX, text, { limit, task: 'similarity' })
  } catch {
    return null
  }
}

/** Note ids nearest in meaning to a query, or null while meaning search is not ready. */
export async function rankNotes(deps: JudgeDeps, query: string, limit = 200): Promise<string[] | null> {
  const semantic = deps.core.semantic
  if (!ready(semantic)) return null
  try {
    const matches = await semantic.query(deps.ctx.userId, NOTES_INDEX, query, { limit, task: 'search' })
    return meaningHits(query, matches)
  } catch {
    return null
  }
}

/** Notes that look like this one: exact text always, by meaning when the model is ready. */
export async function similarTo(
  deps: JudgeDeps,
  note: { kind?: NoteKind; front: string; back?: string },
  excludeId?: string,
): Promise<{ similar: SimilarHit[]; by: 'meaning' | 'exact' }> {
  const kind = note.kind ?? 'basic'
  const exact = deps.core.read((db) => notesWithKeys(db, [duplicateKey({ kind, front: note.front })]))
  const hits: SimilarHit[] = exact
    .filter((hit) => hit.id !== excludeId)
    .map((hit) => ({ noteId: hit.id, front: snippet(hit.front), deck: hit.deck, score: 1, exact: true }))
  const matches = await nearest(deps, indexText({ kind, front: note.front, back: note.back ?? '' }), 8)
  if (!matches) return { similar: hits.slice(0, 5), by: 'exact' }
  const close = matches.filter((m) => m.cosine >= SIMILAR_COSINE && m.key !== excludeId && !hits.some((h) => h.noteId === m.key))
  if (close.length) {
    deps.core.read((db) => {
      const decks = new Map(listDecks(db).map((deck) => [deck.id, deck.name]))
      const notes = new Map(notesByIds(db, close.map((m) => m.key)).map((n) => [n.id, n]))
      for (const match of close) {
        const found = notes.get(match.key)
        if (found) {
          hits.push({
            noteId: found.id,
            front: snippet(plainFront(found)),
            deck: found.deckId ? (decks.get(found.deckId) ?? null) : null,
            score: Math.round(match.cosine * 100) / 100,
            exact: false,
          })
        }
      }
    })
  }
  return { similar: hits.slice(0, 5), by: 'meaning' }
}

/** Suggested deck and tags for Inbox notes (by ids, or the oldest 20 in the Inbox). */
export async function placementFor(deps: JudgeDeps, ids?: readonly string[]): Promise<Placement[]> {
  const { notes, decks, settings } = deps.core.read((db) => ({
    notes: ids?.length
      ? notesByIds(db, ids)
      : notesByIds(db, noteIdsWhere(db, 'n.deck_id IS NULL', {}, 20)),
    decks: listDecks(db),
    settings: readSettings(db),
  }))
  const byId = new Map(decks.map((deck) => [deck.id, deck]))
  const out: Placement[] = []
  for (const note of notes) {
    const matches = ((await nearest(deps, indexText(note), 12)) ?? []).filter((m) => m.key !== note.id)
    const neighbours = deps.core.read((db) => new Map(notesByIds(db, matches.map((m) => m.key)).map((n) => [n.id, n])))
    const votes = new Map<string, { weight: number; count: number }>()
    const tagWeight = new Map<string, number>()
    let total = 0
    for (const match of matches) {
      const other = neighbours.get(match.key)
      if (!other?.deckId) continue
      const weight = Math.max(0, match.cosine)
      total += weight
      const vote = votes.get(other.deckId) ?? { weight: 0, count: 0 }
      votes.set(other.deckId, { weight: vote.weight + weight, count: vote.count + 1 })
      for (const tag of other.tags) tagWeight.set(tag, (tagWeight.get(tag) ?? 0) + weight)
    }
    const tags = [...tagWeight.entries()]
      .filter(([tag, weight]) => !note.tags.includes(tag) && total > 0 && weight / total >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag)
    const [winner] = [...votes.entries()].sort((a, b) => b[1].weight - a[1].weight)
    const clear =
      winner &&
      winner[1].weight >= PLACEMENT_SHARE * total &&
      (winner[1].count >= 2 || matches.some((m) => m.cosine >= 0.9 && neighbours.get(m.key)?.deckId === winner[0]))
    const deck = clear ? byId.get(winner[0]) : undefined
    if (deck) {
      out.push({ noteId: note.id, deck: { id: deck.id, name: deck.name, color: deck.color }, tags, by: 'meaning' })
      continue
    }
    if (settings.suggestPlacement && deps.sessionId && decks.length && decks.length <= MAX_MODEL_DECKS) {
      const options: Record<string, string> = { [INBOX]: 'None of these decks fits; leave it in the Inbox.' }
      for (const each of decks) options[each.id] = each.description ? `${each.name}: ${each.description}` : each.name
      const result = await decide(deps.ctx, {
        userId: deps.ctx.userId,
        sessionId: deps.sessionId,
        purpose: 'recall-placement',
        question: 'Which deck does this flashcard belong in?',
        state: { front: snippet(plainFront(note), 500), back: snippet(note.back, 500) },
        options,
        fallback: INBOX,
        confidence: 0.7,
      })
      const picked = result.by === 'model' ? byId.get(result.pick) : undefined
      if (picked) {
        out.push({ noteId: note.id, deck: { id: picked.id, name: picked.name, color: picked.color }, tags, by: 'model' })
        continue
      }
    }
    out.push({ noteId: note.id, deck: null, tags, by: 'none' })
  }
  return out
}

/** Text compared for a typed answer: case, spacing, punctuation and Markdown marks ignored. */
export function normalizeAnswer(text: string): string {
  return duplicateKey({ kind: 'basic', front: text.replace(/<[^>]+>/g, ' ').replace(/[*_`~]/g, '') })
}

const VERDICT_RATING = { correct: 3, partly: 2, wrong: 1 } as const

/** Check a typed answer: exact → Good; otherwise the decision model, when it is on; else unsure. */
export async function checkAnswer(deps: JudgeDeps, cardId: string, answer: string): Promise<CheckAnswerResult> {
  const { note, expected, settings } = deps.core.read((db) => {
    const card = getCard(db, cardId)
    const found = card && getNote(db, card.noteId)
    if (!card || !found) throw notFound('card', 'Read recall_next_card for card ids.')
    return { note: found, expected: cardFaces(found, card.variant).expected, settings: readSettings(db) }
  })
  const given = normalizeAnswer(answer)
  if (given && given === normalizeAnswer(expected)) return { verdict: 'correct', rating: 3, by: 'exact', expected }
  if (!given) return { verdict: 'wrong', rating: 1, by: 'exact', expected }
  if (!settings.typedAnswerCheck || !deps.sessionId) return { verdict: 'unsure', rating: null, by: 'none', expected }
  const result = await decide(deps.ctx, {
    userId: deps.ctx.userId,
    sessionId: deps.sessionId,
    purpose: 'recall-typed-answer',
    question: 'Is the typed answer right for this flashcard?',
    state: { question: snippet(note.front, 500), expected: snippet(expected, 500), typed: snippet(answer, 500) },
    options: {
      correct: 'Right: it means the same as the expected answer (spelling slips allowed).',
      partly: 'Partly right: part of the answer is missing or wrong.',
      wrong: 'Wrong, or not an answer.',
    },
    fallback: 'partly',
    confidence: 0.7,
  })
  if (result.by !== 'model') return { verdict: 'unsure', rating: null, by: 'none', expected }
  return { verdict: result.pick, rating: VERDICT_RATING[result.pick], by: 'model', expected }
}

/** Words a query is made of that say nothing about its topic. */
const STOP_WORDS = new Set(
  'a an and are as at be by do does for from how in into is it of on or the to what when where which who why with about'.split(' '),
)

function queryTerms(query: string): string[] {
  return query
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map((word) => (word.length > 4 && word.endsWith('es') ? word.slice(0, -2) : word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
}

/** Share of the query's terms that start a word of `text`. */
function coverage(terms: readonly string[], text: string): number {
  if (terms.length === 0) return 0
  const words = text.normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}]+/u)
  return terms.filter((term) => words.some((word) => word.startsWith(term))).length / terms.length
}

/**
 * The notes a meaning search lists, best first: Localix's own hybrid rule. A note matches when it
 * stands out by meaning (`z >= gate`) or holds half the query's words; its score adds both. The
 * index alone fails a topic query: several related notes hold each other below the gate, while a
 * short unrelated note rides near the top of every query.
 */
export function meaningHits(query: string, matches: readonly SemanticMatch[]): string[] {
  const terms = queryTerms(query)
  const scored = new Map<string, number>()
  for (const match of matches) {
    const words = coverage(terms, match.excerpt)
    if (match.z < match.gate && words < 0.5) continue
    const score = Math.max(match.z, 0) + 2 * words ** 1.5
    scored.set(match.key, Math.max(scored.get(match.key) ?? -Infinity, score))
  }
  return [...scored].sort((a, b) => b[1] - a[1]).map(([key]) => key)
}
