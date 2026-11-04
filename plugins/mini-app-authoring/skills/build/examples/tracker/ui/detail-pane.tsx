import { ArrowLeft, Building2, Pencil } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { Chip } from '@localixai/kit/chip'
import { DetailField } from '@localixai/kit/detail-field'
import { IconButton } from '@localixai/kit/icon-button'
import { SectionLabel } from '@localixai/kit/section-label'
import type { Application, Company } from '../shared/model'
import { countOf } from '../shared/report'
import { formatDate, formatDateTime, formatMoney, formatRelative, orDash } from './format'
import { STATUS_ICON, STATUS_LABEL, STATUS_TONE } from './status'

/**
 * The detail pane of the master-detail view: what the selected application is, its timeline, and
 * its company. It reads the application it is given and nothing else, so when the application is
 * deleted elsewhere the parent stops rendering it (selection is an id, looked up each render).
 */
export function DetailPane({
  application,
  company,
  siblings,
  now,
  onBack,
  onEdit,
  onRemoveCompany,
}: {
  application: Application
  company: Company | null
  /** How many applications the company has in all, this one included. */
  siblings: number
  now: number
  onBack: () => void
  onEdit: () => void
  onRemoveCompany: () => void
}) {
  return (
    <section
      aria-label={`Application: ${application.role}`}
      className="@container flex min-h-0 flex-1 flex-col"
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-border-soft px-4 py-3">
        <IconButton
          aria-label="Back to the list"
          tooltip="Back to the list"
          className="-ml-2 @2xl:hidden"
          onClick={onBack}
        >
          <ArrowLeft />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground" title={application.role}>
            {application.role}
          </h2>
          <p className="truncate text-xs text-text-faint">{company?.name ?? orDash(null)}</p>
        </div>
        <Chip tone={STATUS_TONE[application.status]}>{STATUS_LABEL[application.status]}</Chip>
        <Button size="sm" variant="field" onClick={onEdit}>
          <Pencil data-icon="inline-start" />
          Edit
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4 scrollbar-thin">
        <div className="flex flex-col gap-2">
          <SectionLabel as="h3">Details</SectionLabel>
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs @lg:grid-cols-2">
            <DetailField label="Yearly pay" value={formatMoney(application.salary)} />
            <DetailField label="Applied" value={formatDate(application.appliedOn)} />
            <DetailField label="Added" value={formatDate(application.createdAt)} />
            {/* DetailField truncates to one line: right for a date, wrong for a note. Free text
                gets the whole row and wraps. */}
            <p className="text-xs @lg:col-span-2">
              <span className="text-text-faint">Note: </span>
              <span className="whitespace-pre-wrap break-words">{orDash(application.note)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <SectionLabel as="h3">Timeline · {application.history.length}</SectionLabel>
          <Timeline application={application} now={now} />
        </div>
        <div className="flex flex-col gap-2">
          <SectionLabel as="h3">Company</SectionLabel>
          <div className="flex items-center gap-3 text-xs">
            <Building2 className="size-4 shrink-0 text-text-faint" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">
                {company?.name ?? orDash(null)}
              </p>
              <p className="truncate text-text-faint">
                {countOf(siblings, 'application')}
                {company?.website ? ` · ${company.website}` : ''}
              </p>
            </div>
            {company && (
              <Button size="sm" variant="ghost" onClick={onRemoveCompany}>
                Remove company…
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Newest first: each step the application took, with the day and the status it moved to. */
function Timeline({ application, now }: { application: Application; now: number }) {
  return (
    <ol aria-label="Timeline" className="flex flex-col gap-3">
      {[...application.history].reverse().map((entry) => {
        const Icon = STATUS_ICON[entry.status]
        return (
          <li key={`${entry.at}-${entry.status}`} className="flex gap-2.5">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-text-soft">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground">{STATUS_LABEL[entry.status]}</p>
              <time
                dateTime={entry.at}
                title={formatDateTime(entry.at)}
                className="text-2xs text-text-faint"
              >
                {formatRelative(entry.at, now)}
              </time>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
