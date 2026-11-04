import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowLeft, Pause, Pencil, Undo2, CalendarClock, Sparkles, X } from 'lucide-react'
import { Button } from '@localixai/kit/button'
import { Chip } from '@localixai/kit/chip'
import { IconButton } from '@localixai/kit/icon-button'
import { Kbd } from '@localixai/kit/kbd'
import { LoadingHint } from '@localixai/kit/empty-hint'
import { PanelHeader } from '@localixai/kit/panel-header'
import { ProgressBar } from '@localixai/kit/progress-bar'
import { StateNotice } from '@localixai/kit/state-notice'
import { useNow } from '@localixai/mini-app-sdk/ui/now'
import { describeStudyCard } from '../../shared/describe'
import type { CardFilter, Rating, Settings } from '../../shared/model'
import { useAskInChat } from '../chat'
import { EditCardDialog } from '../cards/EditDialog'
import { useRead } from '../data'
import { clock } from '../format'
import type { StudyTarget } from '../nav'
import { useReportContext } from '../screen-context'
import { CardFace } from './CardFace'
import { EndScreen } from './EndScreen'
import { ACTION_CLASS, GradeBar, ratingsFor } from './GradeBar'
import { useSounds } from './useSounds'
import { useStudy } from './useStudy'

const KIND_WORD = { basic: '', reversed: 'Two-way', cloze: 'Cloze', typed: 'Typed answer' } as const

function Elapsed({ since }: { since: number }) {
  const now = useNow(1000, true)
  return <span className="tabular-nums text-xs text-text-soft" aria-label="Time studied">{clock((now - since) / 1000)}</span>
}

/**
 * The full-pane study view. One card sits on the table; Space turns it over, then Space is Good,
 * 1–4 answer, R plays the sound again, Z undoes, E edits, P pauses, S skips until tomorrow and Esc ends. Keys the focused
 * control already owns (a text field, a pressed button) are left to it.
 */
