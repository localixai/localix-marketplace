import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Columns3,
  FormInput,
  LayoutPanelTop,
  PanelLeft,
  Table2,
  TriangleAlert,
} from 'lucide-react'

/** The gallery's table of contents: one entry per pattern, in the order the tabs show them. */
export const PATTERN_IDS = [
  'page-shell',
  'board',
  'master-detail',
  'data-table',
  'form-dialog',
  'dashboard',
  'states',
] as const
export type PatternId = (typeof PATTERN_IDS)[number]

export interface PatternInfo {
  label: string
  icon: LucideIcon
  /** The files to copy, relative to `ui/patterns/`. */
  files: string
  /** One line: what it is for. */
  summary: string
}

export const PATTERNS: Record<PatternId, PatternInfo> = {
  'page-shell': {
    label: 'Page shell',
    icon: LayoutPanelTop,
    files: 'page-shell.tsx',
    summary: 'The frame of a real screen: fixed header, toolbar and tabs over one scrolling body.',
  },
  board: {
    label: 'Board',
    icon: Columns3,
    files: 'board.tsx, board-parts.tsx',
    summary: 'A kanban by stage: drag, Alt+Arrow or a menu moves a card.',
  },
  'master-detail': {
    label: 'Master-detail',
    icon: PanelLeft,
    files: 'master-detail.tsx, master-detail-parts.tsx, master-detail-activity.tsx',
    summary: 'A keyboard-walkable list beside a resizable detail pane with a timeline.',
  },
  'data-table': {
    label: 'Data table',
    icon: Table2,
    files: 'data-table.tsx, data-table-parts.tsx, form-dialog-parts.tsx',
    summary: 'Sort, select, bulk delete behind a confirmation, and an edit dialog per row.',
  },
  'form-dialog': {
    label: 'Form dialog',
    icon: FormInput,
    files: 'form-dialog.tsx, form-dialog-parts.tsx',
    summary: 'Add and edit in one dialog, validated by the shared schema.',
  },
  dashboard: {
    label: 'Dashboard',
    icon: BarChart3,
    files: 'dashboard.tsx, dashboard-parts.tsx',
    summary: 'KPI cards, a distribution, a trend, targets and insights from one route.',
  },
  states: {
    label: 'States',
    icon: TriangleAlert,
    files: 'states.tsx, states-parts.tsx',
    summary: 'Loading, empty, filtered, error and a transient notice, each drawn on purpose.',
  },
}
