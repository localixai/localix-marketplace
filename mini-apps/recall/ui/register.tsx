import { lazy, Suspense } from 'react'
import { Layers } from 'lucide-react'
import { screenUi } from '@localixai/mini-app-sdk/ui/app'
import { LoadingHint } from '@localixai/kit/empty-hint'
import type { MiniAppUiHost } from '@localixai/mini-app-sdk/ui'
import { APP } from '../shared/model'

const App = lazy(() => import('./App').then((module) => ({ default: module.App })))
const AnkiFileTab = lazy(() =>
  import('./import/AnkiFileTab').then((module) => ({ default: module.AnkiFileTab })),
)

/**
 * The screen's registration: its tab, its launcher, and what the agent is told while it is open.
 * The screen publishes what it shows (tab, filters, the open card), never the whole collection.
 */
const registerScreen = screenUi({
  app: APP,
  title: 'Recall',
  label: 'Recall — flashcards you study here and the agent makes from your notes',
  keywords: ['flashcards', 'cards', 'study', 'spaced repetition', 'anki', 'decks', 'quiz'],
  Icon: Layers,
  Screen: App,
  loading: <LoadingHint>Opening Recall…</LoadingHint>,
  agentContext: {
    description:
      'Recall: the tab on screen (Today, Cards, Stats or Study), the Cards search and filters, the open or studied card with its id, and the numbers on Stats. Never the whole collection.',
    tools: [
      'recall_overview',
      'recall_find_cards',
      'recall_get_card',
      'recall_add_cards',
      'recall_update_card',
      'recall_next_card',
      'recall_grade_card',
      'recall_review_drafts',
    ],
    nextSteps: [
      '"This card" is the open or studied card in the published context: use its id with recall_get_card or recall_update_card.',
      'New cards from the chat go in as drafts with recall_add_cards; tell the person they can review them on the Today tab.',
      'To explain a missed card, read it with recall_get_card and explain from its back and extra.',
      'For a hard card, offer a rewrite (one fact, a clearer question) with recall_update_card.',
    ],
  },
})

const withFileEditor = new WeakSet<MiniAppUiHost>()

/** Anki files (`.apkg`, `.colpkg`) open in Localix as a look inside with an Import button. */
const ANKI_FILE = /\.(apkg|colpkg)$/i

/**
 * The screen, and the editor for Anki files. The host may call this again on a reload, so each
 * registers once per host.
 */
export function registerUi(host: MiniAppUiHost): void {
  registerScreen(host)
  if (withFileEditor.has(host)) return
  withFileEditor.add(host)
  host.fileEditors.register({
    id: 'recall:anki-file',
    label: 'Anki deck',
    match: (path) => ANKI_FILE.test(path),
    Component: (props) => (
      <Suspense fallback={<LoadingHint>Opening the Anki file…</LoadingHint>}>
        <AnkiFileTab {...props} />
      </Suspense>
    ),
  })
}
