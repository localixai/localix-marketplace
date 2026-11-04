import { useRef, type ReactNode } from 'react'
import type { ZodError } from 'zod'
import { Dialog, DialogContent } from '@localixai/kit/dialog'

/**
 * The frame both forms share: a dialog that opens on its first field (the one marked
 * `data-autofocus`) instead of the close button. The content unmounts on close, so a form inside
 * starts fresh (and pre-filled when editing) on every open. Escape and the backdrop close it, and
 * focus goes back to the button that opened it.
 */
export function FormDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const content = useRef<HTMLDivElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={content}
        size="lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          content.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
        }}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The shared zod schema is the one validator: its sentence per field, the first one wins. Returns
 * the sentences by field name, in the order the schema reported them.
 */
export function errorsByField<Name extends string>(error: ZodError): Partial<Record<Name, string>> {
  const found: Partial<Record<Name, string>> = {}
  for (const issue of error.issues) {
    const name = issue.path[0] as Name
    found[name] ??= issue.message
  }
  return found
}
