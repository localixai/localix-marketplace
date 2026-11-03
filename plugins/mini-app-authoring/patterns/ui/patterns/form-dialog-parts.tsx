import { useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@localixai/kit/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
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
import { CURRENCIES, OWNERS, dealInputSchema, type Deal, type DealInput } from '../../shared/model'
import { STAGE_OPTIONS } from '../stage'

/**
 * The add-and-edit dialog, shared by the form-dialog and data-table patterns. One component, two
 * modes: `deal` set means edit and every field starts pre-filled; `null` means add.
 */

const FIELDS = [
  'title',
  'company',
  'owner',
  'amount',
  'currency',
  'stage',
  'closeDate',
  'note',
] as const
type FieldName = (typeof FIELDS)[number]
type Errors = Partial<Record<FieldName, string>>

const OWNER_OPTIONS: SelectOption[] = OWNERS.map((owner) => ({ value: owner, label: owner }))
const CURRENCY_OPTIONS: SelectOption[] = CURRENCIES.map((code) => ({ value: code, label: code }))

export function DealFormDialog({
  open,
  deal,
  pending,
  serverError,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  /** The deal being edited, or `null` to add one. */
  deal: Deal | null
  /** A save is in flight: the submit button is busy and the form cannot be sent twice. */
  pending: boolean
  /** The server's own sentence for a save it refused; shown inside the dialog. */
  serverError: string | null
  onOpenChange: (open: boolean) => void
  /** Resolve `true` when saved (the dialog closes) and `false` when refused (it stays open). */
  onSubmit: (input: DealInput) => Promise<boolean>
}) {
  const content = useRef<HTMLDivElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Content unmounts on close, so `DealForm` starts fresh (and pre-filled) on every open. */}
      <DialogContent
        ref={content}
        size="lg"
        // Open on the first field, not on the close button: the field marked `data-autofocus`.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          content.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
        }}
      >
        <DealForm
          deal={deal}
          pending={pending}
          serverError={serverError}
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}

function DealForm({
  deal,
  pending,
  serverError,
  onCancel,
  onSubmit,
}: {
  deal: Deal | null
  pending: boolean
  serverError: string | null
  onCancel: () => void
  onSubmit: (input: DealInput) => Promise<boolean>
}) {
  const formId = useId()
  const [values, setValues] = useState({
    title: deal?.title ?? '',
    company: deal?.company ?? '',
    owner: deal?.owner ?? '',
    amount: deal ? String(deal.amount) : '',
    currency: deal?.currency ?? 'USD',
    stage: deal?.stage ?? 'lead',
    closeDate: deal?.closeDate ?? '',
    note: deal?.note ?? '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [refused, setRefused] = useState(false)
  const refs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({})
  const ref = (name: FieldName) => (element: HTMLElement | null) =>
    void (refs.current[name] = element)

  const set = (name: FieldName) => (value: string) => {
    setValues((current) => ({ ...current, [name]: value }))
    // Editing a field answers its error: it goes away until the next submit.
    setErrors((current) => ({ ...current, [name]: undefined }))
  }
  const onText = (name: FieldName) => (event: { target: { value: string } }) =>
    set(name)(event.target.value)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const parsed = dealInputSchema.safeParse({
      ...values,
      amount: values.amount.trim() === '' ? Number.NaN : Number(values.amount),
      // An emptied date clears an existing one (`null`); on add there is nothing to clear.
      closeDate: values.closeDate || (deal?.closeDate ? null : undefined),
    })
    if (!parsed.success) {
      // The shared schema is the one validator: its sentence per field, the first one wins.
      const found: Errors = {}
      for (const issue of parsed.error.issues) {
        const name = issue.path[0] as FieldName
        found[name] ??= issue.message
      }
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
        <DialogTitle>{deal ? 'Edit deal' : 'New deal'}</DialogTitle>
        <DialogDescription>
          {deal ? `Change the details of ${deal.title}.` : 'Add a deal to the pipeline.'}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="@container">
        {refused && serverError && (
          <WorkbenchNoticeBar
            tone="error"
            title="The deal could not be saved"
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
          <Field label="Deal name" required error={errors.title} className="@md:col-span-2">
            <Input
              data-autofocus
              ref={ref('title')}
              value={values.title}
              onChange={onText('title')}
              maxLength={120}
            />
          </Field>
          <Field label="Company" required error={errors.company}>
            <Input ref={ref('company')} value={values.company} onChange={onText('company')} />
          </Field>
          <Field label="Owner" required error={errors.owner}>
            <Select
              ref={ref('owner')}
              value={values.owner}
              options={OWNER_OPTIONS}
              placeholder="Pick an owner"
              onValueChange={set('owner')}
            />
          </Field>
          <Field label="Amount" required error={errors.amount}>
            <Input
              ref={ref('amount')}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={values.amount}
              onChange={onText('amount')}
              className="tabular-nums"
            />
          </Field>
          <Field label="Currency" error={errors.currency}>
            <Select
              ref={ref('currency')}
              value={values.currency}
              options={CURRENCY_OPTIONS}
              onValueChange={set('currency')}
            />
          </Field>
          <Field label="Stage" error={errors.stage}>
            <Select
              ref={ref('stage')}
              value={values.stage}
              options={STAGE_OPTIONS}
              onValueChange={set('stage')}
            />
          </Field>
          <Field label="Expected close" optional error={errors.closeDate}>
            <Input
              ref={ref('closeDate')}
              type="date"
              value={values.closeDate}
              onChange={onText('closeDate')}
            />
          </Field>
          <Field label="Note" optional error={errors.note} className="@md:col-span-2">
            <Textarea
              ref={ref('note')}
              rows={3}
              value={values.note}
              onChange={onText('note')}
              placeholder="Context for the next person who opens this deal"
            />
          </Field>
        </form>
      </DialogBody>
      <DialogFooter actionsLabel="Deal form actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form={formId} disabled={pending} recommended>
          {pending && <Spinner size="sm" label="Saving" />}
          {pending ? 'Saving…' : deal ? 'Save changes' : 'Add deal'}
        </Button>
      </DialogFooter>
    </>
  )
}
