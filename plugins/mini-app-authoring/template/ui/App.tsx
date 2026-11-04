import { useMemo, useState, type FormEvent } from 'react'
import { ListTodo, Plus, Trash2 } from 'lucide-react'
import {
  useAgentContext,
  useCollection,
  useScreenProblem,
  type ScreenProps,
} from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { Button } from '@localixai/kit/button'
import { Checkbox } from '@localixai/kit/checkbox'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { IconButton } from '@localixai/kit/icon-button'
import { Input } from '@localixai/kit/input'
import { PanelHeader } from '@localixai/kit/panel-header'
import { StateNotice } from '@localixai/kit/state-notice'
import {
  APP,
  ITEMS,
  countOf,
  describeForAgent,
  itemSchema,
  sortItems,
  type Item,
  type ItemInput,
} from '../shared/model'

/**
 * The screen. It reads the collection, tells the agent exactly what it shows, and writes through
 * the same collection the agent's tools use — so a change from either side shows on the other at
 * once. Replace the list with what your app shows; keep the pieces every screen needs: the header,
 * the problem line, the loading and empty states, and the agent context.
 */
export function App({ active, publishMessageContext }: ScreenProps) {
  const items = useCollection<Item, ItemInput>({ app: APP, name: ITEMS, item: itemSchema, active })
  const sorted = useMemo(() => sortItems(items.items), [items.items])
  const open = sorted.filter((item) => !item.done).length
  useAgentContext(
    publishMessageContext,
    active && !items.loading,
    useMemo(() => ({ label: 'Starter', content: describeForAgent(items.items) }), [items.items]),
  )
  const problem = useScreenProblem({
    app: APP,
    subject: 'Starter',
    failure: items.error,
    showingData: items.items.length > 0,
  })

  return (
    // The fill chain: the header stays, the body scrolls, and the layout reflows to its own width
    // (the screen may sit in a narrow pane).
    <div className="@container flex h-full min-h-0 flex-col">
      <PanelHeader
        tone="content"
        title="Starter"
        summary={items.loading ? 'Loading…' : `${countOf(sorted.length, 'item')} · ${open} open`}
      />
      {problem && <ProblemLine {...problem} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-4 py-4 @2xl:px-6">
          <AddForm sending={items.sending} onAdd={items.add} />
          {items.loading ? (
            <LoadingHint>Opening the list…</LoadingHint>
          ) : sorted.length === 0 ? (
            <StateNotice
              icon={ListTodo}
              title="Nothing here yet"
              body="Add an item above, or ask in the chat: “add buy milk and call the dentist”."
            />
          ) : (
            <ul aria-label="Items" className="flex flex-col divide-y divide-border-soft">
              {sorted.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  disabled={items.sending}
                  onToggle={() => void items.update(item.id, { done: !item.done })}
                  onRemove={() => void items.remove(item.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** A form that adds through the collection and clears once the item is stored. */
function AddForm({
  sending,
  onAdd,
}: {
  sending: boolean
  onAdd: (input: ItemInput) => Promise<unknown>
}) {
  const [title, setTitle] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    if (await onAdd({ title })) setTitle('')
  }
  return (
    <form aria-label="Add an item" className="flex gap-2" onSubmit={(event) => void submit(event)}>
      <Input
        aria-label="New item"
        placeholder="Add an item"
        value={title}
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
      />
      <Button type="submit" size="sm" recommended disabled={sending || !title.trim()}>
        <Plus data-icon="inline-start" />
        Add
      </Button>
    </form>
  )
}

function ItemRow({
  item,
  disabled,
  onToggle,
  onRemove,
}: {
  item: Item
  disabled: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <li className="group flex items-start gap-3 py-2.5">
      <Checkbox
        aria-label={`Done: ${item.title}`}
        checked={item.done}
        disabled={disabled}
        onChange={onToggle}
      />
      <div className="min-w-0 flex-1">
        <p className={item.done ? 'text-sm text-text-faint line-through' : 'text-sm text-foreground'}>
          {item.title}
        </p>
        {item.note && <p className="mt-0.5 text-xs text-text-soft">{item.note}</p>}
      </div>
      <IconButton
        aria-label={`Remove ${item.title}`}
        tooltip="Remove"
        disabled={disabled}
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onRemove}
      >
        <Trash2 />
      </IconButton>
    </li>
  )
}
