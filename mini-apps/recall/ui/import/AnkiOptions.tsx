import { Field } from '@localixai/kit/field'
import { Select } from '@localixai/kit/select'
import { Switch } from '@localixai/kit/switch'
import { SegmentedRadioGroup } from '@localixai/mini-app-sdk/ui/segmented-control'
import type { DeckSummary } from '../../shared/payloads'
import type { ImportFilePreview } from '../../shared/payloads-more'

export const FILE_DECKS = 'file'

export interface AnkiChoice {
  deck: string
  status: 'draft' | 'active'
  keepProgress: boolean
  skipDuplicates: boolean
}

export const DEFAULT_CHOICE: AnkiChoice = {
  deck: FILE_DECKS,
  status: 'active',
  keepProgress: true,
  skipDuplicates: true,
}

/** How the cards come in. A choice only appears when the file gives it a meaning. */
export function AnkiOptions({
  preview,
  decks,
  choice,
  onChange,
}: {
  preview: ImportFilePreview
  decks: readonly DeckSummary[]
  choice: AnkiChoice
  onChange: (patch: Partial<AnkiChoice>) => void
}) {
  return (
    <section aria-label="Options" className="flex flex-col gap-4">
      <Field label="Put cards into">
        <Select
          aria-label="Put cards into"
          value={choice.deck}
          onValueChange={(deck) => onChange({ deck })}
          options={[
            {
              value: FILE_DECKS,
              label: preview.decks.length === 1 ? 'The deck in the file' : 'The decks in the file',
            },
            ...decks.map((deck) => ({ value: deck.id, label: deck.name })),
          ]}
        />
      </Field>
      <Field
        label="Add as"
        description={
          choice.status === 'active'
            ? 'You can study them straight away.'
            : 'They wait in Recall until you accept them.'
        }
      >
        <SegmentedRadioGroup<'draft' | 'active'>
          aria-label="Add as"
          value={choice.status}
          onValueChange={(status) => onChange({ status })}
          fullWidth
          options={[
            { value: 'active', label: 'Ready to study' },
            { value: 'draft', label: 'Drafts to look over first' },
          ]}
        />
      </Field>
      {preview.withProgress > 0 && (
        <Field
          label="Keep Anki progress"
          layout="inline"
          description="Cards carry on from where you left off in Anki."
        >
          <Switch
            aria-label="Keep Anki progress"
            checked={choice.keepProgress}
            onChange={(event) => onChange({ keepProgress: event.target.checked })}
          />
        </Field>
      )}
      {preview.duplicates > 0 && (
        <Field
          label="Skip cards I already have"
          layout="inline"
          description="Leave out cards whose front is already in your cards."
        >
          <Switch
            aria-label="Skip cards I already have"
            checked={choice.skipDuplicates}
            onChange={(event) => onChange({ skipDuplicates: event.target.checked })}
          />
        </Field>
      )}
    </section>
  )
}
