import { plainFront } from './cloze'
import { soundsAsWords } from './sound'
import { countOf, formatDue, formatDuration, formatMoment, formatPercent, snippet } from './format'
import { RATING_NAMES, type Card, type Settings } from './model'
import type { DeckSummary, LibraryPage, LibraryRow, NoteDetail, StudyCard, StudyNext, TodaySummary } from './payloads'
import type { ImportPreview, ImportResult, SettingsResult, Stats } from './payloads-more'

/**
 * What the agent is told, in words, bounded in length whatever the collection's size: the same
 * functions feed the tools' answers and the screen's agent context.
 */

const MAX_DECK_LINES = 20

/** A card's state in the screen's words. */
export function cardStateWord(card: Pick<Card, 'state' | 'paused' | 'leech'>): string {
  if (card.paused) return 'paused'
  if (card.leech) return 'hard'
  return card.state === 0 ? 'new' : card.state === 2 ? 'review' : 'learning'
}

function deckLine(deck: DeckSummary): string {
  return `- ${deck.name} (id ${deck.id}): ${countOf(deck.notes, 'note')}, ${deck.due} to study today`
}

export function describeDecks(decks: readonly DeckSummary[], inbox: { notes: number; due: number }): string {
  if (!decks.length && !inbox.notes) return 'No decks yet, and no cards.'
  const lines = decks.slice(0, MAX_DECK_LINES).map(deckLine)
  if (decks.length > MAX_DECK_LINES) lines.push(`- …and ${countOf(decks.length - MAX_DECK_LINES, 'more deck')}`)
  if (inbox.notes) lines.push(`- Inbox (no deck): ${countOf(inbox.notes, 'note')}, ${inbox.due} to study today`)
  return [`${countOf(decks.length, 'deck')}:`, ...lines].join('\n')
}

export function describeOverview(
  today: TodaySummary,
  retention: { actual: number | null; target: number },
  now: Date,
  utcOffset: number,
): string {
  if (!today.totals.notes) return 'Recall is empty: no cards yet. Offer to make cards from what the person is learning.'
  const due = today.due
  const lines = [
    `${countOf(today.totals.notes, 'note')} making ${countOf(today.totals.cards, 'card')}.`,
    due.total
      ? `To study now: ${due.total} (${due.review} reviews, ${due.learning} learning, ${due.new} new), about ${today.minutes} min.`
      : `Nothing to study now${today.nextDueAt ? `; the next card is due ${formatMoment(today.nextDueAt, now, utcOffset)}` : ''}.`,
    `Today: ${today.goal.done} of ${today.goal.target} reviews (daily goal); streak ${countOf(today.streak, 'day')}.`,
  ]
  if (retention.actual !== null) {
    lines.push(`Remembered ${formatPercent(retention.actual)} of reviews in 30 days (target ${formatPercent(retention.target)}).`)
  }
  if (today.drafts) lines.push(`${countOf(today.drafts, 'draft')} waiting for the person to accept on the screen.`)
  if (today.inbox) lines.push(`${countOf(today.inbox, 'card')} in the Inbox without a deck.`)
  lines.push(describeDecks(today.decks, { notes: today.inbox, due: today.inboxDue }))
  return lines.join('\n')
}

/** One note as a line: id, front → back, deck, tags, state and next due. */
export function describeRow(row: LibraryRow, now: Date): string {
  const { note } = row
  const states = [...new Set(row.cards.map(cardStateWord))].join('/')
  const nextDue = row.cards
    .filter((card) => !card.paused && card.state > 0)
    .map((card) => card.due)
    .sort()[0]
  const parts = [
    note.kind !== 'basic' ? note.kind : '',
    row.deck ? row.deck.name : 'Inbox',
    note.tags.map((tag) => `#${tag}`).join(' '),
    note.status === 'draft' ? 'draft' : states,
    nextDue ? `due ${formatDue(nextDue, now)}` : '',
  ].filter(Boolean)
  const back = note.kind === 'cloze' ? '' : ` → ${snippet(soundsAsWords(note.back), 60)}`
  return `- ${snippet(plainFront({ kind: note.kind, front: soundsAsWords(note.front) }), 90)}${back} (${parts.join('; ')}; id ${note.id})`
}

export function describePage(page: LibraryPage, now: Date): string {
  if (!page.total) return 'No cards match.'
  const shown = `${page.offset + 1}–${page.offset + page.rows.length}`
  const head = `${countOf(page.total, 'note')} match${page.by === 'meaning' ? ' by meaning' : ''}; showing ${shown}.`
  const more = page.nextOffset !== null ? `\nMore: call again with offset ${page.nextOffset}.` : ''
  return [head, ...page.rows.map((row) => describeRow(row, now))].join('\n') + more
}

export function describeDetail(detail: NoteDetail, now: Date): string {
  const { note } = detail
  const lines = [
    `${note.kind} note ${note.id}${note.status === 'draft' ? ' (draft)' : ''} in ${detail.deck?.name ?? 'the Inbox'}${
      note.tags.length ? `, tags ${note.tags.map((t) => `#${t}`).join(' ')}` : ''
    }.`,
    `Front: ${snippet(soundsAsWords(note.front), 600)}`,
  ]
  if (note.back) lines.push(`Back: ${snippet(soundsAsWords(note.back), 600)}`)
  if (note.extra) lines.push(`Extra: ${snippet(soundsAsWords(note.extra), 400)}`)
  for (const card of detail.cards) {
    lines.push(
      `Card ${card.variant} (id ${card.id}): ${cardStateWord(card)}, ${countOf(card.reps, 'review')}, ${countOf(card.lapses, 'lapse')}` +
        (card.state > 0 ? `, due ${formatDue(card.due, now)}, recall now ${formatPercent(card.retrievability)}` : ''),
    )
  }
  const recent = detail.history.slice(0, 8)
  if (recent.length) {
    lines.push(`Last answers: ${recent.map((r) => `${RATING_NAMES[r.rating]} ${r.reviewedAt.slice(0, 10)}`).join(', ')}.`)
  }
  return lines.join('\n')
}

