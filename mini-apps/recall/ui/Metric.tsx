import type { ReactNode } from 'react'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { SectionLabel } from '@localixai/kit/section-label'

/** "2 h 9 min": the numbers at full size, the units small and muted right after them. */
function withUnits(value: string): ReactNode[] {
  return value.split(/([A-Za-z]+)/).map((part, index) =>
    /^[A-Za-z]+$/.test(part) ? (
      <span key={index} className="text-xs font-normal text-text-faint">{part}</span>
    ) : (
      part
    ),
  )
}

/** One figure with its name and a line under it. Units inside the figure are drawn small. */
export function Metric({
  label,
  value,
  hint,
  good,
  title,
}: {
  label: string
  value: string | number
  hint?: string
  good?: boolean
  title?: string
}) {
  return (
    <div title={title} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border-soft px-3 py-2">
      <span className="truncate text-xs text-text-soft">{label}</span>
      <span className="truncate text-2xl font-semibold leading-tight tabular-nums">{withUnits(String(value))}</span>
      {hint && <span className={cn('truncate text-2xs', good ? 'text-status-success' : 'text-text-faint')}>{hint}</span>}
    </div>
  )
}

/** A titled part of a page: the title, then the content, with space and no rules of its own. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <SectionLabel as="h3">{title}</SectionLabel>
      {children}
    </section>
  )
}
