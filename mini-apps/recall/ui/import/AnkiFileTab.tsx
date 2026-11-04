import { useState } from 'react'
import { FileWarning } from 'lucide-react'
import type { FileEditorProps } from '@localixai/mini-app-sdk/ui'
import { useAgentContext } from '@localixai/mini-app-sdk/ui/app'
import { miniAppWorkspace } from '@localixai/mini-app-sdk/ui/runtime'
import { Button } from '@localixai/kit/button'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { Spinner } from '@localixai/kit/spinner'
import { StateNotice } from '@localixai/kit/state-notice'
import { APP } from '../../shared/model'
import type { ImportResult } from '../../shared/payloads-more'
import { DataProvider, useRead } from '../data'
import '../recall.css'
import { requestLaunch } from '../launch'
import { AnkiOptions, DEFAULT_CHOICE, FILE_DECKS, type AnkiChoice } from './AnkiOptions'
import { AnkiPreview } from './AnkiPreview'
import { AnkiResult } from './AnkiResult'
import { agentTextFor, cardsWord, commitBody, importCount, titleOf } from './ankiText'
import { useAnkiFile } from './useAnkiFile'

/** The screen's work item: its kind and id are the same (`screenUi` registers `<app>:screen`). */
const SCREEN = `${APP}:screen`

function openRecall(launch: Parameters<typeof requestLaunch>[0]) {
  requestLaunch(launch)
  miniAppWorkspace.openWorkItem({ workKind: SCREEN, id: SCREEN, title: 'Recall', scope: null })
}

/**
 * An `.apkg` or `.colpkg` open in Localix: what is inside, where the cards would go, and an Import
 * button. Reading it stores nothing; the sounds and pictures are stored when the person imports.
 */
export function AnkiFileTab(props: FileEditorProps) {
  return (
    <DataProvider active>
      <Body {...props} />
    </DataProvider>
  )
}

function Body({ path, publishMessageContext }: FileEditorProps) {
  const { state, run } = useAnkiFile(path)
  const decks = useRead('decks')
  const [choice, setChoice] = useState<AnkiChoice>(DEFAULT_CHOICE)
  const preview = 'preview' in state ? state.preview : null

  useAgentContext(
    publishMessageContext,
    true,
    state.step === 'error'
      ? {
          label: 'Anki deck',
          content: `An Anki file is open but could not be used: ${state.message} File: ${path}.`,
        }
      : state.step === 'done'
        ? {
            label: 'Anki deck',
            content: `The Anki deck ${titleOf(state.preview)} was imported into Recall (${cardsWord(state.result.added)}).`,
          }
        : preview
          ? { label: 'Anki deck', content: agentTextFor(path, preview) }
          : null,
  )

  const open = (result: ImportResult) =>
    openRecall({
      show: 'cards',
      preset: {
        deck: result.decks.length === 1 ? result.decks[0]!.id : undefined,
        state: result.status === 'draft' ? 'draft' : undefined,
      },
    })
  const study = (result: ImportResult) => {
    const label = result.decks.length === 1 ? result.decks[0]!.name : 'Imported cards'
    openRecall({ show: 'study', target: { deckIds: result.decks.map((deck) => deck.id), label } })
  }

  let body
  if (state.step === 'reading') {
    body = <LoadingHint>Reading the Anki file…</LoadingHint>
  } else if (state.step === 'error') {
    body = (
      <StateNotice
        role="alert"
        icon={FileWarning}
        title={state.title}
        body={state.message}
        actions={<Button onClick={state.retry}>Try again</Button>}
      />
    )
  } else if (state.step === 'importing') {
    body = (
      <p aria-label="Importing" role="status" className="flex items-center gap-3 py-6 text-sm">
        <Spinner label="Importing" />
        {state.preview.sounds > 0
          ? 'Importing… a deck with sound can take a minute'
          : 'Importing… this can take a moment'}
      </p>
    )
  } else if (state.step === 'done') {
    body = (
      <AnkiResult
        result={state.result}
        onOpen={() => open(state.result)}
        onStudy={
          state.result.status === 'active' && state.result.added > 0
            ? () => study(state.result)
            : null
        }
      />
    )
  } else {
    body = (
      <>
        <AnkiPreview preview={state.preview} />
        <AnkiOptions
          preview={state.preview}
          decks={decks.data?.decks ?? []}
          choice={choice}
          onChange={(patch) => setChoice((current) => ({ ...current, ...patch }))}
        />
      </>
    )
  }

  const count =
    state.step === 'ready'
      ? importCount(state.preview, choice.skipDuplicates || state.preview.duplicates === 0)
      : 0
  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 scrollbar-thin @2xl:px-8">
        <div className="flex w-full flex-col gap-6">{body}</div>
      </div>
      {state.step === 'ready' && (
        <div className="flex shrink-0 justify-end border-t border-border-soft px-4 py-3 @2xl:px-8">
          <Button
            variant="mono"
            disabled={count === 0}
            onClick={() =>
              void run(state.preview, commitBody(path, state.preview, choice, FILE_DECKS))
            }
          >
            {count === 0 ? 'Nothing new to import' : `Import ${cardsWord(count)}`}
          </Button>
        </div>
      )}
    </div>
  )
}
