import { expect, test } from 'bun:test'
import { recordingMiniAppUiHost } from '@localixai/mini-app-sdk/ui/testing'
import { registerUi } from './register'

test('registers one restorable tab per chat and its overflow launcher, once per host', () => {
  const { host, registrations } = recordingMiniAppUiHost()
  registerUi(host)
  registerUi(host)
  expect(registrations.workItems).toHaveLength(1)
  expect(registrations.workItems[0]).toMatchObject({
    kind: 'canvas-board:screen',
    restorable: true,
    // The board is the chat's, so each chat gets its own tab (`scope: 'chat'` on `screenUi`).
    scope: 'session',
  })
  expect(registrations.railViewlets).toHaveLength(1)
  expect(registrations.railViewlets[0]).toMatchObject({
    kind: 'canvas-board:screen',
    title: 'Canvas Board',
    defaultArea: 'overflow',
  })
  const second = recordingMiniAppUiHost()
  registerUi(second.host)
  expect(second.registrations.workItems).toHaveLength(1)
})

test('tells the agent which tools change the board', () => {
  const { host, registrations } = recordingMiniAppUiHost()
  registerUi(host)
  expect(registrations.workItems[0]).toMatchObject({
    agentContext: { tools: expect.arrayContaining(['canvas_board_look']) },
  })
})
