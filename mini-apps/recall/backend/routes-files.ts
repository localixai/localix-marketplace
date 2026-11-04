import { readFile } from 'node:fs/promises'
import { Hono } from 'hono'
import { jsonError, mediaTypeForPath, resolveWithin, type MiniAppRouteContext } from '@localixai/mini-app-sdk/backend'
import { api, exportQuerySchema, importCommitQuerySchema, importPreviewQuerySchema } from '../shared/api'
import { heatmapQuerySchema, statsQuerySchema } from '../shared/payloads-more'
import { exportCollection, parseImport } from './import'
import { answer, queryOf, validated, type RouteContext, type RouteDeps } from './route-kit'
import type { Service } from './service'

/** Decks, stats, settings, media, import and export routes (the table is `shared/api.ts`). */

/** The largest upload an import accepts. */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024
const MEDIA_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/

const EXTENSIONS = { json: 'json', csv: 'csv', markdown: 'md' } as const
const TYPES = { json: 'application/json', csv: 'text/csv', markdown: 'text/markdown' } as const

async function uploaded(c: RouteContext): Promise<Uint8Array | Response> {
  const length = Number(c.req.header('content-length') ?? 0)
  if (length > MAX_UPLOAD_BYTES) return jsonError(c, 422, 'too_large', 'That file is larger than 512 MB.')
  const bytes = new Uint8Array(await c.req.arrayBuffer())
  if (!bytes.length) return jsonError(c, 400, 'empty', 'The file is empty.')
  if (bytes.length > MAX_UPLOAD_BYTES) return jsonError(c, 422, 'too_large', 'That file is larger than 512 MB.')
  return bytes
}

/** Parse an uploaded file through the import module. */
export async function parseUpload(service: Service, name: string, bytes: Uint8Array) {
  return parseImport({ name, bytes, mediaDir: service.core.mediaDir })
}

export function fileRoutes(deps: RouteDeps) {
  const { service } = deps
  return new Hono<MiniAppRouteContext>()
    .get(api.decks.path, (c) => answer(c, () => ({ decks: service.decks().decks })))
    .post(api.deckCreate.path, validated('json', api.deckCreate.body), (c) =>
      answer(c, async () => deckSummary(service, (await service.saveDeck(c.req.valid('json'), { onlyNew: true })).deck.id)),
    )
    .patch(api.deckUpdate.path, validated('json', api.deckUpdate.body), (c) =>
      answer(c, async () => deckSummary(service, (await service.patchDeck(c.req.param('id'), c.req.valid('json'))).deck.id)),
    )
    .post(api.deckRemove.path, validated('json', api.deckRemove.body), (c) =>
      answer(c, () => service.removeDeck(c.req.param('id'), c.req.valid('json').cards)),
    )
    .get(api.stats.path, (c) => {
      const query = queryOf(c, statsQuerySchema)
      return query.ok ? answer(c, () => service.stats(query.value)) : query.response
    })
    .get(api.heatmap.path, (c) => {
      const query = queryOf(c, heatmapQuerySchema)
      return query.ok ? answer(c, () => service.heatmap(query.value.weeks)) : query.response
    })
    .get(api.settings.path, (c) => answer(c, () => service.settings()))
    .patch(api.settingsUpdate.path, validated('json', api.settingsUpdate.body), (c) =>
      answer(c, async () => {
        await service.updateSettings(c.req.valid('json'))
        return service.settings()
      }),
    )
    .get(api.media.path, async (c) => {
      const file = c.req.param('file')
      const path = MEDIA_FILE.test(file) ? resolveWithin(service.core.mediaDir, file) : null
      if (!path) return jsonError(c, 404, 'not_found', 'No such image.')
      const bytes = await readFile(path).catch(() => null)
      if (!bytes) return jsonError(c, 404, 'not_found', 'No such image.')
      return c.body(new Uint8Array(bytes), 200, {
        'content-type': mediaTypeForPath(path) ?? 'application/octet-stream',
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      })
    })
    .post(api.importPreview.path, async (c) => {
      const query = queryOf(c, importPreviewQuerySchema)
      if (!query.ok) return query.response
      const bytes = await uploaded(c)
      if (bytes instanceof Response) return bytes
      return answer(c, async () => service.previewImport(await parseUpload(service, query.value.name, bytes)))
    })
    .post(api.importCommit.path, async (c) => {
      const query = queryOf(c, importCommitQuerySchema)
      if (!query.ok) return query.response
      const bytes = await uploaded(c)
      if (bytes instanceof Response) return bytes
      const { name, ...options } = query.value
      return answer(c, async () => service.commitImport(await parseUpload(service, name, bytes), options))
    })
    .get(api.export.path, (c) => {
      const query = queryOf(c, exportQuerySchema)
      if (!query.ok) return query.response
      const format = query.value.format ?? 'json'
      return answer(c, () => {
        const data = service.exportData()
        const text = exportCollection(data, format)
        const name = `recall-${data.exportedAt.slice(0, 10)}.${EXTENSIONS[format]}`
        return c.body(text, 200, {
          'content-type': `${TYPES[format]}; charset=utf-8`,
          'content-disposition': `attachment; filename="${name}"`,
        })
      })
    })
}

function deckSummary(service: Service, id: string) {
  const deck = service.decks().decks.find((each) => each.id === id)
  if (!deck) throw new Error('The deck was not saved.')
  return deck
}
