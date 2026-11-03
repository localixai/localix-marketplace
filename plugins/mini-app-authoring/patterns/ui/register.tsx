import { lazy } from 'react'
import { LayoutDashboard } from 'lucide-react'
import { screenUi } from '@localixai/mini-app-sdk/ui/app'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { APP } from '../shared/model'

const App = lazy(() => import('./App').then((module) => ({ default: module.App })))

/**
 * The screen's registration: its tab and its launcher in the rail's overflow. This app has no
 * agent tools; it is a reference screen, so the agent context only says what it is.
 */
export const registerUi = screenUi({
  app: APP,
  title: 'UI patterns',
  label: 'UI patterns — copyable screen patterns built on a sales pipeline',
  keywords: ['ui', 'patterns', 'gallery', 'kit', 'board', 'table', 'dashboard', 'form'],
  Icon: LayoutDashboard,
  Screen: App,
  loading: <LoadingHint>Opening UI patterns…</LoadingHint>,
  agentContext: {
    description:
      'UI patterns: a gallery of seven screen patterns (page shell, board, master-detail, data table, form dialog, dashboard, states) over a small sales pipeline.',
    tools: [],
    nextSteps: [
      'To build a similar screen, read the pattern files under ui/patterns/ in the ui-patterns mini app and copy the one that fits.',
    ],
  },
})
