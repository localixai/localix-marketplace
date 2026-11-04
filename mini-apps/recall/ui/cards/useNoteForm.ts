import { useEffect, useRef, useState } from 'react'
import type { Note } from '../../shared/model'
import type { NoteDetail, SimilarHit } from '../../shared/payloads'
import { call, useAction, useRead } from '../data'
import { EMPTY_FORM, formOf, sameForm, validate, type FormErrors, type FormState } from './note-form'

/**
 * The editor's state for one card (or a new one): the form, the server's copy it started from,
 * the sentence for each field that fails, and the save. The component is keyed by the card, so a
 * different card starts a fresh form.
 */
export function useNoteForm({
  noteId,
  initial,
  onSaved,
}: {
  noteId: string | null
  initial?: Partial<FormState>
  onSaved: (note: Note, created: boolean) => void
}) {
  const read = useRead('noteGet', { params: { id: noteId ?? '-' } }, noteId !== null)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, ...initial })
  const [base, setBase] = useState<FormState | null>(noteId ? null : { ...EMPTY_FORM, ...initial })
  const [loadedAt, setLoadedAt] = useState<string | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})
  const [fromSave, setFromSave] = useState<SimilarHit[]>([])
  const action = useAction()
  const frontRef = useRef<HTMLTextAreaElement>(null)
  const backRef = useRef<HTMLTextAreaElement>(null)
  const note = read.data?.note ?? null

  // Take the server's copy on load; when it changes later, follow it unless the person has edits.
  useEffect(() => {
    if (!note || note.updatedAt === loadedAt) return
    const fresh = formOf(note)
    if (loadedAt === null || (base && sameForm(form, base))) setForm(fresh)
    setBase(fresh)
    setLoadedAt(note.updatedAt)
  }, [note, loadedAt, base, form])

  const dirty = base !== null && !sameForm(form, base)
  const changedElsewhere = dirty && note !== null && loadedAt !== null && note.updatedAt !== loadedAt

  const set = (patch: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...patch }))
    setErrors((current) => {
      const next = { ...current }
      for (const key of Object.keys(patch)) delete next[key as keyof FormErrors]
      return next
    })
  }

  async function save(): Promise<boolean> {
    const checked = validate(form)
    if (!checked.ok) {
      setErrors(checked.errors)
      const target = checked.errors.front ? frontRef : checked.errors.back ? backRef : null
      queueMicrotask(() => target?.current?.focus())
      return false
    }
    setErrors({})
    const saved = await action.run(() =>
      noteId
        ? call('noteUpdate', { params: { id: noteId }, body: checked.input })
        : call('noteCreate', { body: checked.input }),
    )
    if (!saved) return false
    const fresh = formOf(saved.note)
    setForm(fresh)
    setBase(fresh)
    setLoadedAt(saved.note.updatedAt)
    setFromSave(saved.similar)
    onSaved(saved.note, noteId === null)
    return true
  }

  const detail: NoteDetail | null = read.data
  return {
    form,
    set,
    errors,
    dirty,
    changedElsewhere,
    save,
    saving: action.busy,
    serverError: action.error,
    detail,
    loading: noteId !== null && read.loading,
    loadError: noteId !== null && !read.gone ? read.error : null,
    reload: read.refresh,
    fromSave,
    frontRef,
    backRef,
  }
}
