import { lazy } from 'react'
import { Briefcase } from 'lucide-react'
import { screenUi } from '@localixai/mini-app-sdk/ui/app'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { APP } from '../shared/model'

// Loaded when the tab first opens, so the host starts without the whole screen.
const App = lazy(() => import('./App').then((module) => ({ default: module.App })))

/**
 * The screen's registration: its tab, its launcher in the rail's overflow, and what the agent is
 * told while it is open. `scope: 'chat'` would give every chat its own tab (for a chat collection).
 */
export const registerUi = screenUi({
  app: APP,
  title: 'Job search',
  label: 'Job search: companies and applications the agent and you keep together',
  keywords: ['jobs', 'applications', 'tracker', 'companies'],
  Icon: Briefcase,
  Screen: App,
  loading: <LoadingHint>Opening Job search…</LoadingHint>,
  agentContext: {
    description:
      'Job search: the counts per status and every application with its company, status and id.',
    tools: [
      'example_tracker_add_application',
      'example_tracker_update_application',
      'example_tracker_remove_company',
      'example_tracker_find',
      'example_tracker_report',
    ],
    nextSteps: [
      'When the person says they applied, heard back or were turned down, call the matching tool with the id from the published list.',
      'Answer questions about the search from the published context; call example_tracker_report for a fresh read.',
    ],
  },
})