/** A card to quiz in the chat: the prompt to ask and the answer to check against. */
export function describeStudyCard(card: StudyCard, next: Pick<StudyNext, 'counts'>): string {
  const lines = [
    `Card ${card.card.id} (${card.kind}${card.deck ? `, ${card.deck.name}` : ''}); ${next.counts.total} left now including this one.`,
    `Ask: ${soundsAsWords(card.prompt)}`,
    `Answer (keep it until they reply): ${soundsAsWords(card.answer)}`,
  ]
  if (card.extra) lines.push(`Extra: ${snippet(soundsAsWords(card.extra), 500)}`)
  const labels = (['1', '2', '3', '4'] as const).map((r) => `${RATING_NAMES[Number(r) as 1]} ${card.outcomes[r].label}`)
  lines.push(`Next due by grade: ${labels.join(' · ')}.`)
  return lines.join('\n')
}

export function describeStats(stats: Stats): string {
  const week = stats.forecast.slice(0, 7).reduce((sum, day) => sum + day.count, 0)
  const per30 = stats.perDay.slice(-30)
  const reviews30 = per30.reduce((sum, day) => sum + day.reviews, 0)
  const s = stats.states
  return [
    `${countOf(stats.totals.notes, 'note')}, ${countOf(stats.totals.cards, 'card')}, ${countOf(stats.totals.reviews, 'answer')} in all.`,
    `Cards: ${s.new} new, ${s.learning} learning, ${s.young} young, ${s.mature} mature, ${s.paused} paused, ${s.hard} hard, ${s.drafts} in drafts.`,
    `Due: ${stats.forecast[0]?.count ?? 0} today, ${week} in the next 7 days.`,
    `Last 30 days: ${countOf(reviews30, 'review')}, ${formatDuration(stats.time.last30Ms)} studied.`,
    stats.retention.actual === null
      ? `No review answers in 30 days to measure retention (target ${formatPercent(stats.retention.target)}).`
      : `Remembered ${formatPercent(stats.retention.actual)} of ${stats.retention.reviews} reviews (target ${formatPercent(stats.retention.target)}).`,
    ...(stats.hardest.length ? ['Hardest:', ...stats.hardest.slice(0, 5).map((row) => `- ${snippet(plainFront(row.note), 80)} (${Math.max(0, ...row.cards.map((c) => c.lapses))} lapses; id ${row.note.id})`)] : []),
  ].join('\n')
}

const SETTING_WORDS: Record<keyof Settings, string> = {
  retention: 'retention (how much to remember)',
  newPerDay: 'new cards per day',
  buttons: 'answer buttons',
  dayStartsAt: 'day starts at (hour)',
  dailyGoal: 'daily goal (reviews)',
  typedAnswerCheck: 'check typed answers with the decision model',
  suggestPlacement: 'suggest decks for Inbox cards',
  autoplaySounds: 'play a card\'s sounds by themselves while studying',
}

export function describeSettings(result: SettingsResult): string {
  const lines = Object.entries(result.settings).map(([key, value]) => {
    const shown = key === 'retention' ? formatPercent(value as number) : String(value)
    return `- ${SETTING_WORDS[key as keyof Settings]} (${key}): ${shown}`
  })
  const e = result.estimates
  lines.push(`About ${e['0.8']} / ${e['0.9']} / ${e['0.95']} reviews a day at 80 / 90 / 95%.`)
  return lines.join('\n')
}

export function describePreview(preview: ImportPreview): string {
  const decks = preview.decks.slice(0, 10).map((d) => `${d.name} (${d.notes}${d.exists ? ', exists' : ', new'})`)
  return [
    `${preview.source} (${preview.format}): ${countOf(preview.notes, 'note')} making ${countOf(preview.cards, 'card')}.`,
    decks.length ? `Decks: ${decks.join(', ')}${preview.decks.length > 10 ? ', …' : ''}.` : 'No decks in the file.',
    `${preview.duplicates} already here exactly; ${preview.withProgress} with review history; ${countOf(preview.pictures, 'picture')}, ${countOf(preview.sounds, 'sound')}.`,
    ...(preview.notices.length ? [`Notes: ${preview.notices.join(' ')}`] : []),
    ...(preview.warnings.length ? [`Warnings: ${preview.warnings.join('; ')}.`] : []),
  ].join('\n')
}

export function describeImportResult(result: ImportResult): string {
  return [
    `Imported ${countOf(result.added, 'note')} (${countOf(result.cards, 'card')}) from ${result.source} as ${
      result.status === 'draft' ? 'drafts' : 'ready cards'
    }.`,
    result.decks.length ? `Into: ${result.decks.slice(0, 10).map((d) => `${d.name} ${d.notes}`).join(', ')}.` : '',
    result.decksCreated.length ? `New decks: ${result.decksCreated.slice(0, 10).join(', ')}.` : '',
    result.skippedDuplicates ? `Skipped ${countOf(result.skippedDuplicates, 'exact duplicate')}.` : '',
    result.reviewsReplayed ? `Kept progress: ${countOf(result.reviewsReplayed, 'past answer')} replayed.` : '',
    result.notices.length ? `Notes: ${result.notices.join(' ')}` : '',
    result.warnings.length ? `Warnings: ${result.warnings.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
