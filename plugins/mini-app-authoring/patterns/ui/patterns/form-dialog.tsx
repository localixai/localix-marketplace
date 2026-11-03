import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { useScreenProblem } from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { Button } from '@localixai/kit/button'
import { Chip } from '@localixai/kit/chip'
import { DIVIDED_LIST } from '@localixai/kit/divided-list'
import { IconButton } from '@localixai/kit/icon-button'
import { PanelHeader } from '@localixai/kit/panel-header'
import { Skeleton } from '@localixai/kit/skeleton'
import { StateNotice } from '@localixai/kit/state-notice'
import { cn } from '@localixai/mini-app-sdk/ui/classes'
import { APP, type Deal, type DealInput } from '../../shared/model'
import { useDeals, type PatternProps } from '../data'
import { countOf, formatMoney } from '../format'
import { STAGE_LABEL, STAGE_TONE } from '../stage'
import { DealFormDialog } from './form-dialog-parts'

/**
 * FORM DIALOG — add and edit in one dialog. "New deal" opens it empty; the pencil on a row opens
 * the same dialog pre-filled. The form lives in `form-dialog-parts.tsx`; this file is the screen
 * that opens it and owns the write.
 *
 * What the dialog does, and why:
 * - One validator: the shared zod schema checks on submit and each field shows its own sentence;
 *   focus moves to the first invalid field. The same schema runs on the server, so what the form
 *   lets through is what the collection accepts.
 * - The save is pending while it is in flight (the button is busy and cannot send twice), and a
 *   refusal from the server is shown inside the dialog, which stays open with the text intact.
 * - Edit sends the full form as a change; defaults are filled by the collection on create, never
 *   by `.default()` in the schema.
 *
 * Use it for a handful of fields (up to ~10). For a long or branching form use a full pane.
 *
 * When copying, rename: `FormDialog`, `DealFormDialog` and its fields, `useDeals`, and the
 * `add`/`update` calls. `Dialog` closes on Escape and on the backdrop, and returns focus to the
 * button that opened it.
 */

type Editing = { mode: 'add' } | { mode: 'edit'; id: string }

export function FormDialog({ active }: PatternProps) {
  const deals = useDeals(active)
  const [editing, setEditing] = useState<Editing | null>(null)
  const target =
    editing?.mode === 'edit' ? (deals.items.find((deal) => deal.id === editing.id) ?? null) : null
  const problem = useScreenProblem({
    app: APP,
    subject: 'Deals',
    // A refused save is shown in the dialog, not twice.
    failure: editing ? null : deals.error,
    showingData: deals.items.length > 0,
  })

  function close(open: boolean) {
    if (open) return
    setEditing(null)
    // A refused save leaves its sentence in the hook; reading again clears it.
    deals.refresh()
  }
  async function save(input: DealInput): Promise<boolean> {
    const result = target ? await deals.update(target.id, input) : await deals.add(input)
    if (result) setEditing(null)
    return result !== null
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <PanelHeader
        tone="content"
        title="Deals"
        summary={deals.loading ? 'Loading…' : countOf(deals.items.length, 'deal')}
        actionsLabel="Deal actions"
        actions={
          <Button size="sm" recommended onClick={() => setEditing({ mode: 'add' })}>
            <Plus data-icon="inline-start" />
            New deal
          </Button>
        }
      />
      {problem && <ProblemLine {...problem} />}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-thin @3xl:px-4">
        {deals.loading ? (
          <div aria-hidden className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-11 rounded-md" />
            ))}
          </div>
        ) : deals.items.length === 0 ? (
          <StateNotice
            title="No deals yet"
            body="Add the first deal to see it here."
            actions={<Button onClick={() => setEditing({ mode: 'add' })}>New deal</Button>}
          />
        ) : (
          <ul
            aria-label="Deals"
            className={cn(DIVIDED_LIST, 'rounded-lg border border-border-soft')}
          >
            {deals.items.map((deal) => (
              <DealItem
                key={deal.id}
                deal={deal}
                onEdit={() => setEditing({ mode: 'edit', id: deal.id })}
              />
            ))}
          </ul>
        )}
      </div>
      <DealFormDialog
        // An edit whose deal was deleted elsewhere closes instead of turning into an add.
        open={editing?.mode === 'add' || (editing !== null && target !== null)}
        deal={target}
        pending={deals.sending}
        serverError={deals.error}
        onOpenChange={close}
        onSubmit={save}
      />
    </div>
  )
}

function DealItem({ deal, onEdit }: { deal: Deal; onEdit: () => void }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground" title={deal.title}>
          {deal.title}
        </p>
        <p className="truncate text-2xs text-text-faint" title={deal.company}>
          {deal.company}
        </p>
      </div>
      <Chip tone={STAGE_TONE[deal.stage]} size="dense">
        {STAGE_LABEL[deal.stage]}
      </Chip>
      <span className="w-20 text-right text-xs font-medium tabular-nums text-foreground">
        {formatMoney(deal.amount, deal.currency)}
      </span>
      <IconButton aria-label={`Edit ${deal.title}`} tooltip="Edit" size="sm" onClick={onEdit}>
        <Pencil />
      </IconButton>
    </li>
  )
}
