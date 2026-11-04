import {
  createEmptyCard,
  fsrs,
  type Card as FsrsCard,
  type FSRS,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs'
import type { Memory, Rating, Settings } from './model'

/**
 * The scheduler: ts-fsrs (FSRS-6) behind Recall's own shapes. A card's memory is derived from its
 * reviews (`rebuildCard` replays them), so changing a parameter is a replay, not a migration. Fuzz
 * is seeded by ts-fsrs from the review moment and the card, so a replay reproduces the same dates.
 */

export const LEARNING_STEPS = ['1m', '10m'] as const
export const RELEARNING_STEPS = ['10m'] as const
export const MAXIMUM_INTERVAL = 36_500
/** The lapse that marks a card as hard (a leech). */
export const LEECH_LAPSES = 8

export type SchedulerSettings = Pick<Settings, 'retention'>

function engine(settings: SchedulerSettings): FSRS {
  return fsrs({
    request_retention: settings.retention,
    maximum_interval: MAXIMUM_INTERVAL,
    enable_fuzz: true,
    enable_short_term: true,
    learning_steps: [...LEARNING_STEPS],
    relearning_steps: [...RELEARNING_STEPS],
  })
}

function toFsrs(memory: Memory): FsrsCard {
  const due = new Date(memory.due)
  const last = memory.lastReview ? new Date(memory.lastReview) : undefined
  return {
    due,
    stability: memory.stability,
    difficulty: memory.difficulty,
    elapsed_days: last ? Math.max(0, Math.floor((due.getTime() - last.getTime()) / 86_400_000)) : 0,
    scheduled_days: memory.scheduledDays,
    learning_steps: memory.learningSteps,
    reps: memory.reps,
    lapses: memory.lapses,
    state: memory.state,
    ...(last ? { last_review: last } : {}),
  }
}

function fromFsrs(card: FsrsCard): Memory {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as Memory['state'],
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  }
}

/** A new card's memory: due at once. */
export function newCardState(now: Date): Memory {
  return fromFsrs(createEmptyCard(now))
}

export interface Outcome {
  due: string
  /** From the review moment to the next due, in ms. */
  intervalMs: number
}

export type ReplayStep = { before: Memory; after: Memory; log: GradeLog }
type Reviewed = { rating: Rating; reviewedAt: string }

export interface Scheduler {
  /** The four outcomes of grading now, for the buttons' labels. */
  preview(memory: Memory, now: Date): Record<Rating, Outcome>
  /** Grade a card now: its next memory and the log row. */
  grade(memory: Memory, rating: Rating, now: Date): { memory: Memory; log: GradeLog }
  /** Each step of replaying these reviews from new, oldest first. */
  replay(reviews: readonly Reviewed[], createdAt: string): ReplayStep[]
  /** The chance of recalling the card now, 0..1 (1 for a new card). */
  retrievability(memory: Memory, now: Date): number
}

/** One engine for many calls (a replay of a whole import builds it once). */
export function createScheduler(settings: SchedulerSettings): Scheduler {
  const f = engine(settings)
  const gradeWith = (memory: Memory, rating: Rating, now: Date) => {
    const { card, log } = f.next(toFsrs(memory), now, rating as Grade)
    return { memory: fromFsrs(card), log: toLog(log, card) }
  }
  return {
    preview(memory, now) {
      const record = f.repeat(toFsrs(memory), now)
      const outcome = (rating: Rating): Outcome => {
        const due = record[rating as Grade].card.due
        return { due: due.toISOString(), intervalMs: Math.max(0, due.getTime() - now.getTime()) }
      }
      return { 1: outcome(1), 2: outcome(2), 3: outcome(3), 4: outcome(4) }
    },
    grade: gradeWith,
    replay(reviews, createdAt) {
      const ordered = [...reviews].sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt))
      const first = ordered[0]
      const start =
        first && Date.parse(first.reviewedAt) < Date.parse(createdAt) ? first.reviewedAt : createdAt
      let memory = newCardState(new Date(start))
      return ordered.map((review) => {
        const before = memory
        const step = gradeWith(memory, review.rating, new Date(review.reviewedAt))
        memory = step.memory
        return { before, after: step.memory, log: step.log }
      })
    },
    retrievability(memory, now) {
      if (memory.state === 0 || !memory.lastReview) return 1
      return f.get_retrievability(toFsrs(memory), now, false)
    },
  }
}

/** What the review log keeps of one grading: the state and figures the review produced. */
export interface GradeLog {
  rating: Rating
  state: Memory['state']
  due: string
  stability: number
  difficulty: number
  scheduledDays: number
  elapsedDays: number
  reviewedAt: string
}

function toLog(log: ReviewLog, card: FsrsCard): GradeLog {
  return {
    rating: log.rating as Rating,
    state: card.state as Memory['state'],
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    elapsedDays: log.elapsed_days,
    reviewedAt: log.review.toISOString(),
  }
}

/** The four outcomes of grading now. */
export const preview = (memory: Memory, now: Date, settings: SchedulerSettings) =>
  createScheduler(settings).preview(memory, now)

/** Grade a card now: its next memory and the log row. */
export const grade = (memory: Memory, rating: Rating, now: Date, settings: SchedulerSettings) =>
  createScheduler(settings).grade(memory, rating, now)

/**
 * The memory a card has after these reviews, replayed from new, oldest first: the review log is
 * the truth. `createdAt` is when the card became new; an earlier review is replayed at its moment.
 */
export function rebuildCard(
  reviews: readonly Reviewed[],
  createdAt: string,
  settings: SchedulerSettings,
): Memory {
  return createScheduler(settings).replay(reviews, createdAt).at(-1)?.after ?? newCardState(new Date(createdAt))
}

/** The chance of recalling the card now, 0..1 (1 for a new card). */
export const retrievability = (memory: Memory, now: Date, settings: SchedulerSettings) =>
  createScheduler(settings).retrievability(memory, now)
