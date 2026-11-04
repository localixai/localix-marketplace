import { z } from 'zod'
import {
  APP,
  cardFilterSchema,
  libraryQuerySchema,
  noteInputSchema,
  notePatchSchema,
  settingsPatchSchema,
} from './model'
import {
  bulkRequestSchema,
  bulkResultSchema,
  cardActionSchema,
  checkAnswerRequestSchema,
  checkAnswerResultSchema,
  deckCreateSchema,
  deckPatchSchema,
  deckRemoveSchema,
  deckSummarySchema,
  draftsRequestSchema,
  gradeRequestSchema,
  gradeResultSchema,
  libraryPageSchema,
  noteDetailSchema,
  placementRequestSchema,
  placementResultSchema,
  saveNoteResultSchema,
  similarRequestSchema,
  similarResultSchema,
  studyCardSchema,
  studyNextSchema,
  studyQueueSchema,
  todaySchema,
  undoResultSchema,
} from './payloads'
import {
  decksResultSchema,
  deckRemoveResultSchema,
  exportFormatSchema,
  heatmapQuerySchema,
  heatmapSchema,
  importOptionsSchema,
  importPreviewSchema,
  importResultSchema,
  revisionSchema,
  settingsResultSchema,
  statsQuerySchema,
  statsSchema,
} from './payloads-more'

/**
 * THE ROUTE CONTRACT — every route the screen calls, with its method, path, query, body and answer.
 * `backend/routes.ts` mounts exactly these and the screen builds its requests from them, so the two
 * cannot drift. Paths are relative to `API_BASE` (`/rpc/recall`); `:id` and `:file` are params.
 *
 * - `query`: a GET's parameters, encoded by `toQuery` (arrays comma-joined) and read by `fromQuery`.
 * - `body`: a JSON body; `'bytes'` is the raw file as `application/octet-stream`.
 * - `response`: the JSON answer; `'bytes'` is a file (an image), `'download'` an attachment.
 * - An error answers `{ error: { code, message } }` with 400/404/409/422 (`unwrapMiniAppResponse`).
 */

export const API_BASE = `/rpc/${APP}`

export const importPreviewQuerySchema = z.object({ name: z.string().min(1).max(255) })
export const importCommitQuerySchema = importOptionsSchema.extend({
  name: z.string().min(1).max(255),
})
export const exportQuerySchema = z.object({ format: exportFormatSchema.optional() })
const empty = z.object({})

export const api = {
  revision: { method: 'GET', path: '/revision', response: revisionSchema },
  today: { method: 'GET', path: '/today', response: todaySchema },
  studyQueue: { method: 'GET', path: '/study/queue', query: cardFilterSchema, response: studyQueueSchema },
  studyNext: { method: 'GET', path: '/study/next', query: cardFilterSchema, response: studyNextSchema },
  studyCard: { method: 'GET', path: '/study/cards/:id', response: studyCardSchema },
  studyGrade: { method: 'POST', path: '/study/grade', body: gradeRequestSchema, response: gradeResultSchema },
  studyUndo: { method: 'POST', path: '/study/undo', body: empty, response: undoResultSchema },
  studyPause: { method: 'POST', path: '/study/pause', body: cardActionSchema, response: studyNextSchema },
  studySkip: { method: 'POST', path: '/study/skip', body: cardActionSchema, response: studyNextSchema },
  studyCheck: {
    method: 'POST',
    path: '/study/check',
    body: checkAnswerRequestSchema,
    response: checkAnswerResultSchema,
  },
  library: { method: 'GET', path: '/library', query: libraryQuerySchema, response: libraryPageSchema },
  noteCreate: { method: 'POST', path: '/notes', body: noteInputSchema, response: saveNoteResultSchema },
  noteGet: { method: 'GET', path: '/notes/:id', response: noteDetailSchema },
  noteUpdate: { method: 'PATCH', path: '/notes/:id', body: notePatchSchema, response: saveNoteResultSchema },
  noteRemove: { method: 'DELETE', path: '/notes/:id', response: bulkResultSchema },
  bulk: { method: 'POST', path: '/notes/bulk', body: bulkRequestSchema, response: bulkResultSchema },
  drafts: { method: 'POST', path: '/drafts', body: draftsRequestSchema, response: bulkResultSchema },
  placement: {
    method: 'POST',
    path: '/inbox/suggest',
    body: placementRequestSchema,
    response: placementResultSchema,
  },
  similar: { method: 'POST', path: '/similar', body: similarRequestSchema, response: similarResultSchema },
  decks: { method: 'GET', path: '/decks', response: decksResultSchema },
  deckCreate: { method: 'POST', path: '/decks', body: deckCreateSchema, response: deckSummarySchema },
  deckUpdate: { method: 'PATCH', path: '/decks/:id', body: deckPatchSchema, response: deckSummarySchema },
  deckRemove: {
    method: 'POST',
    path: '/decks/:id/remove',
    body: deckRemoveSchema,
    response: deckRemoveResultSchema,
  },
  stats: { method: 'GET', path: '/stats', query: statsQuerySchema, response: statsSchema },
  heatmap: { method: 'GET', path: '/heatmap', query: heatmapQuerySchema, response: heatmapSchema },
  settings: { method: 'GET', path: '/settings', response: settingsResultSchema },
  settingsUpdate: {
    method: 'PATCH',
    path: '/settings',
    body: settingsPatchSchema,
    response: settingsResultSchema,
  },
  media: { method: 'GET', path: '/media/:file', response: 'bytes' },
  importPreview: {
    method: 'POST',
    path: '/import/preview',
    query: importPreviewQuerySchema,
    body: 'bytes',
    response: importPreviewSchema,
  },
  importCommit: {
    method: 'POST',
    path: '/import/commit',
    query: importCommitQuerySchema,
    body: 'bytes',
    response: importResultSchema,
  },
  export: { method: 'GET', path: '/export', query: exportQuerySchema, response: 'download' },
} as const

