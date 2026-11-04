import { lazy } from 'react'
import { BarChart3 } from 'lucide-react'
import { screenUi } from '@localixai/mini-app-sdk/ui/app'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { APP } from '../shared/model'

const App = lazy(() => import('./App').then((module) => ({ default: module.App })))

/** The screen's registration: its tab, its launcher and what the agent is told while it is open. */
export const registerUi = screenUi({
  app: APP,
  title: 'Spending',
  label: 'Spending — numbers and charts over your expenses',
  keywords: ['spending', 'budget', 'expenses', 'dashboard'],
  Icon: BarChart3,
  Screen: App,
  loading: <LoadingHint>Opening Spending…</LoadingHint>,
  agentContext: {
    description:
      'Spending: this month against budget, the last six months, each category and what the numbers say.',
    tools: ['example_dashboard_add_expense', 'example_dashboard_report'],
    nextSteps: [
      'When the person says they spent something, call example_dashboard_add_expense.',
      'Answer questions about the numbers from the published context; call example_dashboard_report for a fresh read.',
    ],
  },
})
