import { afterEach, describe, expect, test } from 'bun:test'
import type {
  ActionContribution,
  FileEditorContribution,
  SessionSurfaceContribution,
  ToolCardContribution,
} from '@localixai/mini-app-sdk/ui'
import { bindMiniAppUiTransport } from '@localixai/mini-app-sdk/ui/transport'
import { recordingMiniAppUiHost } from '@localixai/mini-app-sdk/ui/testing'
import { SAVE_TOOL } from '../shared/model'
import { registerUi } from './register'

/** One test per registration, each against what the host would do with it. */
function registered() {
  const { host, registrations } = recordingMiniAppUiHost()
  registerUi(host)
  return { host, registrations }
}

describe('what Example Workspace registers with the host', () => {
  test('registers once per host, however often the host calls it', () => {
    const { host, registrations } = registered()
    registerUi(host)
    expect(registrations.fileEditors).toHaveLength(1)
    expect(registrations.sessionSurfaces).toHaveLength(1)
    const second = registered()
    expect(second.registrations.fileEditors).toHaveLength(1)
  })

  test('opens .http files in its editor, and no other file', () => {
    const [editor] = registered().registrations.fileEditors as FileEditorContribution[]
    const claims = (path: string) => editor!.match(path)
    expect(claims('api/users.http')).toBe(true)
    expect(claims('API/USERS.HTTP')).toBe(true)
    expect(claims('notes/http.md')).toBe(false)
    expect(claims('src/http')).toBe(false)
  })

  test('gives the save tool a card, and every other tool a verb and an icon', () => {
    const cards = registered().registrations.toolCards as ToolCardContribution[]
    const byTool = new Map(cards.map((card) => [card.tool, card]))
    expect(byTool.get(SAVE_TOOL)?.Component).toBeDefined()
    expect(byTool.get(SAVE_TOOL)?.presentation).toMatchObject({ label: 'Saved', verb: 'Saving' })
    expect([...byTool.keys()].sort()).toEqual([
      'example_workspace_curl_request',
      'example_workspace_list_requests',
      'example_workspace_remove_request',
      SAVE_TOOL,
    ])
    const plain = byTool.get('example_workspace_list_requests')!
    expect(plain.Component).toBeUndefined()
    expect(plain.presentation.readOnly).toBe(true)
    expect(byTool.get('example_workspace_remove_request')!.presentation.readOnly).toBe(false)
  })

  test('puts the strip above the composer', () => {
    const [surface] = registered().registrations.sessionSurfaces as SessionSurfaceContribution[]
    expect(surface).toMatchObject({ surface: 'composer.header' })
  })

  test('draws the request glyph for its @ mentions', () => {
    const [icons] = registered().registrations.resourceRefIcons as Record<string, unknown>[]
    expect(Object.keys(icons!)).toEqual(['request'])
  })
})

describe('the Save requests action on a chat code block', () => {
  const sent: { path: string; body: unknown }[] = []
  let unbind: (() => void) | undefined
  afterEach(() => {
    unbind?.()
    unbind = undefined
    sent.length = 0
  })
  const action = () => (registered().registrations.actions as ActionContribution[])[0]!
  const code = (text: string) => ({ kind: 'code' as const, language: 'http', text })
  const REQUEST = '### Ping\nGET https://example.com/ping\nAccept: text/plain\n'

  test('shows on a code block that holds a request, and nowhere else', () => {
    const { when } = action()
    const context = (surface: string, target: Parameters<typeof when>[0]['target']) => ({
      sessionId: 'chat-a',
      surface,
      target,
    })
    expect(when(context('chat.content', code(REQUEST)))).toBe(true)
    expect(when(context('chat.content', code('npm install')))).toBe(false)
    expect(
      when(context('chat.content', { kind: 'markdown', block: 'paragraph', markdown: REQUEST })),
    ).toBe(false)
    expect(when(context('board.element', code(REQUEST)))).toBe(false)
  })

  test('saves every request in the block to the chat the block belongs to', async () => {
    unbind = bindMiniAppUiTransport({
      url: (path) => path,
      request: async (path, init) => {
        sent.push({ path, body: JSON.parse(init?.body as string) })
        return Response.json({ items: [] })
      },
    })
    const result = await action().run({
      sessionId: 'chat a',
      surface: 'chat.content',
      target: code(`${REQUEST}\n### Reset\nPOST https://example.com/reset\n`),
    })
    expect(result).toEqual({ message: 'Saved 2 requests' })
    expect(sent.map(({ path }) => path)).toEqual([
      '/rpc/example-workspace/requests?sessionId=chat%20a',
      '/rpc/example-workspace/requests?sessionId=chat%20a',
    ])
    expect(sent[0]!.body).toEqual({
      name: 'Ping',
      method: 'GET',
      url: 'https://example.com/ping',
      headers: ['Accept: text/plain'],
      body: '',
    })
  })
})
