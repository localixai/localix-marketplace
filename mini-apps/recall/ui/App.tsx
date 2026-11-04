import { useCallback, useMemo, useState } from 'react'
import { Upload } from 'lucide-react'
import { useAgentContext, useScreenProblem, type ScreenProps } from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { useNow } from '@localixai/mini-app-sdk/ui/now'
import { loadJSON, saveJSON } from '@localixai/mini-app-sdk/ui/storage'
import { IconButton } from '@localixai/kit/icon-button'
import { PanelHeader } from '@localixai/kit/panel-header'
import { TabBar, TabPanel, useTabPanelIds } from '@localixai/kit/tabs'
import { countOf } from '../shared/format'
import { APP } from '../shared/model'
import { CardsTab } from './cards/CardsTab'
import { useCardsState } from './cards/useCardsState'
import { DataProvider, useRead } from './data'
import { ExportMenu } from './import/ExportMenu'
import { ImportDialog } from './import/ImportDialog'
import { Select, type SelectOption } from '@localixai/kit/select'
import { INBOX } from '../shared/model'
import { TABS, type StudyTarget, type Tab } from './nav'
import './recall.css'
import { ContextProvider } from './screen-context'
import { SettingsTab } from './settings/SettingsTab'
import { StatsTab } from './stats/StatsTab'
import { StudyView } from './study/StudyView'
import { TodayTab } from './today/TodayTab'

const LABEL: Record<Tab, string> = { today: 'Today', cards: 'Cards', stats: 'Stats', settings: 'Settings' }
/** One page spacing for every tab: the same side padding and the same rhythm between sections. */
const PAGE = 'min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin @2xl:px-6 @2xl:py-5'
const TAB_KEY = `${APP}.tab`

/** The screen: it mounts the data provider (one revision, every read follows it) and the shell. */
export function App({ active, publishMessageContext }: ScreenProps) {
  return (
    <DataProvider active={active}>
      <Shell active={active} publish={publishMessageContext} />
    </DataProvider>
  )
}

function Shell({ active, publish }: { active: boolean; publish: ScreenProps['publishMessageContext'] }) {
  const today = useRead('today')
  const decks = useRead('decks')
  const settings = useRead('settings')
  const now = useNow(60_000, active)
  const ids = useTabPanelIds(APP)
  const cards = useCardsState()
  const [tab, setTab] = useState<Tab>(() => {
    const saved = loadJSON<Tab>(TAB_KEY)
    return saved && TABS.includes(saved) ? saved : 'today'
  })
  const [study, setStudy] = useState<{ target: StudyTarget | null } | null>(null)
  const [dialog, setDialog] = useState<'import' | null>(null)
  const [statsDeck, setStatsDeck] = useState('all')
  const [parts, setParts] = useState<Record<string, string>>({})

  const report = useCallback((id: string, text: string | null) => {
    setParts((current) => {
      if ((current[id] ?? null) === text) return current
      const next = { ...current }
      if (text === null) delete next[id]
      else next[id] = text
      return next
    })
  }, [])
  const where = study ? 'Study' : LABEL[tab]
  useAgentContext(
    publish,
    active,
    useMemo(
      () => ({
        label: 'Recall',
        content: [`Recall is open on the ${where} tab.`, ...Object.values(parts)].join('\n'),
      }),
      [where, parts],
    ),
  )
  const problem = useScreenProblem({
    app: APP,
    subject: 'Recall',
    failure: today.data ? (decks.error ?? today.error) : null,
    showingData: today.data !== null,
  })

  const go = (next: Tab) => {
    setTab(next)
    saveJSON(TAB_KEY, next)
  }
  const showCards = (preset: { deck?: string; state?: string }) => {
    cards.show(preset)
    go('cards')
  }
  const due = today.data?.due.total ?? 0
  const deckList = decks.data?.decks ?? []
  const deckOptions: SelectOption[] = [
    { value: 'all', label: 'All decks' },
    { value: INBOX, label: 'Inbox' },
    ...deckList.map((d) => ({ value: d.id, label: d.name })),
  ]

  if (study) {
    return (
      <ContextProvider report={report}>
        <StudyView target={study.target} now={now} onExit={() => setStudy(null)} />
      </ContextProvider>
    )
  }
  const panel = (id: Tab, children: React.ReactNode, scroll = true) => (
    <TabPanel
      id={ids.panelId(id)}
      aria-labelledby={ids.tabId(id)}
      active={tab === id}
      className={scroll ? PAGE : 'flex min-h-0 flex-1 flex-col'}
    >
      {tab === id ? children : null}
    </TabPanel>
  )
  return (
    <ContextProvider report={report}>
      <div className="@container flex h-full min-h-0 flex-col">
        <PanelHeader
          tone="content"
          title="Recall"
          summary={
            today.data
              ? `${due} to study · ${countOf(today.data.totals.notes, 'card')}`
              : 'Loading…'
          }
          actionsLabel="Recall actions"
          actions={
            <>
              <IconButton aria-label="Import cards" tooltip="Import" size="sm" onClick={() => setDialog('import')}>
                <Upload />
              </IconButton>
              <ExportMenu />
            </>
          }
        />
        {problem && <ProblemLine {...problem} />}
        <TabBar
          aria-label="Recall sections"
          active={tab}
          onChange={go}
          trailing={
            tab === 'stats' ? (
              <div className="pr-3 @2xl:pr-5">
                <Select aria-label="Deck for the numbers" size="md" value={statsDeck} options={deckOptions} onValueChange={setStatsDeck} />
              </div>
            ) : undefined
          }
          items={TABS.map((id) => ({
            id,
            label: LABEL[id],
            badge: id === 'today' && due > 0 ? due : undefined,
            ...ids.item(id),
          }))}
        />
        {panel(
          'today',
          <TodayTab
            today={today}
            now={now}
            actions={{
              onStudy: (target) => setStudy({ target }),
              onShowCards: showCards,
              onNewCard: () => {
                cards.newCard()
                go('cards')
              },
              onImport: () => setDialog('import'),
            }}
          />,
        )}
        {panel(
          'cards',
          <CardsTab
            state={cards}
            decks={deckList}
            suggest={settings.data?.settings.suggestPlacement ?? false}
            now={now}
            active={active}
            onImport={() => setDialog('import')}
          />,
          false,
        )}
        {panel(
          'stats',
          <StatsTab
            deck={statsDeck}
            onShowCards={showCards}
            onOpenCard={(id) => {
              cards.show({})
              cards.openNote(id)
              go('cards')
            }}
          />,
        )}
        {panel('settings', <SettingsTab />)}
        <ImportDialog open={dialog === 'import'} onClose={() => setDialog(null)} onOpenCards={showCards} />
      </div>
    </ContextProvider>
  )
}
