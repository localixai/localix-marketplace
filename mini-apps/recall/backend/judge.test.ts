import { describe, expect, test } from 'bun:test'
import { fakeSemantic, requestRoute } from '@localixai/mini-app-sdk/backend/testing'
import type { DecisionHost } from '@localixai/mini-app-sdk/backend'
import { registerRecall } from './index'
import { meaningHits } from './judge'
import { addReady, callTool, recallApp, route } from './test-support'

/** Similar cards, placement and typed answers: by meaning or the decision model, else a fallback. */

/** A decision model that always picks `choice` with this confidence. */
function decisions(choice: (options: string[]) => string, probability = 0.9): DecisionHost & { asked: number } {
  const host = {
    asked: 0,
    available: async () => ({ model: 'test' }),
    decide: async (_user: string, ask: { questions: Record<string, { criteria?: Record<string, string> }> }) => {
      host.asked += 1
      const pick = choice(Object.keys(ask.questions.answer?.criteria ?? {}))
      return { status: 'answered', model: 'test', ms: 1, answers: { answer: { type: 'choice', choice: pick, probabilities: { [pick]: probability } } } }
    },
  }
  return host as unknown as DecisionHost & { asked: number }
}

describe('judgments', () => {
  // The fake index matches a document that holds every word of the query.
  test('similar cards: exact text without the model, meaning once it is ready', async () => {
    const semantic = fakeSemantic()
    await using ctx = await recallApp({ host: { semantic } })
    await addReady(ctx.app, [{ front: 'the capital of France', back: 'Paris' }])

    const exact = await route(ctx.app, 'similar', { body: { front: 'The capital of France!' } })
    expect(exact.by).toBe('exact')
    expect(exact.similar).toEqual([expect.objectContaining({ exact: true, score: 1 })])

    semantic.ready = true
    const meaning = await route(ctx.app, 'similar', { body: { front: 'France capital' } })
    expect(meaning.by).toBe('meaning')
    expect(meaning.similar[0]).toMatchObject({ exact: false, front: 'the capital of France' })
  })

  // An agent's tool runs in a load with no `host`; newer hosts give it the index as `ctx.semantic`.
  test("the agent's tools search by meaning from their own load, which has no host", async () => {
    const semantic = fakeSemantic()
    await using boot = await recallApp({ host: { semantic } })
    await addReady(boot.app, [{ front: 'the capital of France', back: 'Paris' }, { front: 'Mitochondria?', back: 'powerhouse' }])
    semantic.ready = true
    const tools = registerRecall(Object.assign(Object.create(boot), { host: undefined, semantic }), { clock: boot.clock })

    const found = await callTool(tools, 'recall_find_cards', { query: 'France capital', mode: 'meaning' })
    expect(found.text).toContain('the capital of France')
    expect(found.text).not.toContain('matched by words instead')
  })

  // The index ranks every note against a query; only those that stand out (z >= gate) match. The
  // list used to show all of them, so a search for planets listed Spanish words third.
  test('a meaning search lists only the notes that stand out from the rest', async () => {
    const semantic = fakeSemantic()
    await using ctx = await recallApp({ host: { semantic } })
    const [planet, word] = await addReady(ctx.app, [{ front: 'Largest planet', back: 'Jupiter' }, { front: 'quizás', back: 'maybe' }])
    semantic.ready = true
    Object.assign(semantic, {
      query: async () => [
        { key: planet, chunk: 0, excerpt: '', z: 3.1, gate: 2.2, cosine: 0.7, scope: null },
        { key: word, chunk: 0, excerpt: '', z: 0.4, gate: 2.2, cosine: 0.2, scope: null },
      ],
    })
    const page = await route(ctx.app, 'library', { query: { q: 'planets and stars', mode: 'meaning' } })
    expect(page.rows.map((row: { note: { id: string } }) => row.note.id)).toEqual([planet])
    expect(page.total).toBe(1)
  })

  test('an Inbox card is placed where its nearest cards are, by meaning', async () => {
    const semantic = fakeSemantic()
    await using ctx = await recallApp({ host: { semantic } })
    await addReady(
      ctx.app,
      [
        { front: 'mitochondria cell organelle', back: 'energy', tags: ['cells'] },
        { front: 'ribosome cell organelle', back: 'proteins', tags: ['cells'] },
      ],
      'Biology',
    )
    await addReady(ctx.app, [{ front: 'treaty of versailles', back: '1919' }], 'History')
    const inbox = await route(ctx.app, 'noteCreate', { body: { front: 'cell organelle', back: 'organelle' } })
    semantic.ready = true

    const { suggestions } = await route(ctx.app, 'placement', { body: { ids: [inbox.note.id] } })
    expect(suggestions).toEqual([
      { noteId: inbox.note.id, deck: expect.objectContaining({ name: 'Biology' }), tags: ['cells'], by: 'meaning' },
    ])
  })

  test('without a clear neighbour the decision model picks, and without a chat it stays in the Inbox', async () => {
    const model = decisions((options) => options.find((key) => key !== 'inbox')!)
    await using ctx = await recallApp({ host: { decisions: model } })
    await route(ctx.app, 'deckCreate', { body: { name: 'Geography', description: 'Places' } })
    const inbox = await route(ctx.app, 'noteCreate', { body: { front: 'Longest river?', back: 'Nile' } })

    const noChat = await route(ctx.app, 'placement', { body: {} })
    expect(noChat.suggestions[0]).toMatchObject({ deck: null, by: 'none' })
    expect(model.asked).toBe(0)

    const inChat = await requestRoute(ctx.app, 'POST', '/inbox/suggest', { ids: [inbox.note.id] }, { sessionId: 'chat-1' })
    expect((inChat.json as any).suggestions[0]).toMatchObject({ deck: { name: 'Geography' }, by: 'model' })
  })

  test('typed answers: exact match is Good; otherwise the model when on, else the person grades', async () => {
    const model = decisions(() => 'partly')
    await using ctx = await recallApp({ host: { decisions: model } })
    await addReady(ctx.app, [{ kind: 'typed', front: 'Spell: necessary', back: 'Necessary' }])
    const cardId = (await route(ctx.app, 'studyNext')).card.card.id
    expect(await route(ctx.app, 'studyCheck', { body: { cardId, answer: ' necessary! ' } })).toEqual({
      verdict: 'correct',
      rating: 3,
      by: 'exact',
      expected: 'Necessary',
    })
    const off = await requestRoute(ctx.app, 'POST', '/study/check', { cardId, answer: 'neccesary' }, { sessionId: 'chat-1' })
    expect(off.json).toMatchObject({ verdict: 'unsure', rating: null, by: 'none' })

    await route(ctx.app, 'settingsUpdate', { body: { typedAnswerCheck: true } })
    const on = await requestRoute(ctx.app, 'POST', '/study/check', { cardId, answer: 'neccesary' }, { sessionId: 'chat-1' })
    expect(on.json).toMatchObject({ verdict: 'partly', rating: 2, by: 'model' })
  })

  test('an unsure model leaves the grade to the person', async () => {
    const model = decisions(() => 'correct', 0.4)
    await using ctx = await recallApp({ host: { decisions: model } })
    await route(ctx.app, 'settingsUpdate', { body: { typedAnswerCheck: true } })
    await addReady(ctx.app, [{ kind: 'typed', front: 'Q', back: 'Answer' }])
    const cardId = (await route(ctx.app, 'studyNext')).card.card.id
    const unsure = await requestRoute(ctx.app, 'POST', '/study/check', { cardId, answer: 'something' }, { sessionId: 'chat-1' })
    expect(unsure.json).toMatchObject({ verdict: 'unsure', rating: null })
  })
})

describe('meaningHits', () => {
  const m = (excerpt: string, z: number) => ({ key: excerpt, chunk: 0, excerpt, z, gate: 2.37, cosine: 0.6, scope: null })
  // z values measured on EmbeddingGemma with a 61-note collection: a topic query lifts several
  // related notes to about 2 and none past the gate, while a short note ("quizás") rides near every
  // query at about 1.8.
  test('a topic query keeps the notes that share its words and drops the noise', () => {
    const hits = meaningHits('planets and stars', [
      m('Hottest planet Venus', 2.35),
      m('The Sun is about 150 million km', 1.96),
      m('quizás maybe', 1.83),
      m('Closest star to the Sun Proxima Centauri', 1.73),
      m('Planet with the most prominent rings Saturn', 1.43),
    ])
    expect(hits).toEqual(['Hottest planet Venus', 'Closest star to the Sun Proxima Centauri', 'Planet with the most prominent rings Saturn'])
  })

  test('a note that stands out by meaning matches without sharing a word, and leads', () => {
    const hits = meaningHits('mitochondria energy', [m('Powerhouse of the cell? The mitochondrion', 3.07), m('quizás maybe', 1.6)])
    expect(hits).toEqual(['Powerhouse of the cell? The mitochondrion'])
  })
})
