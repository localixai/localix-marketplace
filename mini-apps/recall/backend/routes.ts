import { Hono } from 'hono'
import type { MiniAppRouteContext } from '@localixai/mini-app-sdk/backend'
import { api } from '../shared/api'
import { countOf } from '../shared/format'
import { libraryQuerySchema, type CardFilter } from '../shared/model'
import { notFound } from './errors'
import { checkAnswer, placementFor, rankNotes, similarTo } from './judge'
import { answer, judgeDeps, queryOf, validated, type RouteDeps } from './route-kit'
import { fileRoutes } from './routes-files'

/**
 * The screen's routes, mounted under `/rpc/recall`: exactly the table in `shared/api.ts`. Each
 * handler is a call into the service (and the judge); the service owns every rule. Study routes
 * answer as `source: 'screen'`.
 */

export function createRoutes(deps: RouteDeps) {
  const { service } = deps
  const filterOf = (c: Parameters<typeof queryOf>[0]) => queryOf(c, api.studyNext.query)
  const routes = new Hono<MiniAppRouteContext>()
    .get(api.revision.path, (c) => answer(c, async () => ({ revision: await service.revision() })))
    .get(api.today.path, (c) => answer(c, () => service.today()))
    .get(api.studyQueue.path, (c) => {
      const filter = filterOf(c)
      return filter.ok ? answer(c, () => service.studyQueue(filter.value)) : filter.response
    })
    .get(api.studyNext.path, (c) => {
      const filter = filterOf(c)
      return filter.ok ? answer(c, () => service.studyNext(filter.value)) : filter.response
    })
    .get(api.studyCard.path, (c) => answer(c, () => service.studyCard(c.req.param('id'))))
    .post(api.studyGrade.path, validated('json', api.studyGrade.body), (c) =>
      answer(c, () => service.gradeCard({ ...c.req.valid('json'), source: 'screen' })),
    )
    .post(api.studyUndo.path, (c) => answer(c, () => service.undoLast('screen')))
    .post(api.studyPause.path, validated('json', api.studyPause.body), (c) => {
      const { cardId, filter } = c.req.valid('json')
      return answer(c, () => service.pauseCard(cardId, filter as CardFilter | undefined))
    })
    .post(api.studySkip.path, validated('json', api.studySkip.body), (c) => {
      const { cardId, filter } = c.req.valid('json')
      return answer(c, () => service.skipCard(cardId, filter as CardFilter | undefined))
    })
    .post(api.studyCheck.path, validated('json', api.studyCheck.body), (c) => {
      const { cardId, answer: typed } = c.req.valid('json')
      return answer(c, () => checkAnswer(judgeDeps(deps, c), cardId, typed))
    })
    .get(api.library.path, (c) => {
      const query = queryOf(c, libraryQuerySchema)
      if (!query.ok) return query.response
      return answer(c, async () => {
        const { q, mode } = query.value
        const ranked = q && mode === 'meaning' ? await rankNotes(judgeDeps(deps, c), q) : null
        return service.library(query.value, ranked ?? undefined)
      })
    })
    .post(api.noteCreate.path, validated('json', api.noteCreate.body), (c) =>
      answer(c, async () => {
        const input = c.req.valid('json')
        const { added } = await service.addNotes([input], {
          source: 'manual',
          status: input.status ?? 'active',
          skipDuplicates: false,
        })
        const made = added[0]!
        const { similar } = await similarTo(judgeDeps(deps, c), made.note, made.note.id)
        return { ...made, similar }
      }),
    )
    .get(api.noteGet.path, (c) => answer(c, () => service.noteDetail(c.req.param('id'))))
    .patch(api.noteUpdate.path, validated('json', api.noteUpdate.body), (c) =>
      answer(c, async () => {
        const saved = await service.updateNote(c.req.param('id'), c.req.valid('json'))
        const { similar } = await similarTo(judgeDeps(deps, c), saved.note, saved.note.id)
        return { ...saved, similar }
      }),
    )
    .delete(api.noteRemove.path, (c) =>
      answer(c, async () => {
        const removed = await service.removeNotes([c.req.param('id')])
        if (!removed) throw notFound('card', 'Reload the list.')
        return { affected: removed, message: `Deleted ${countOf(removed, 'note')} with its cards.` }
      }),
    )
    .post(api.bulk.path, validated('json', api.bulk.body), (c) => answer(c, () => service.bulk(c.req.valid('json'))))
    .post(api.drafts.path, validated('json', api.drafts.body), (c) => answer(c, () => service.drafts(c.req.valid('json'))))
    .post(api.placement.path, validated('json', api.placement.body), (c) =>
      answer(c, async () => ({ suggestions: await placementFor(judgeDeps(deps, c), c.req.valid('json').ids) })),
    )
    .post(api.similar.path, validated('json', api.similar.body), (c) => {
      const { excludeId, ...note } = c.req.valid('json')
      return answer(c, () => similarTo(judgeDeps(deps, c), note, excludeId))
    })
  return routes.route('/', fileRoutes(deps))
}
