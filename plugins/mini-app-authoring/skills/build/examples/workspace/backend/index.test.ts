import { describe, expect, test } from 'bun:test'
import { parseResourceUri, type ResourceRefProvider } from '@localixai/mini-app-sdk/backend'
import {
  TEST_USER,
  callTool,
  requestRoute,
  testMiniAppContext,
} from '@localixai/mini-app-sdk/backend/testing'
import { register } from './index'

const SAVE = 'example_workspace_save_request'
const ROOT = 'localix://resource/request'

/** The @-mention provider the registration mounts. */
function providerOf(app: ReturnType<typeof register>): ResourceRefProvider {
  const [backend] = [app.backend].flat()
  return backend!.resourceProvider as ResourceRefProvider
}

/**
 * The backend tested through what the agent, the screens and the @ menu do, on one store: one test
 * per thing a person or the agent does, asserting what they are told back.
 */
describe('Example Workspace', () => {
  test('what the agent saves is on the strip, and a chat only sees its own', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-workspace' })
    const app = register(ctx)

    const saved = await callTool(
      app,
      SAVE,
      { name: 'List users', method: 'GET', url: 'https://api.example.com/users' },
      { sessionId: 'chat-a' },
    )
    expect(saved).toEqual({
      text: expect.stringContaining('Saved "List users".\n1 request saved in this chat.'),
      isError: false,
    })

    const strip = await requestRoute(app, 'GET', '/requests', undefined, { sessionId: 'chat-a' })
    expect(strip.json).toEqual({
      items: [expect.objectContaining({ name: 'List users', headers: [], body: '' })],
    })
    const other = await requestRoute(app, 'GET', '/requests', undefined, { sessionId: 'chat-b' })
    expect(other.json).toEqual({ items: [] })
  })

  test('a request saved from a code block in the transcript is one the agent can read and run', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-workspace' })
    const app = register(ctx)
    const added = await requestRoute(
      app,
      'POST',
      '/requests',
      { name: 'Ping', method: 'POST', url: 'https://example.com/ping', body: '{"a":1}' },
      { sessionId: 'chat-a' },
    )
    const [{ id }] = (added.json as { items: { id: string }[] }).items

    const listed = await callTool(
      app,
      'example_workspace_list_requests',
      {},
      { sessionId: 'chat-a' },
    )
    expect(listed.text).toContain(`- Ping: POST https://example.com/ping (id ${id})`)
    const curl = await callTool(
      app,
      'example_workspace_curl_request',
      { id },
      { sessionId: 'chat-a' },
    )
    expect(curl.text).toBe(`curl -sS -i -X POST 'https://example.com/ping' --data-raw '{"a":1}'`)
  })

  test('removing a request, and an id that is not there', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-workspace' })
    const app = register(ctx)
    const chat = { sessionId: 'chat-a' }
    await callTool(app, SAVE, { name: 'A', method: 'GET', url: 'https://a.test' }, chat)
    const [{ id }] = (
      (await requestRoute(app, 'GET', '/requests', undefined, chat)).json as {
        items: { id: string }[]
      }
    ).items

    const gone = await callTool(app, 'example_workspace_remove_request', { id }, chat)
    expect(gone).toEqual({ text: expect.stringContaining('No requests are saved'), isError: false })
    const again = await callTool(app, 'example_workspace_remove_request', { id }, chat)
    expect(again.isError).toBe(true)
    expect(again.text).toContain('No saved request has that id')
  })

  test('a method outside the list is refused before anything is stored', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-workspace' })
    const app = register(ctx)
    const chat = { sessionId: 'chat-a' }
    const bad = { name: 'A', method: 'FETCH', url: 'https://a.test' }
    await expect(callTool(app, SAVE, bad, chat)).rejects.toThrow()
    expect((await requestRoute(app, 'POST', '/requests', bad, chat)).status).toBe(400)
    expect((await requestRoute(app, 'GET', '/requests', undefined, chat)).json).toEqual({
      items: [],
    })
  })

  test('the @ menu lists this chat’s requests, filters them, and expands one as .http text', async () => {
    await using ctx = await testMiniAppContext({ name: 'example-workspace' })
    const app = register(ctx)
    const provider = providerOf(app)
    const scope = { sessionId: 'chat-a' }

    const empty = await provider.listChildren(TEST_USER, null, undefined, scope)
    expect(empty).toEqual([expect.objectContaining({ notice: true, label: 'No saved requests' })])

    await callTool(
      app,
      SAVE,
      { name: 'List users', method: 'GET', url: 'https://a.test/users' },
      scope,
    )
    await callTool(
      app,
      SAVE,
      { name: 'Health', method: 'GET', url: 'https://a.test/health' },
      scope,
    )
    const nodes = await provider.listChildren(TEST_USER, null, 'users', scope)
    expect(nodes).toEqual([
      expect.objectContaining({ label: 'List users', detail: 'GET https://a.test/users' }),
    ])
    expect(
      await provider.listChildren(TEST_USER, null, undefined, { sessionId: 'chat-b' }),
    ).toEqual([expect.objectContaining({ notice: true })])

    const id = parseResourceUri(nodes[0]!.uri)?.segments[0]
    expect(await provider.expand(TEST_USER, `${ROOT}/${id}`, scope)).toEqual({
      ok: true,
      content: '### List users\nGET https://a.test/users\n',
      language: 'http',
    })
    expect(await provider.expand(TEST_USER, `${ROOT}/${id}`, { sessionId: 'chat-b' })).toEqual({
      ok: false,
      error: `unknown request: ${ROOT}/${id}`,
    })
  })
})
