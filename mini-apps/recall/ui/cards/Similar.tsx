import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { plainFront } from '../../shared/cloze'
import { formatPercent } from '../../shared/format'
import { InlineMd } from '../inline'
import type { SimilarHit } from '../../shared/payloads'
import { DEBOUNCE, useCall, useDebounced } from '../data'
import type { FormState } from './note-form'

/**
 * Cards that already say this, asked once the person stops typing. It only warns: saving is
 * never blocked, and the saved note's own answer is shown too (`fromSave`).
 */
export function useSimilar(form: FormState, excludeId: string | null, fromSave: SimilarHit[]) {
  const ask = useCall()
  const settled = useDebounced({ kind: form.kind, front: form.front, back: form.back }, DEBOUNCE.ms)
  const [hits, setHits] = useState<SimilarHit[]>([])
  useEffect(() => {
    if (!settled.front.trim()) return setHits([])
    let live = true
    ask('similar', { body: { ...settled, excludeId: excludeId ?? undefined } })
      .then((result) => live && setHits(result.similar))
      .catch(() => live && setHits([]))
    return () => {
      live = false
    }
  }, [ask, settled, excludeId])
  return hits.length ? hits : fromSave
}

export function SimilarWarning({
  hits,
  onOpen,
}: {
  hits: readonly SimilarHit[]
  onOpen: (noteId: string) => void
}) {
  if (!hits.length) return null
  return (
    <div role="status" className="flex flex-col gap-1.5 rounded-lg border border-status-warning/40 bg-status-warning/12 px-3 py-2 text-xs">
      <p className="flex items-center gap-1.5 font-medium">
        <TriangleAlert className="size-3.5 text-status-warning" aria-hidden />
        {hits.some((hit) => hit.exact) ? 'You already have this card' : 'Looks like cards you already have'}
      </p>
      <ul className="flex flex-col gap-0.5">
        {hits.slice(0, 3).map((hit) => (
          <li key={hit.noteId} className="flex items-center gap-2">
            <Button variant="link" size="xs" className="min-w-0 justify-start" onClick={() => onOpen(hit.noteId)}>
              <span className="truncate"><InlineMd>{plainFront({ kind: 'basic', front: hit.front })}</InlineMd></span>
            </Button>
            <span className="shrink-0 text-text-faint tabular-nums">
              {hit.exact ? 'exact' : formatPercent(hit.score)} · {hit.deck ?? 'Inbox'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
