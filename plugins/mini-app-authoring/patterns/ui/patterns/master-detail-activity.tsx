import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@localixai/kit/button'
import { EmptyHint } from '@localixai/kit/empty-hint'
import { Field } from '@localixai/kit/field'
import { Input } from '@localixai/kit/input'
import { Select } from '@localixai/kit/select'
import {
  activityInputSchema,
  type Activity,
  type ActivityInput,
  type ActivityKind,
} from '../../shared/model'
import { formatDateTime, formatRelative } from '../format'
import { KIND_ICON, KIND_LABEL, KIND_OPTIONS } from '../stage'

/** The activity half of the master-detail pattern: the timeline and the inline "log" form. */

export function Timeline({ activities, now }: { activities: Activity[]; now: number }) {
  if (activities.length === 0) return <EmptyHint>No activity logged yet.</EmptyHint>
  return (
    <ol aria-label="Activity" className="flex flex-col gap-3">
      {activities.map((activity) => {
        const Icon = KIND_ICON[activity.kind]
        return (
          <li key={activity.id} className="flex gap-2.5">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-text-soft">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2 text-2xs text-text-faint">
                <span className="font-medium text-text-soft">{KIND_LABEL[activity.kind]}</span>
                <time dateTime={activity.at} title={formatDateTime(activity.at)}>
                  {formatRelative(activity.at, now)}
                </time>
              </p>
              <p className="break-words text-xs text-foreground">{activity.note}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The inline form that logs an activity on the selected deal. The shared zod schema is the one
 * validator; its first message for the note is what the person reads. `focusSignal` lets a menu
 * action ("Log activity") put the cursor here.
 */
export function LogActivityForm({
  dealId,
  sending,
  serverError,
  focusSignal,
  onAdd,
}: {
  dealId: string
  sending: boolean
  serverError: string | null
  focusSignal: number
  onAdd: (input: ActivityInput) => Promise<unknown>
}) {
  const [kind, setKind] = useState<ActivityKind>('call')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const noteRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusSignal > 0) noteRef.current?.focus()
  }, [focusSignal])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = activityInputSchema.safeParse({ dealId, kind, note })
    if (!parsed.success) {
      setError(parsed.error.issues[0]!.message)
      noteRef.current?.focus()
      return
    }
    setError(null)
    const saved = await onAdd(parsed.data)
    setFailed(!saved)
    if (saved) setNote('')
  }

  return (
    <form
      noValidate
      aria-label="Log an activity"
      onSubmit={submit}
      className="flex flex-col gap-2 @lg:flex-row @lg:items-start"
    >
      <Field label="Kind" className="@lg:w-36">
        <Select
          value={kind}
          options={KIND_OPTIONS}
          onValueChange={(v) => setKind(v as ActivityKind)}
        />
      </Field>
      <Field
        label="What happened"
        error={error ?? (failed ? serverError : null)}
        className="@lg:flex-1"
      >
        <Input
          ref={noteRef}
          value={note}
          maxLength={500}
          placeholder="Called to confirm the budget"
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <Button type="submit" disabled={sending} className="@lg:mt-[1.375rem]">
        Log activity
      </Button>
    </form>
  )
}