export type Api = typeof api
export type RouteName = keyof Api
type SchemaOf<T> = T extends z.ZodType ? z.infer<T> : never
/** The JSON answer of a route. */
export type ResponseOf<K extends RouteName> = SchemaOf<Api[K]['response']>
/** The JSON body of a route. */
export type BodyOf<K extends RouteName> = Api[K] extends { body: infer B } ? SchemaOf<B> : never
/** The query of a route. */
export type QueryOf<K extends RouteName> = Api[K] extends { query: infer Q } ? z.input<Q & z.ZodType> : never

type Scalar = string | number | boolean
/** A query string from values: arrays comma-joined, empty values left out. */
export function toQuery(values: Record<string, Scalar | readonly Scalar[] | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(','))
    } else params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

function unwrap(schema: z.ZodType): z.ZodType {
  let inner = schema
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable || inner instanceof z.ZodDefault) {
    inner = inner.unwrap() as z.ZodType
  }
  return inner
}

/** Read a query back into the shape `schema` expects (the inverse of `toQuery`). */
export function fromQuery<S extends z.ZodObject>(schema: S, params: URLSearchParams): z.ZodSafeParseResult<z.infer<S>> {
  const raw: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(schema.shape)) {
    const value = params.get(key)
    if (value === null || value === '') continue
    const inner = unwrap(field as z.ZodType)
    if (inner instanceof z.ZodArray) raw[key] = value.split(',').filter(Boolean)
    else if (inner instanceof z.ZodNumber) raw[key] = Number(value)
    else if (inner instanceof z.ZodBoolean) raw[key] = value === 'true' ? true : value === 'false' ? false : value
    else raw[key] = value
  }
  return schema.safeParse(raw)
}

/** The full path of a route, with its params filled and its query encoded. */
export function pathOf(
  name: RouteName,
  params: Record<string, string> = {},
  query: Record<string, Scalar | readonly Scalar[] | null | undefined> = {},
): string {
  const path = api[name].path.replace(/:(\w+)/g, (_m, key: string) => {
    const value = params[key]
    if (value === undefined) throw new Error(`The route ${name} needs :${key}.`)
    return encodeURIComponent(value)
  })
  return `${API_BASE}${path}${toQuery(query)}`
}

/** Notes refer to media as `media/<sha256>.<ext>`; the screen serves it from this path. */
export const MEDIA_REF = 'media/'
export function mediaPath(file: string): string {
  return pathOf('media', { file })
}

/**
 * Markdown with its `media/<file>` references rewritten by `toUrl` (the screen passes
 * `(file) => miniAppApiUrl(mediaPath(file))`), in `![](…)` images and `src="…"` attributes.
 */
export function withMediaUrls(markdown: string, toUrl: (file: string) => string): string {
  return markdown.replace(
    /(\]\(|src=["'])media\/([A-Za-z0-9._-]+)/g,
    (_m, lead: string, file: string) => `${lead}${toUrl(file)}`,
  )
}
