import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ChipButton } from '@localixai/kit/chip'
import { INBOX, normalizeTags } from '../../shared/model'
import type { Placement } from '../../shared/payloads'
import { useCall } from '../data'
import type { FormState } from './note-form'

/** A suggested deck and tags for a card in the Inbox; choosing one fills the form, nothing saves. */
export function Suggestion({
  noteId,
  form,
  enabled,
  onChange,
}: {
  noteId: string | null
  form: FormState
  enabled: boolean
  onChange: (patch: Partial<FormState>) => void
}) {
  const ask = useCall()
  const [placement, setPlacement] = useState<Placement | null>(null)
  useEffect(() => {
    setPlacement(null)
    if (!noteId || !enabled) return
    let live = true
    ask('placement', { body: { ids: [noteId] } })
      .then((result) => live && setPlacement(result.suggestions[0] ?? null))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [ask, noteId, enabled])

  const have = normalizeTags([form.tags])
  const deck = form.deck === INBOX ? placement?.deck : null
  const tags = (placement?.tags ?? []).filter((tag) => !have.includes(tag))
  if (!deck && !tags.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-soft" aria-label="Suggestions">
      <Sparkles className="size-3.5" aria-hidden />
      <span>Suggested:</span>
      {deck && (
        <ChipButton tone="info" aria-label={`Put in ${deck.name}`} onClick={() => onChange({ deck: deck.id })}>
          Deck {deck.name}
        </ChipButton>
      )}
      {tags.map((tag) => (
        <ChipButton key={tag} aria-label={`Add the tag ${tag}`} onClick={() => onChange({ tags: [...have, tag].join(' ') })}>
          #{tag}
        </ChipButton>
      ))}
    </div>
  )
}
