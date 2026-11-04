import { useMemo, useState } from 'react'
import { MessageSquareOff, StickyNote } from 'lucide-react'
import {
  useAgentContext,
  useCollection,
  useScreenProblem,
  type ScreenProps,
} from '@localixai/mini-app-sdk/ui/app'
import { ProblemLine } from '@localixai/mini-app-sdk/ui/components'
import { useWorkItemSessionId } from '@localixai/mini-app-sdk/ui/work-item-session'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { PanelHeader } from '@localixai/kit/panel-header'
import { StateNotice } from '@localixai/kit/state-notice'
import { freeSpot } from '../shared/layout'
import {
  APP,
  LINKS,
  LOOKS,
  NOTES,
  countOf,
  describeBoard,
  findLink,
  liveLinks,
  linkSchema,
  lookSchema,
  noteSchema,
  type Link,
  type LinkInput,
  type Look,
  type LookInput,
  type Note,
  type NoteInput,
} from '../shared/model'
import { Board } from './Board'
import type { Selection } from './flow'
import { Toolbar } from './Toolbar'

/**
 * The screen. A board is one chat's, so everything is read with `scope: 'chat'` — and the tab
 * itself is registered per chat (ui/register.tsx), so every chat has its own. The screen keeps no
 * copy of the board: it reads the three collections, writes through them, and hears the agent's
 * edits the moment they land.
 */
export function App({ active, publishMessageContext }: ScreenProps) {
  const sessionId = useWorkItemSessionId()
  const chat = { app: APP, scope: 'chat', active } as const
  const notes = useCollection<Note, NoteInput>({ ...chat, name: NOTES, item: noteSchema })
  const links = useCollection<Link, LinkInput>({ ...chat, name: LINKS, item: linkSchema })
  const looks = useCollection<Look, LookInput>({ ...chat, name: LOOKS, item: lookSchema })
  const [selection, setSelection] = useState<Selection>(null)
  const shownLinks = useMemo(() => liveLinks(notes.items, links.items), [notes.items, links.items])

  useAgentContext(
    publishMessageContext,
    active && !notes.loading,
    useMemo(
      () => ({ label: 'Canvas Board', content: describeBoard(notes.items, links.items) }),
      [notes.items, links.items],
    ),
  )
  const problem = useScreenProblem({
    app: APP,
    subject: 'Board',
    failure: notes.error ?? links.error,
    showingData: notes.items.length > 0,
  })

  const note =
    selection?.kind === 'note' ? notes.items.find((n) => n.id === selection.id) : undefined
  const link =
    selection?.kind === 'link' ? links.items.find((l) => l.id === selection.id) : undefined
  const remove = async () => {
    if (note) {
      await notes.remove(note.id)
      // The collection removes the note only; its arrows go with it, as the agent's tool does.
      for (const each of links.items) {
        if (each.from === note.id || each.to === note.id) await links.remove(each.id)
      }
    } else if (link) await links.remove(link.id)
    setSelection(null)
  }

  const add = (text: string, at?: { x: number; y: number }) =>
    notes.add({ text, ...(at ?? freeSpot(notes.items)) })

  return (
    <div className="@container flex h-full min-h-0 flex-col">
      <PanelHeader
        tone="content"
        title="Canvas Board"
        summary={
          notes.loading
            ? 'Loading…'
            : `${countOf(notes.items.length, 'note')} · ${countOf(shownLinks.length, 'link')}`
        }
      />
      {problem && <ProblemLine {...problem} />}
      {!sessionId ? (
        <StateNotice
          icon={MessageSquareOff}
          title="Open the board from a chat"
          body="Each chat has its own board, shared with the agent in that chat."
        />
      ) : (
        <>
          <Toolbar
            sending={notes.sending || links.sending}
            selection={selection}
            note={note}
            link={link}
            onAdd={(text) => add(text)}
            onEditNote={(patch) => note && void notes.update(note.id, patch)}
            onEditLink={(patch) => link && void links.update(link.id, patch)}
            onDelete={() => void remove()}
          />
          <div className="relative min-h-0 flex-1">
            {notes.loading ? (
              <LoadingHint>Opening the board…</LoadingHint>
            ) : notes.items.length === 0 ? (
              <StateNotice
                icon={StickyNote}
                title="An empty board"
                body="Add a note above, double-click the board, or ask in the chat: “put the three risks on the board and connect them to the plan”."
              />
            ) : (
              <Board
                active={active}
                notes={notes.items}
                links={links.items}
                looks={looks.items}
                selection={selection}
                onSelect={setSelection}
                onMove={(id, x, y) => notes.update(id, { x, y })}
                onConnect={(from, to) => {
                  if (from !== to && !findLink(links.items, from, to)) void links.add({ from, to })
                }}
                onAddAt={(x, y) => void add('New note', { x, y })}
                onDelete={() => void remove()}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
