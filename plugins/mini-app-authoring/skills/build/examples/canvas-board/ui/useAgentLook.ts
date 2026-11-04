import { useEffect, useRef } from 'react'
import { LOOK_TTL_MS, type Look, type Note } from '../shared/model'

/** The newest request, if any: the board only ever follows the latest "look at this". */
export function newestLook(looks: readonly Look[]): Look | undefined {
  return looks.reduce<Look | undefined>(
    (best, look) => (!best || look.at > best.at ? look : best),
    undefined,
  )
}

/**
 * THE AGENT SAYS "LOOK AT THIS" — and the open board pans to it.
 *
 * The tool writes a `look` into a chat collection, the store feed nudges every open board, and
 * this hook turns the newest one into one camera move (`go`). The rules that make it safe:
 * - once: a look is applied a single time, however often the board re-renders or re-reads;
 * - fresh: a look older than `LOOK_TTL_MS` is dropped, so reopening the tab never replays old news;
 * - patient: the notes may arrive after the look (two collections, two reads), so it waits for
 *   at least one of them rather than spending the look on nothing;
 * - visible: a hidden board applies nothing and keeps the look for when it is shown (still fresh).
 */
export function useAgentLook({
  active,
  looks,
  notes,
  go,
}: {
  active: boolean
  looks: readonly Look[]
  notes: readonly Note[]
  /** Bring these notes into view. */
  go: (noteIds: string[]) => void
}) {
  const applied = useRef<string | null>(null)
  const latest = newestLook(looks)
  useEffect(() => {
    if (!active || !latest || applied.current === latest.id) return
    if (Date.now() - Date.parse(latest.at) > LOOK_TTL_MS) {
      applied.current = latest.id
      return
    }
    const here = new Set(notes.map((note) => note.id))
    const present = latest.noteIds.filter((id) => here.has(id))
    if (!present.length) return
    applied.current = latest.id
    go(present)
  }, [active, latest, notes, go])
}
