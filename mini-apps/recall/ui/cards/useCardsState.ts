import { useCallback, useState } from 'react'
import { NO_FILTERS, type CardsFilters } from '../nav'

export interface CardsPreset {
  deck?: string
  state?: string
}

/**
 * Which cards the Cards tab shows and which one is open. The shell holds it, so Today ("Review"),
 * a deck row and Stats ("hardest cards") can open the tab already filtered, and a visit to
 * another tab does not lose the person's place.
 */
export function useCardsState() {
  const [filters, setFilters] = useState<CardsFilters>(NO_FILTERS)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const close = useCallback(() => {
    setOpenId(null)
    setCreating(false)
  }, [])
  return {
    filters,
    patch: useCallback((change: Partial<CardsFilters>) => setFilters((f) => ({ ...f, ...change })), []),
    clear: useCallback(() => setFilters(NO_FILTERS), []),
    openId,
    creating,
    openNote: useCallback((id: string) => {
      setOpenId(id)
      setCreating(false)
    }, []),
    newCard: useCallback(() => {
      setOpenId(null)
      setCreating(true)
    }, []),
    close,
    show: useCallback(
      (preset: CardsPreset) => {
        setFilters({ ...NO_FILTERS, deck: preset.deck ?? 'all', state: preset.state ?? 'all' })
        close()
      },
      [close],
    ),
  }
}

export type CardsState = ReturnType<typeof useCardsState>
