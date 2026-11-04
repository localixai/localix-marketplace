import type { KeyboardEvent, ReactNode } from 'react'
import { Button } from '@localixai/kit/button'
import { Field } from '@localixai/kit/field'
import { Input } from '@localixai/kit/input'
import { formatChordText, isPrimaryModifier } from '@localixai/kit/keybindings'
import { Kbd } from '@localixai/kit/kbd'
import { Select, type SelectOption } from '@localixai/kit/select'
import { Skeleton } from '@localixai/kit/skeleton'
import { Textarea } from '@localixai/kit/textarea'
import { SegmentedRadioGroup } from '@localixai/mini-app-sdk/ui/segmented-control'
import { INBOX, NOTE_KINDS, type Note, type NoteKind } from '../../shared/model'
import type { DeckSummary } from '../../shared/payloads'
import { KIND_HELP, KIND_LABELS, type FormState } from './note-form'
import { Preview } from './Preview'
import { SimilarWarning, useSimilar } from './Similar'
import { Suggestion } from './Suggestion'
import { useNoteForm } from './useNoteForm'

export interface EditorProps {
  noteId: string | null
  decks: readonly DeckSummary[]
  initial?: Partial<FormState>
  suggest: boolean
  onSaved: (note: Note, created: boolean) => void
  onOpenNote: (noteId: string) => void
  /** Extra actions beside Save (delete, close). */
  actions?: ReactNode
  /** Reports the form's unsaved state to whoever hosts it. */
  footerHint?: ReactNode
}

/**
 * The card editor: kind, front, back, extra, deck and tags, a live preview, a warning about
 * similar cards, suggestions for an Inbox card, a sentence under each field that fails, and
 * Cmd/Ctrl+Enter to save.
 */
export function NoteEditor({ noteId, decks, initial, suggest, onSaved, onOpenNote, actions, footerHint }: EditorProps) {
  const state = useNoteForm({ noteId, initial, onSaved })
  const { form, set, errors } = state
  const similar = useSimilar(form, noteId, state.fromSave)
  const deckOptions: SelectOption[] = [
    { value: INBOX, label: 'Inbox (no deck)' },
    ...decks.map((deck) => ({ value: deck.id, label: deck.name })),
  ]

  if (state.loading) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-hidden>
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || !isPrimaryModifier(event) || event.nativeEvent.isComposing) return
    event.preventDefault()
    void state.save()
  }
  const cloze = form.kind === 'cloze'
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the shortcut is also the Save button
    <div className="flex flex-col" onKeyDown={onKeyDown}>
      <div className="flex flex-col gap-4 p-4">
        {state.detail?.note.status === 'draft' && (
          <p className="rounded-md bg-surface-sunken px-3 py-2 text-xs text-text-soft">
            This is a draft: it stays out of your study until you accept it.
          </p>
        )}
        {state.changedElsewhere && (
          <p role="status" className="text-xs text-status-warning">
            This card changed elsewhere. Saving replaces that version with yours.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <SegmentedRadioGroup<NoteKind>
            aria-label="Card type"
            size="sm"
            fullWidth
            value={form.kind}
            onValueChange={(kind) => set({ kind })}
            options={NOTE_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))}
          />
          <p className="text-2xs text-text-faint">{KIND_HELP[form.kind]}</p>
        </div>
        <Field label={cloze ? 'Text' : 'Front'} error={errors.front} required>
          <Textarea
            ref={state.frontRef}
            rows={3}
            value={form.front}
            placeholder={cloze ? 'The capital of France is {{c1::Paris}}' : 'A question, a word, a prompt'}
            onChange={(event) => set({ front: event.target.value })}
          />
        </Field>
        <Field label="Back" error={errors.back} required={!cloze} optional={cloze}>
          <Textarea
            ref={state.backRef}
            rows={3}
            value={form.back}
            placeholder={cloze ? 'Anything to show after the answer' : 'The answer'}
            onChange={(event) => set({ back: event.target.value })}
          />
        </Field>
        <Field label="Extra" error={errors.extra} optional description="A hint, a source or a way to remember it.">
          <Textarea rows={2} value={form.extra} onChange={(event) => set({ extra: event.target.value })} />
        </Field>
        <div className="grid gap-4 @lg:grid-cols-2">
          <Field label="Deck">
            <Select aria-label="Deck" value={form.deck} options={deckOptions} onValueChange={(deck) => set({ deck })} />
          </Field>
          <Field label="Tags" error={errors.tags} optional>
            <Input value={form.tags} placeholder="grammar verbs" onChange={(event) => set({ tags: event.target.value })} />
          </Field>
        </div>
        <Suggestion noteId={noteId} form={form} enabled={suggest} onChange={set} />
        <SimilarWarning hits={similar} onOpen={onOpenNote} />
        <Preview form={form} />
        {(state.serverError || state.loadError) && (
          <p role="alert" className="text-xs text-status-error">{state.serverError ?? state.loadError}</p>
        )}
      </div>
      <div className="sticky bottom-0 z-(--z-sticky) flex flex-wrap items-center gap-2 border-t border-border-soft bg-background px-4 py-2">
        <Button variant="mono" disabled={state.saving || (noteId !== null && !state.dirty)} onClick={() => void state.save()}>
          {noteId ? 'Save changes' : 'Add card'}
          <Kbd className="hidden @lg:inline-flex">{formatChordText('mod+enter')}</Kbd>
        </Button>
        {actions}
        <span className="ml-auto text-xs text-text-faint">{footerHint ?? (state.dirty ? 'Unsaved changes' : '')}</span>
      </div>
    </div>
  )
}
