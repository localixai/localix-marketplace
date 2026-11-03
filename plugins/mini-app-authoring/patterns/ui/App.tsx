import { useState } from 'react'
import type { ScreenProps } from '@localixai/mini-app-sdk/ui/app'
import { TabBar, TabPanel, useTabPanelIds } from '@localixai/kit/tabs'
import { PATTERNS, PATTERN_IDS, type PatternId } from './gallery'
import { Board } from './patterns/board'
import { Dashboard } from './patterns/dashboard'
import { DataTable } from './patterns/data-table'
import { FormDialog } from './patterns/form-dialog'
import { MasterDetail } from './patterns/master-detail'
import { PageShell } from './patterns/page-shell'
import { States } from './patterns/states'

/**
 * The gallery: one tab per pattern, and the panel fills the rest of the pane. Only the current
 * pattern is mounted, so a hidden one reads nothing and holds no state.
 *
 * The fill chain starts here: `flex h-full min-h-0 flex-col` on the root, `min-h-0 flex-1` on the
 * panel, and each pattern keeps it going down to its own scrolling body.
 */
export function App({ active }: ScreenProps) {
  const [current, setCurrent] = useState<PatternId>('page-shell')
  const ids = useTabPanelIds('ui-patterns')
  const info = PATTERNS[current]
  const newDeal = () => setCurrent('form-dialog')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabBar
        aria-label="UI patterns"
        active={current}
        onChange={setCurrent}
        items={PATTERN_IDS.map((id) => ({
          id,
          label: PATTERNS[id].label,
          icon: PATTERNS[id].icon,
          ...ids.item(id),
        }))}
      />
      <p
        className="shrink-0 truncate border-b border-border-soft px-3 py-1.5 text-2xs text-text-faint"
        title={`${info.summary} Copy: ${info.files}`}
      >
        {info.summary} <span className="text-text-soft">Copy: {info.files}</span>
      </p>
      <TabPanel
        id={ids.panelId(current)}
        aria-labelledby={ids.tabId(current)}
        active
        className="min-h-0 flex-1"
      >
        {current === 'page-shell' && <PageShell active={active} onNewDeal={newDeal} />}
        {current === 'board' && <Board active={active} />}
        {current === 'master-detail' && <MasterDetail active={active} />}
        {current === 'data-table' && <DataTable active={active} />}
        {current === 'form-dialog' && <FormDialog active={active} />}
        {current === 'dashboard' && <Dashboard active={active} />}
        {current === 'states' && <States active={active} onNewDeal={newDeal} />}
      </TabPanel>
    </div>
  )
}