export function StudyView({
  target,
  now,
  onExit,
}: {
  target: StudyTarget | null
  now: number
  onExit: () => void
}) {
  const settings = useRead('settings')
  const buttons: Settings['buttons'] = settings.data?.settings.buttons ?? 'two'
  // Nothing plays by itself until the setting is known to be on.
  const autoplay = settings.data?.settings.autoplaySounds ?? false
  const filter = useRef<CardFilter>({ deckIds: target?.deckIds })
  const study = useStudy(filter.current)
  const { session } = study
  const ask = useAskInChat()
  const root = useRef<HTMLDivElement>(null)
  const startedAt = useRef(Date.now())
  const [ending, setEnding] = useState(false)
  const [editing, setEditing] = useState(false)
  const card = session.card
  const sounds = useSounds(card, session.revealed, autoplay)

  useEffect(() => void study.start(), [])
  const typing = card?.typed === true && !session.revealed
  useEffect(() => {
    // Keys go to the view: it takes focus when it opens and after every card, answer, undo or
    // dialog, unless a field is being typed in. A second try beats a host that moves focus after.
    if (editing || typing || session.busy) return
    const focus = () => root.current?.focus({ preventScroll: true })
    focus()
    const frame = requestAnimationFrame(focus)
    return () => cancelAnimationFrame(frame)
  }, [session.loaded, card?.card.id, session.revealed, session.busy, ending, editing, typing])

  useReportContext(card ? describeStudyCard(card, { counts: { learning: 0, review: 0, new: 0, total: session.left } }) : null)

  const suggested: Rating | null = session.check?.rating ?? null
  const gradeWith = (rating: Rating) => session.revealed && !session.busy && void study.grade(rating)
  const turn = () => (card?.typed ? void study.checkTyped() : study.reveal())
  const end = () => (session.answered > 0 ? setEnding(true) : onExit())
  // On the summary the clock stops and the progress goes: what is shown is the session's result.
  const finished = session.loaded && (ending || !card)
  const [stoppedAt, setStoppedAt] = useState<number | null>(null)
  useEffect(() => setStoppedAt(finished ? (current) => current ?? Date.now() : null), [finished])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || editing) return
    const target = event.target as HTMLElement
    const claim = () => event.preventDefault()
    if (event.key === 'Escape') return claim(), ending || !card ? onExit() : end()
    if (ending || !card || target.closest('input, textarea, [contenteditable="true"]')) return
    const key = event.key.toLowerCase()
    if (key === ' ' || key === 'enter') {
      // A focused button presses itself on this key.
      if (target.closest('button, [role="menuitem"]')) return
      claim()
      if (!session.revealed) return turn()
      const rating = suggested ?? (card.typed ? null : 3)
      return rating ? gradeWith(rating) : undefined
    }
    if (/^[1-4]$/.test(key)) {
      claim()
      const rating = ratingsFor(buttons)[Number(key) - 1] ?? (buttons === 'two' && key !== '1' ? 3 : undefined)
      return rating ? gradeWith(rating) : undefined
    }
    if (key === 'z') return claim(), void study.undo()
    if (key === 'e') return claim(), setEditing(true)
    if (key === 'r') return claim(), sounds.replay()
    if (key === 'p') return claim(), void study.pause()
    if (key === 's') return claim(), void study.skip()
  }

  const total = session.answered + session.left
  const header = (
    <PanelHeader
      tone="content"
      title={target ? `Study · ${target.label}` : 'Study'}
      summary={finished ? 'Finished' : card ? `${session.answered + 1} of ${total}` : undefined}
      actionsLabel="Study actions"
      icon={
        <IconButton aria-label="End session" tooltip="End session (Esc)" size="sm" onClick={end}>
          <ArrowLeft />
        </IconButton>
      }
      actions={
        <>
          {!finished && <Elapsed since={startedAt.current} />}
          <IconButton aria-label="Undo last answer" tooltip="Undo (Z)" size="sm" disabled={session.busy || session.answered === 0} onClick={() => void study.undo()}>
            <Undo2 />
          </IconButton>
          <IconButton aria-label="Edit this card" tooltip="Edit (E)" size="sm" disabled={!card} onClick={() => setEditing(true)}>
            <Pencil />
          </IconButton>
          <IconButton aria-label="Pause this card" tooltip="Pause (P)" size="sm" disabled={!card || session.busy} onClick={() => void study.pause()}>
            <Pause />
          </IconButton>
          <IconButton aria-label="Skip until tomorrow" tooltip="Skip until tomorrow (S)" size="sm" disabled={!card || session.busy} onClick={() => void study.skip()}>
            <CalendarClock />
          </IconButton>
        </>
      }
    />
  )

  let body
  if (!session.loaded) body = <LoadingHint>Getting your cards…</LoadingHint>
  else if (session.error && !card) {
    body = (
      <StateNotice
        role="alert"
        title="Could not load the next card"
        body={session.error}
        actions={<Button onClick={() => void study.start()}>Try again</Button>}
      />
    )
  } else if (ending || !card) {
    body = (
      <EndScreen
        session={session}
        seconds={((stoppedAt ?? Date.now()) - startedAt.current) / 1000}
        now={now}
        onDone={onExit}
        onResume={card ? () => setEnding(false) : null}
        onMore={() => void study.start()}
        onAsk={ask}
      />
    )
  } else {
    const kind = KIND_WORD[card.note.kind] || ''
    body = (
      <>
        <ProgressBar value={(session.answered / Math.max(1, total)) * 100} className="mx-4 mt-1 h-1" />
        {session.hard && (
          <div role="status" className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-status-warning/40 bg-status-warning/12 px-3 py-2 text-xs">
            <p className="min-w-0 flex-1">
              <span className="font-medium">That is a hard card now.</span> You have missed it many times; it may need a clearer question.
            </p>
            <Button
              size="sm"
              variant="field"
              onClick={() =>
                ask(`My Recall card "${session.hard!.front.slice(0, 120)}" (note id ${session.hard!.noteId}) is a hard card: I keep missing it. Rewrite it as one fact with a clearer question and a hint in extra, show me the new version, then update it with recall_update_card.`)
              }
            >
              <Sparkles data-icon="inline-start" />
              Rewrite with the agent
            </Button>
            <IconButton aria-label="Dismiss" size="xs" onClick={study.dismissHard}>
              <X />
            </IconButton>
          </div>
        )}
        <div className="recall-stage" key={card.card.id}>
          <article className="recall-card" data-entering="true" aria-label="Flashcard">
            <div className="recall-kicker">
              {card.deck ? (
                <span className="flex items-center gap-1.5" data-recall-color={card.deck.color}>
                  <span className="recall-dot" aria-hidden /> {card.deck.name}
                </span>
              ) : (
                <span>Inbox</span>
              )}
              <span>{card.kind === 'new' ? 'New' : card.kind === 'learning' ? 'Learning' : 'Review'}</span>
              {kind && <span>{kind}</span>}
              {card.card.leech && <Chip tone="warning">Hard card</Chip>}
            </div>
            <CardFace card={card} revealed={session.revealed} typed={session.typed} check={session.check} onTyped={study.setTyped} onSubmit={turn} />
          </article>
        </div>
        <div className="flex flex-col items-center gap-2 px-4 pb-4">
          {session.error && <p role="alert" className="text-xs text-status-error">{session.error}</p>}
          {session.notice && <p role="status" className="text-xs text-text-faint">{session.notice}</p>}
          {session.revealed ? (
            <GradeBar card={card} buttons={buttons} suggested={suggested} busy={session.busy} onGrade={gradeWith} />
          ) : (
            <Button size="xl" variant="secondary" disabled={session.busy} className={`${ACTION_CLASS} recall-grade w-full @md:max-w-md`} data-main="true" onClick={turn}>
              {card.typed && session.typed.trim() ? 'Check answer' : 'Show answer'}
            </Button>
          )}
          <p className="hidden items-center gap-3 text-2xs text-text-faint @2xl:flex" aria-hidden>
            {session.revealed ? (
              <>
                {(!card.typed || suggested) && <span><Kbd>Space</Kbd> Good</span>}
                <span><Kbd>1</Kbd>–<Kbd>{buttons === 'four' ? '4' : '2'}</Kbd> answer</span>
              </>
            ) : (
              <span><Kbd>{card.typed ? 'Enter' : 'Space'}</Kbd> show</span>
            )}
            <span><Kbd>Z</Kbd> undo</span>
            {sounds.has && <span><Kbd>R</Kbd> replay sound</span>}
            <span><Kbd>E</Kbd> edit</span>
            <span><Kbd>P</Kbd> pause</span>
            <span><Kbd>S</Kbd> tomorrow</span>
            <span><Kbd>Esc</Kbd> end</span>
          </p>
        </div>
      </>
    )
  }

  return (
    // The view owns its keys: focus sits on it, a field or button inside keeps what it needs.
    <div
      ref={root}
      tabIndex={-1}
      role="region"
      aria-label="Study session"
      onKeyDown={onKeyDown}
      className="@container flex h-full min-h-0 flex-col outline-none"
    >
      {header}
      {body}
      {card && (
        <EditCardDialog
          noteId={editing ? card.note.id : null}
          onClose={(saved) => {
            setEditing(false)
            if (saved) void study.reload()
          }}
        />
      )}
    </div>
  )
}
