import {
  createEmptyCard,
  fsrs,
  type Card,
  type Grade as FsrsGrade,
  type State,
} from "ts-fsrs"

/**
 * Spaced repetition scheduling. The ONLY module in the app that imports
 * `ts-fsrs` — everything above it deals in cards and ratings, never in
 * stability or difficulty. That boundary is what lets the algorithm be tuned
 * or replaced without the product code noticing.
 *
 * `schedule` is pure and takes `now` as a parameter: no clock, no database, no
 * I/O. Fuzz stays off (the ts-fsrs default), so the same inputs always give
 * the same schedule and tests can assert exact values.
 *
 * @spec L2-SRS-03
 */

/** ts-fsrs `Rating` minus Manual: Again, Hard, Good, Easy. */
export type Grade = 1 | 2 | 3 | 4

export const GRADES: readonly { value: Grade; label: string }[] = [
  { value: 1, label: "Again" },
  { value: 2, label: "Hard" },
  { value: 3, label: "Good" },
  { value: 4, label: "Easy" },
]

/**
 * One student's memory of one card — the `card_state` row shape, in app terms.
 * Every field of the ts-fsrs `Card` is represented; dropping one would corrupt
 * the schedule on the next round-trip.
 */
export type MemoryState = {
  due: Date
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  /** ts-fsrs `State`: New 0, Learning 1, Review 2, Relearning 3. */
  state: number
  lastReviewAt: Date | null
}

export type ReviewOutcome = {
  next: MemoryState
  /** The state as it was BEFORE this answer — what `review_log` records. */
  logged: {
    rating: Grade
    state: number
    stability: number
    difficulty: number
    scheduledDays: number
  }
}

// One instance, default parameters. Stateless, so sharing it is safe.
const scheduler = fsrs()

function toFsrsCard(state: MemoryState): Card {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    // Only the enum is cast: a whole-object cast would hide a newly
    // required `Card` field behind a passing typecheck.
    state: state.state as State,
    last_review: state.lastReviewAt ?? undefined,
    // Deprecated in ts-fsrs and unused by the algorithm, but still on the
    // type. Derived rather than stored, so the column count stays honest.
    elapsed_days: state.lastReviewAt
      ? Math.max(
          0,
          Math.round(
            (state.due.getTime() - state.lastReviewAt.getTime()) / 86_400_000
          )
        )
      : 0,
  }
}

function fromFsrsCard(card: Card): MemoryState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReviewAt: card.last_review ?? null,
  }
}

/** A card this student has never seen: due immediately, no history. */
export function newCardState(now: Date): MemoryState {
  return fromFsrsCard(createEmptyCard(now))
}

/**
 * Apply an answer. Returns the next state plus the pre-answer values to log.
 * Neither argument is mutated.
 */
export function schedule(
  current: MemoryState,
  grade: Grade,
  now: Date
): ReviewOutcome {
  const { card } = scheduler.next(
    toFsrsCard(current),
    now,
    grade as FsrsGrade
  )

  return {
    next: fromFsrsCard(card),
    logged: {
      rating: grade,
      state: current.state,
      stability: current.stability,
      difficulty: current.difficulty,
      scheduledDays: current.scheduledDays,
    },
  }
}
