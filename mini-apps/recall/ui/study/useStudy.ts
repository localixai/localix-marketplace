import { useCallback, useRef, useState } from 'react'
import { plainFront } from '../../shared/cloze'
import type { CardFilter, Rating } from '../../shared/model'
import type { CheckAnswerResult, StudyCard, StudyNext } from '../../shared/payloads'
import { messageOf, useCall, useShared } from '../data'

export interface Miss {
  noteId: string
  front: string
}

export interface Session {
  loaded: boolean
  card: StudyCard | null
  /** What is left now, the shown card included. */
  left: number
  nextDueAt: string | null
  answered: number
  remembered: number
  misses: Miss[]
  revealed: boolean
  typed: string
  check: CheckAnswerResult | null
  /** The card the last answer made hard, until the next answer. */
  hard: Miss | null
  busy: boolean
  error: string | null
  notice: string | null
}

const START: Session = {
  loaded: false,
  card: null,
  left: 0,
  nextDueAt: null,
  answered: 0,
  remembered: 0,
  misses: [],
  revealed: false,
  typed: '',
  check: null,
  hard: null,
  busy: false,
  error: null,
  notice: null,
}

const missOf = (card: StudyCard): Miss => ({
  noteId: card.note.id,
  front: plainFront(card.note).trim(),
})

/**
 * One study session: the current card, what was answered, and the moves that change it. Every
 * move asks the backend and takes the card it answers with; the screen never decides the order.
 */
export function useStudy(filter: CardFilter) {
  const ask = useCall()
  const { bump } = useShared()
  const [session, setSession] = useState<Session>(START)
  const shownAt = useRef(0)
  const lastRated = useRef<{ miss: Miss | null }[]>([])

  const show = useCallback((patch: Partial<Session>, next: StudyNext) => {
    shownAt.current = Date.now()
    setSession((s) => ({
      ...s,
      ...patch,
      loaded: true,
      card: next.card,
      left: next.counts.total,
      nextDueAt: next.nextDueAt,
      revealed: false,
      typed: '',
      check: null,
      busy: false,
      error: null,
    }))
  }, [])

  const guard = useCallback(async (work: () => Promise<void>) => {
    setSession((s) => ({ ...s, busy: true, error: null, notice: null }))
    try {
      await work()
    } catch (failure) {
      setSession((s) => ({ ...s, busy: false, loaded: true, error: messageOf(failure) }))
    }
  }, [])

  const start = useCallback(
    () => guard(async () => show({}, await ask('studyNext', { query: filter }))),
    [ask, filter, guard, show],
  )

  const reveal = useCallback(() => setSession((s) => (s.card ? { ...s, revealed: true } : s)), [])
  const setTyped = useCallback((typed: string) => setSession((s) => ({ ...s, typed })), [])

  const checkTyped = useCallback(
    () =>
      guard(async () => {
        const card = session.card
        if (!card) return
        if (!session.typed.trim()) return setSession((s) => ({ ...s, busy: false, revealed: true }))
        const check = await ask('studyCheck', { body: { cardId: card.card.id, answer: session.typed } })
        setSession((s) => ({ ...s, busy: false, revealed: true, check }))
      }),
    [ask, guard, session.card, session.typed],
  )

  const grade = useCallback(
    (rating: Rating) =>
      guard(async () => {
        const card = session.card
        if (!card) return
        const durationMs = Math.max(0, Date.now() - shownAt.current)
        const result = await ask('studyGrade', {
          body: { cardId: card.card.id, rating, durationMs, filter },
        })
        const miss = rating === 1 ? missOf(card) : null
        lastRated.current.push({ miss })
        show(
          {
            answered: session.answered + 1,
            remembered: session.remembered + (rating > 1 ? 1 : 0),
            misses: miss ? [...session.misses, miss] : session.misses,
            hard: result.becameHard ? missOf(card) : null,
          },
          result.next,
        )
        bump()
      }),
    [ask, bump, filter, guard, session, show],
  )

  const move = useCallback(
    (route: 'studyPause' | 'studySkip') =>
      guard(async () => {
        const card = session.card
        if (!card) return
        const next = await ask(route, { body: { cardId: card.card.id, filter } })
        show({ hard: null, notice: route === 'studyPause' ? 'Card paused.' : 'Back tomorrow.' }, next)
        bump()
      }),
    [ask, bump, filter, guard, session.card, show],
  )

  const undo = useCallback(
    () =>
      guard(async () => {
        const result = await ask('studyUndo', { body: {} })
        if (!result.card || !result.undone) {
          return setSession((s) => ({ ...s, busy: false, notice: 'Nothing to undo.' }))
        }
        const last = lastRated.current.pop()
        const { card } = result
        shownAt.current = Date.now()
        setSession((s) => ({
          ...s,
          busy: false,
          card,
          left: s.left + 1,
          answered: Math.max(0, s.answered - 1),
          remembered: Math.max(0, s.remembered - (result.undone!.rating > 1 ? 1 : 0)),
          misses: last?.miss ? s.misses.filter((m) => m !== last.miss) : s.misses,
          hard: null,
          revealed: false,
          typed: '',
          check: null,
          notice: 'Last answer undone.',
        }))
        bump()
      }),
    [ask, bump, guard],
  )

  /** Read the shown card again, after it was edited, keeping the answer shown. */
  const reload = useCallback(async () => {
    const id = session.card?.card.id
    if (!id) return
    try {
      const card = await ask('studyCard', { params: { id } })
      setSession((s) => (s.card?.card.id === id ? { ...s, card } : s))
    } catch (failure) {
      setSession((s) => ({ ...s, error: messageOf(failure) }))
    }
  }, [ask, session.card])

  return {
    session,
    start,
    reveal,
    setTyped,
    checkTyped,
    grade,
    pause: () => move('studyPause'),
    skip: () => move('studySkip'),
    undo,
    reload,
    dismissHard: () => setSession((s) => ({ ...s, hard: null })),
  }
}
