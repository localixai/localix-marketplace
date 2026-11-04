import { expect, test } from 'bun:test'
import type { FileEditorContribution } from '@localixai/mini-app-sdk/ui'
import { recordingMiniAppUiHost } from '@localixai/mini-app-sdk/ui/testing'
import { registerUi } from './register'

test('registers one restorable screen and its overflow launcher per host', () => {
  const { host, registrations } = recordingMiniAppUiHost()
  registerUi(host)
  registerUi(host)
  expect(registrations.workItems).toHaveLength(1)
  expect(registrations.workItems[0]).toMatchObject({
    kind: 'recall:screen',
    restorable: true,
    scope: 'global',
  })
  expect(registrations.railViewlets).toHaveLength(1)
  expect(registrations.railViewlets[0]).toMatchObject({
    kind: 'recall:screen',
    title: 'Recall',
    defaultArea: 'overflow',
  })
  const second = recordingMiniAppUiHost()
  registerUi(second.host)
  expect(second.registrations.workItems).toHaveLength(1)
})

test('opens Anki files with its own file editor, once per host, and nothing else', () => {
  const { host, registrations } = recordingMiniAppUiHost()
  registerUi(host)
  registerUi(host)
  const editors = registrations.fileEditors as FileEditorContribution[]
  expect(editors).toHaveLength(1)
  expect(editors[0]).toMatchObject({ id: 'recall:anki-file', label: 'Anki deck' })
  const match = editors[0]!.match
  expect(match('/Users/me/Downloads/Learning_Greek.apkg')).toBe(true)
  expect(match('/backups/collection.COLPKG')).toBe(true)
  expect(match('C:\\decks\\words.apkg')).toBe(true)
  for (const other of ['/a/b.zip', '/a/b.apkg.txt', '/a/apkg', '/a/b.csv', '/a/notes.md', '/a/b.sqlite']) {
    expect(match(other)).toBe(false)
  }
  const second = recordingMiniAppUiHost()
  registerUi(second.host)
  expect(second.registrations.fileEditors).toHaveLength(1)
})
