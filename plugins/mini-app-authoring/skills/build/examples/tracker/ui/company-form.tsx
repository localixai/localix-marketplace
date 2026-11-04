import { useId, useState, type FormEvent } from 'react'
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
import { Spinner } from '@localixai/kit/spinner'
import { Textarea } from '@localixai/kit/textarea'
import { WorkbenchNoticeBar } from '@localixai/kit/workbench-notice-bar'
import { companyInputSchema, type CompanyInput } from '../shared/model'
import { FormDialog, errorsByField } from './form-dialog'

type Errors = Partial<Record<keyof CompanyInput, string>>

/** Add a company. (Editing one is the same form with values; left out to keep the example short.) */
export function CompanyDialog({
  open,
  pending,
  serverError,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  pending: boolean
  /** The server's own sentence for a save it refused; shown inside the dialog. */
  serverError: string | null
  onOpenChange: (open: boolean) => void
  /** Resolve `true` when saved (the dialog closes) and `false` when refused (it stays open). */
  onSubmit: (input: CompanyInput) => Promise<boolean>
}) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange}>
      <CompanyForm
        pending={pending}
        serverError={serverError}
        onCancel={() => onOpenChange(false)}
        onSubmit={onSubmit}
      />
    </FormDialog>
  )
}

function CompanyForm({
  pending,
  serverError,
  onCancel,
  onSubmit,
}: {
  pending: boolean
  serverError: string | null
  onCancel: () => void
  onSubmit: (input: CompanyInput) => Promise<boolean>
}) {
  const formId = useId()
  const [values, setValues] = useState({ name: '', website: '', note: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [refused, setRefused] = useState(false)
  const onText = (name: keyof CompanyInput) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [name]: event.target.value }))
    // Editing a field answers its error: it goes away until the next submit.
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const parsed = companyInputSchema.safeParse(values)
    if (!parsed.success) return setErrors(errorsByField<keyof CompanyInput>(parsed.error))
    setErrors({})
    setRefused(!(await onSubmit(parsed.data)))
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>New company</DialogTitle>
        <DialogDescription>Applications belong to a company.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {refused && serverError && (
          <WorkbenchNoticeBar
            tone="error"
            title="The company could not be saved"
            description={serverError}
            className="mb-3 rounded-md"
          />
        )}
        <form
          id={formId}
          noValidate
          aria-busy={pending}
          onSubmit={submit}
          className="flex flex-col gap-3"
        >
          <Field label="Company name" required error={errors.name}>
            <Input data-autofocus value={values.name} maxLength={80} onChange={onText('name')} />
          </Field>
          <Field label="Website" optional error={errors.website}>
            <Input value={values.website} placeholder="acme.com" onChange={onText('website')} />
          </Field>
          <Field label="Note" optional error={errors.note}>
            <Textarea rows={3} value={values.note} onChange={onText('note')} />
          </Field>
        </form>
      </DialogBody>
      <DialogFooter actionsLabel="Company form actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" form={formId} disabled={pending} recommended>
          {pending && <Spinner size="sm" label="Saving" />}
          {pending ? 'Saving…' : 'Add company'}
        </Button>
      </DialogFooter>
    </>
  )
}
