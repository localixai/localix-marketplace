import { useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@localixai/kit/button'
import {
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@localixai/kit/dialog'
import { Field } from '@localixai/kit/field'
import { Input } from '@localixai/kit/input'
import { Select, type SelectOption } from '@localixai/kit/select'
import { Spinner } from '@localixai/kit/spinner'
import { Textarea } from '@localixai/kit/textarea'
import { WorkbenchNoticeBar } from '@localixai/kit/workbench-notice-bar'
import {
  applicationInputSchema,
  type Application,
  type ApplicationInput,
  type Company,
} from '../shared/model'
import { FormDialog, errorsByField } from './form-dialog'
import { STATUS_OPTIONS } from './status'

/**
 * The add-and-edit dialog for an application. One component, two modes: `application` set means
 * edit and every field starts pre-filled; `null` means add. The form keeps its fields as strings
 * (what an input holds) and turns them into the shared schema's shape on submit.
 */

// In the order the form reads: focus goes to the first invalid one.
const FIELDS = ['role', 'companyId', 'status', 'salary', 'appliedOn', 'note'] as const
type FieldName = (typeof FIELDS)[number]
type Errors = Partial<Record<FieldName, string>>

export function ApplicationDialog({
  open,
  application,
  companies,
  pending,
  serverError,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  /** The application being edited, or `null` to add one. */
  application: Application | null
  companies: readonly Company[]
  /** A save is in flight: the submit button is busy and the form cannot be sent twice. */
  pending: boolean
  serverError: string | null
  onOpenChange: (open: boolean) => void
  /** Resolve `true` when saved (the dialog closes) and `false` when refused (it stays open). */
  onSubmit: (input: ApplicationInput) => Promise<boolean>
}) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange}>
      <ApplicationForm
        application={application}
        companies={companies}
        pending={pending}
        serverError={serverError}
        onCancel={() => onOpenChange(false)}
        onSubmit={onSubmit}
      />
    </FormDialog>
  )
}

function ApplicationForm({
  application,
  companies,
  pending,
  serverError,
  onCancel,
  onSubmit,
}: {
  application: Application | null
  companies: readonly Company[]
  pending: boolean
  serverError: string | null
  onCancel: () => void
  onSubmit: (input: ApplicationInput) => Promise<boolean>
}) {
  const formId = useId()
  const [values, setValues] = useState({
    companyId: application?.companyId ?? '',
    role: application?.role ?? '',
    status: application?.status ?? 'wishlist',
    salary: application?.salary ? String(application.salary) : '',
    appliedOn: application?.appliedOn ?? '',
    note: application?.note ?? '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [refused, setRefused] = useState(false)
  const refs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({})
  const ref = (name: FieldName) => (element: HTMLElement | null) =>
    void (refs.current[name] = element)
  const companyOptions: SelectOption[] = companies.map((c) => ({ value: c.id, label: c.name }))

  const set = (name: FieldName) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }
  const onText = (name: FieldName) => (event: { target: { value: string } }) =>
    set(name)(event.target.value)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    // An emptied optional field clears an existing value (`null`); on add there is nothing to clear.
    const cleared = (had: unknown) => (had ? null : undefined)
    const parsed = applicationInputSchema.safeParse({
      ...values,
      salary: values.salary.trim() === '' ? cleared(application?.salary) : Number(values.salary),
      appliedOn: values.appliedOn || cleared(application?.appliedOn),
    })
    if (!parsed.success) {
      const found = errorsByField<FieldName>(parsed.error)
      setErrors(found)
      // Move focus to the first invalid field, in the order the form reads.
      refs.current[FIELDS.find((name) => found[name])!]?.focus()
      return
    }
    setErrors({})
    setRefused(!(await onSubmit(parsed.data)))
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{application ? 'Edit application' : 'New application'}</DialogTitle>
        <DialogDescription>
          {application
            ? `Change the details of ${application.role}.`
            : 'Track a job you are going for.'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="@container">
        {refused && serverError && (
          <WorkbenchNoticeBar
            tone="error"
            title="The application could not be saved"
            description={serverError}
            className="mb-3 rounded-md"
          />
        )}
        <form
          id={formId}
          noValidate
          aria-busy={pending}
          onSubmit={submit}
          className="grid grid-cols-1 gap-x-3 gap-y-3 @md:grid-cols-2"
        >
          <Field label="Role" required error={errors.role} className="@md:col-span-2">
            <Input
              data-autofocus
              ref={ref('role')}
              value={values.role}
              maxLength={120}
              onChange={onText('role')}
            />
          </Field>
          <Field label="Company" required error={errors.companyId}>
            <Select
              ref={ref('companyId')}
              value={values.companyId}
              options={companyOptions}
              placeholder="Pick a company"
              onValueChange={set('companyId')}
            />
          </Field>
          <Field label="Status" error={errors.status}>
            <Select
              ref={ref('status')}
              value={values.status}
              options={STATUS_OPTIONS}
              onValueChange={set('status')}
            />
          </Field>
          <Field label="Yearly pay (USD)" optional error={errors.salary}>
            <Input
              ref={ref('salary')}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={values.salary}
              onChange={onText('salary')}
              className="tabular-nums"
            />
          </Field>
          <Field label="Applied on" optional error={errors.appliedOn}>
            <Input
              ref={ref('appliedOn')}
              type="date"
              value={values.appliedOn}
              onChange={onText('appliedOn')}
            />
          </Field>
          <Field label="Note" optional error={errors.note} className="@md:col-span-2">
            <Textarea ref={ref('note')} rows={3} value={values.note} onChange={onText('note')} />
          </Field>
        </form>
      </DialogBody>
      <DialogFooter actionsLabel="Application form actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form={formId} disabled={pending} recommended>
          {pending && <Spinner size="sm" label="Saving" />}
          {pending ? 'Saving…' : application ? 'Save changes' : 'Add application'}
        </Button>
      </DialogFooter>
    </>
  )
}
