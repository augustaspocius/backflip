# Repeat & Learn — plan 3: the review loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student opens a published course, studies its cards, rates each one, and comes back to a queue that reflects what they got right and wrong.

**Architecture:** `ts-fsrs` computes the next schedule as a pure function; `_lib/srs/` is the only module that imports it. Nothing runs on a timer — a student answering a card is the sole trigger for scheduling work. Two tables carry the state: `card_state` (one row per student per card, indexed on `(userId, due)`) and an append-only `review_log`.

**Tech Stack:** `ts-fsrs` 5.4.2 (MIT), Next.js 16 App Router, Drizzle ORM + Postgres, Vitest 4, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-04-repeat-and-learn-design.md`

**Depends on:** plans 1 and 2, complete and merged.

## Global constraints

- Package manager is yarn 4 via corepack. Every command is `corepack yarn …`.
- **No background jobs, cron, queues or Redis.** The droplet runs the app and Postgres together and is not to grow. Schedules are computed on answer, never swept.
- `ts-fsrs` is imported by `apps/web/app/_lib/srs/` and by nothing else. Product code deals in cards and ratings, never in stability or difficulty.
- `schedule()` takes `now` as a parameter and reads no clock of its own. This is what makes it testable without faking time.
- FSRS fuzz stays off (`ts-fsrs` default), so scheduling is deterministic and assertions are exact.
- Persist **every** field of the `ts-fsrs` `Card`, `learning_steps` included. Dropping one silently corrupts the schedule on the next round-trip.
- One schema source (`L2-DB-09`); migrations generated, never hand-written (`L2-DB-11`).
- Every `/learn/*` page and action calls a guard from `@/app/_lib/school` server-side (`L2-SCHOOL-05`), and a student may only answer cards in a course they are enrolled in.
- Do NOT edit `docs/constitution.md`.
- Commits: one semantic line, no body, no trailers, no AI attribution.

---

### Task 1: Scheduling state schema

**Files:**
- Modify: `packages/db/src/schema.ts` (append)
- Create: `packages/db/migrations/00NN_*.sql` (generated)
- Modify: `docs/contracts/db.md`, `docs/notes/db.md`

**Interfaces:**
- Consumes: `cards`, `users` from plan 2 and plan 1.
- Produces, exported from `@workspace/db`:
  - `cardStates` = `{ id, userId, cardId, due, stability, difficulty, scheduledDays, learningSteps, reps, lapses, state, lastReviewAt }`
  - `reviewLogs` = `{ id, userId, cardId, rating, state, stability, difficulty, scheduledDays, reviewedAt }`

`state` and `rating` are stored as small integers matching the `ts-fsrs` enums (`State.New=0 … Relearning=3`; `Rating.Again=1 … Easy=4`) rather than Postgres enums, because they are that library's values and a new FSRS version changing them must not need a migration.

- [ ] **Step 1: Append the tables**

Add to the end of `packages/db/src/schema.ts`:

```ts
/**
 * One student's memory state for one card. This is the table that makes a
 * single authored deck serve thirty students on thirty schedules.
 *
 * Columns mirror the `ts-fsrs` `Card` shape exactly, `learningSteps`
 * included — a dropped field corrupts the schedule the next time the row is
 * fed back into the algorithm.
 *
 * `state` holds the ts-fsrs `State` enum as an int (New 0, Learning 1,
 * Review 2, Relearning 3). Deliberately not a pg enum: these are the
 * library's values, and a version that adds one must not need a migration.
 *
 * @spec L2-SRS-01
 */
export const cardStates = pgTable(
  "card_state",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("cardId")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    /** When this card is next due. The queue orders by it. */
    due: timestamp("due", { mode: "date" }).notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    scheduledDays: integer("scheduledDays").notNull(),
    learningSteps: integer("learningSteps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: integer("state").notNull().default(0),
    lastReviewAt: timestamp("lastReviewAt", { mode: "date" }),
  },
  (t) => [
    // One state per person per card. A review is an update, never a new row.
    uniqueIndex("card_state_user_card_idx").on(t.userId, t.cardId),
    // THE query: "what is due for me now", ordered by due. Everything the
    // study screen does goes down this index.
    index("card_state_user_due_idx").on(t.userId, t.due),
  ]
)

/**
 * Append-only record of every answer. The only table that grows without
 * bound, which is why it holds nothing but numbers and timestamps.
 *
 * It earns that growth by being what an FSRS parameter optimisation trains
 * on later; without it, per-student tuning is impossible after the fact.
 *
 * @spec L2-SRS-02
 */
export const reviewLogs = pgTable(
  "review_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("cardId")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    /** ts-fsrs `Rating`: Again 1, Hard 2, Good 3, Easy 4. */
    rating: integer("rating").notNull(),
    /** The state the card was in *before* this answer. */
    state: integer("state").notNull(),
    stability: real("stability").notNull(),
    difficulty: real("difficulty").notNull(),
    scheduledDays: integer("scheduledDays").notNull(),
    reviewedAt: timestamp("reviewedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("review_log_user_reviewed_idx").on(t.userId, t.reviewedAt)]
)
```

- [ ] **Step 2: Generate and apply**

```bash
corepack yarn db:generate
corepack yarn db:migrate
```

- [ ] **Step 3: Verify the critical index exists**

```bash
docker exec backflip-db psql -U backflip -d backflip -c "\d card_state"
```

Expected: `card_state_user_due_idx` on `("userId", due)` is listed. Without it the study screen does a sequential scan on every load.

- [ ] **Step 4: Update the docs**

In `docs/contracts/db.md` add `L2-DB-44` (card_state) and `L2-DB-45` (review_log), each naming columns, both indexes, the cascade behaviour, and why `state`/`rating` are ints rather than pg enums. Add both tables to `L2-DB-14`. Mirror in `docs/notes/db.md`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations docs/contracts/db.md docs/notes/db.md
git commit -m "feat(db): add card_state and review_log tables"
```

---

### Task 2: The scheduler

This is the core of the product. It is written and proven correct before any UI touches it.

**Files:**
- Modify: `apps/web/package.json` (add the dependency)
- Create: `apps/web/app/_lib/srs/schedule.ts`
- Create: `apps/web/app/_lib/srs/schedule.test.ts`

**Interfaces:**
- Consumes: `ts-fsrs`.
- Produces, from `@/app/_lib/srs/schedule`:
  - `type Grade = 1 | 2 | 3 | 4` (Again, Hard, Good, Easy)
  - `type MemoryState = { due: Date; stability: number; difficulty: number; scheduledDays: number; learningSteps: number; reps: number; lapses: number; state: number; lastReviewAt: Date | null }`
  - `type ReviewOutcome = { next: MemoryState; logged: { rating: Grade; state: number; stability: number; difficulty: number; scheduledDays: number } }`
  - `newCardState(now: Date): MemoryState`
  - `schedule(current: MemoryState, grade: Grade, now: Date): ReviewOutcome`
  - `GRADES: readonly { value: Grade; label: string }[]`

`logged` holds the state *before* the answer, which is what `review_log` records.

- [ ] **Step 1: Add the dependency**

```bash
corepack yarn workspace web add ts-fsrs@5.4.2
```

Expected: `"ts-fsrs": "5.4.2"` appears in `apps/web/package.json` dependencies, and `yarn.lock` updates. Pin the exact version: the algorithm's defaults change between minors, and a silent bump would reschedule every student's cards.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/app/_lib/srs/schedule.test.ts`. These are the tests that stop a scheduling regression, so they assert behaviour rather than restating the library.

```ts
import { describe, expect, it } from "vitest"

import {
  newCardState,
  schedule,
  type Grade,
  type MemoryState,
} from "@/app/_lib/srs/schedule"

const NOW = new Date("2026-01-01T12:00:00.000Z")

/** Drive a card through a sequence of grades, returning the final state. */
function play(grades: Grade[], start: MemoryState = newCardState(NOW)) {
  let state = start
  let at = NOW
  for (const grade of grades) {
    state = schedule(state, grade, at).next
    // Answer each subsequent review exactly when it falls due.
    at = state.due
  }
  return state
}

describe("newCardState", () => {
  it("is due immediately and unreviewed", () => {
    const state = newCardState(NOW)
    expect(state.due.getTime()).toBe(NOW.getTime())
    expect(state.reps).toBe(0)
    expect(state.lapses).toBe(0)
    expect(state.state).toBe(0) // ts-fsrs State.New
    expect(state.lastReviewAt).toBeNull()
  })
})

describe("schedule", () => {
  it("moves a new card out of the New state and counts the rep", () => {
    const { next } = schedule(newCardState(NOW), 3, NOW)
    expect(next.state).not.toBe(0)
    expect(next.reps).toBe(1)
    expect(next.lastReviewAt?.getTime()).toBe(NOW.getTime())
  })

  it("schedules every grade into the future", () => {
    for (const grade of [1, 2, 3, 4] as Grade[]) {
      const { next } = schedule(newCardState(NOW), grade, NOW)
      expect(next.due.getTime()).toBeGreaterThan(NOW.getTime())
    }
  })

  it("gives Easy a later due date than Again", () => {
    const again = schedule(newCardState(NOW), 1, NOW).next
    const easy = schedule(newCardState(NOW), 4, NOW).next
    expect(easy.due.getTime()).toBeGreaterThan(again.due.getTime())
  })

  it("counts a lapse when a learned card is failed", () => {
    // Four Goods is enough to reach the Review state (2).
    const learned = play([3, 3, 3, 3])
    expect(learned.state).toBe(2)
    expect(learned.lapses).toBe(0)

    const lapsed = schedule(learned, 1, learned.due).next
    expect(lapsed.lapses).toBe(1)
  })

  it("shortens the interval after a lapse", () => {
    const learned = play([3, 3, 3, 3])
    const kept = schedule(learned, 3, learned.due).next
    const lapsed = schedule(learned, 1, learned.due).next
    expect(lapsed.scheduledDays).toBeLessThan(kept.scheduledDays)
  })

  it("lengthens the interval as a card keeps being recalled", () => {
    const early = play([3, 3, 3, 3])
    const later = play([3, 3, 3, 3, 3, 3])
    expect(later.scheduledDays).toBeGreaterThan(early.scheduledDays)
  })

  it("logs the state as it was before the answer", () => {
    const learned = play([3, 3, 3, 3])
    const { logged } = schedule(learned, 1, learned.due)
    expect(logged.rating).toBe(1)
    expect(logged.state).toBe(learned.state)
    expect(logged.stability).toBe(learned.stability)
    expect(logged.difficulty).toBe(learned.difficulty)
  })

  it("is pure — the same inputs give the same output, and the input is untouched", () => {
    const state = newCardState(NOW)
    const a = schedule(state, 3, NOW).next
    const b = schedule(state, 3, NOW).next
    expect(a.due.getTime()).toBe(b.due.getTime())
    expect(a.stability).toBe(b.stability)
    expect(state.reps).toBe(0)
  })
})
```

- [ ] **Step 3: Run them and watch them fail**

```bash
corepack yarn workspace web test srs
```

Expected: FAIL, cannot resolve `@/app/_lib/srs/schedule`.

- [ ] **Step 4: Write the scheduler**

Create `apps/web/app/_lib/srs/schedule.ts`:

```ts
import { createEmptyCard, fsrs, type Card, type Grade as FsrsGrade } from "ts-fsrs"

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
    state: state.state,
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
  } as Card
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
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
corepack yarn workspace web test srs
```

Expected: PASS, 9 tests.

If "moves a new card out of the New state" fails because `reps` is 0, the mapping in `toFsrsCard` is wrong — check that every field name matches the snake_case ts-fsrs `Card`. If the lapse tests fail because the card never reaches state 2, raise the number of Goods in `play([3, 3, 3, 3])` until `learned.state` is 2, and update both tests together.

- [ ] **Step 6: Typecheck**

```bash
corepack yarn workspace web typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json yarn.lock apps/web/app/_lib/srs
git commit -m "feat(srs): add the FSRS scheduler and its unit suite"
```

---

### Task 3: The queue

**Files:**
- Create: `apps/web/app/_lib/srs/queue.ts`
- Create: `apps/web/app/_lib/srs/queue.test.ts`

**Interfaces:**
- Consumes: `schedule.ts` types; `cardStates`, `cards`, `decks`, `courses`, `enrollments` from `@workspace/db`.
- Produces, from `@/app/_lib/srs/queue`:
  - `type QueueCard = { cardId: string; front: string; back: string; isNew: boolean }`
  - `interleave(due: QueueCard[], fresh: QueueCard[]): QueueCard[]` — pure
  - `NEW_CARDS_PER_DAY = 20`
  - `dueQueue(userId: string, courseId: string, limit?: number): Promise<QueueCard[]>` — server-only
  - `dueCount(userId: string, courseId: string): Promise<number>` — server-only

- [ ] **Step 1: Write the failing test for the pure part**

The SQL is covered by the Playwright path in Task 6; unit-testing it would mean asserting against a mocked query builder, which tests the mock. The ordering rule is pure and is tested here.

Create `apps/web/app/_lib/srs/queue.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { interleave, type QueueCard } from "@/app/_lib/srs/queue"

const card = (id: string, isNew: boolean): QueueCard => ({
  cardId: id,
  front: id,
  back: id,
  isNew,
})

describe("interleave", () => {
  it("leads with a due card when both lists have entries", () => {
    const out = interleave([card("d1", false)], [card("n1", true)])
    expect(out[0]!.cardId).toBe("d1")
  })

  it("keeps every card exactly once", () => {
    const out = interleave(
      [card("d1", false), card("d2", false)],
      [card("n1", true), card("n2", true)]
    )
    expect(out.map((c) => c.cardId).sort()).toEqual(["d1", "d2", "n1", "n2"])
  })

  it("alternates rather than emptying one list first", () => {
    const out = interleave(
      [card("d1", false), card("d2", false)],
      [card("n1", true), card("n2", true)]
    )
    expect(out.map((c) => c.isNew)).toEqual([false, true, false, true])
  })

  it("appends the remainder when the lists differ in length", () => {
    const out = interleave(
      [card("d1", false)],
      [card("n1", true), card("n2", true), card("n3", true)]
    )
    expect(out.map((c) => c.cardId)).toEqual(["d1", "n1", "n2", "n3"])
  })

  it("handles either list being empty", () => {
    expect(interleave([], [card("n1", true)]).map((c) => c.cardId)).toEqual([
      "n1",
    ])
    expect(interleave([card("d1", false)], []).map((c) => c.cardId)).toEqual([
      "d1",
    ])
    expect(interleave([], [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
corepack yarn workspace web test queue
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write the queue module**

Create `apps/web/app/_lib/srs/queue.ts`:

```ts
import "server-only"

import {
  cardStates,
  cards,
  courses,
  db,
  decks,
  enrollments,
} from "@workspace/db"
import { and, asc, count, eq, isNull, lte, sql } from "drizzle-orm"

/**
 * Building a study session. Two index-only queries rather than one clever
 * join: "what is overdue" goes straight down `card_state_user_due_idx`, and
 * "what has this student never seen" is a separate left-join-is-null. They
 * are then interleaved in memory.
 *
 * The daily new-card cap is the knob that stops a student being handed 400
 * cards on day one and never coming back.
 *
 * @spec L2-SRS-04
 */

export type QueueCard = {
  cardId: string
  front: string
  back: string
  isNew: boolean
}

/** New cards introduced per session. Deliberately conservative. */
export const NEW_CARDS_PER_DAY = 20

/**
 * Alternate due and new cards, due first, appending whatever is left over.
 * Pure, so the ordering rule is testable without a database.
 */
export function interleave(due: QueueCard[], fresh: QueueCard[]): QueueCard[] {
  const out: QueueCard[] = []
  const max = Math.max(due.length, fresh.length)
  for (let i = 0; i < max; i++) {
    if (i < due.length) out.push(due[i]!)
    if (i < fresh.length) out.push(fresh[i]!)
  }
  return out
}

/**
 * Guard: the course this student may study, or null. Enrolment AND publication
 * are both required — a draft course is invisible even to enrolled students
 * (`L2-COURSE-09`).
 */
async function studiableCourse(userId: string, courseId: string) {
  const [row] = await db
    .select({ id: courses.id })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, courseId),
        eq(courses.status, "published")
      )
    )
  return row?.id ?? null
}

/** How many cards are waiting. Drives the dashboard badge. */
export async function dueCount(userId: string, courseId: string) {
  if (!(await studiableCourse(userId, courseId))) return 0

  const [row] = await db
    .select({ n: count() })
    .from(cardStates)
    .innerJoin(cards, eq(cards.id, cardStates.cardId))
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .where(
      and(
        eq(cardStates.userId, userId),
        eq(decks.courseId, courseId),
        lte(cardStates.due, new Date())
      )
    )
  return row?.n ?? 0
}

/** The session queue: overdue cards interleaved with a capped batch of new ones. */
export async function dueQueue(
  userId: string,
  courseId: string,
  limit = 50
): Promise<QueueCard[]> {
  if (!(await studiableCourse(userId, courseId))) return []

  const due = await db
    .select({ cardId: cards.id, front: cards.front, back: cards.back })
    .from(cardStates)
    .innerJoin(cards, eq(cards.id, cardStates.cardId))
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .where(
      and(
        eq(cardStates.userId, userId),
        eq(decks.courseId, courseId),
        lte(cardStates.due, new Date())
      )
    )
    .orderBy(asc(cardStates.due))
    .limit(limit)

  const fresh = await db
    .select({ cardId: cards.id, front: cards.front, back: cards.back })
    .from(cards)
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .leftJoin(
      cardStates,
      and(
        eq(cardStates.cardId, cards.id),
        eq(cardStates.userId, sql`${userId}`)
      )
    )
    .where(and(eq(decks.courseId, courseId), isNull(cardStates.id)))
    .orderBy(asc(decks.position), asc(cards.position), asc(cards.createdAt))
    .limit(NEW_CARDS_PER_DAY)

  return interleave(
    due.map((c) => ({ ...c, isNew: false })),
    fresh.map((c) => ({ ...c, isNew: true }))
  )
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
corepack yarn workspace web test queue
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck**

```bash
corepack yarn workspace web typecheck
```

If the `leftJoin` condition rejects `sql\`${userId}\``, replace that line with `eq(cardStates.userId, userId)` — the parameterisation is equivalent; the `sql` wrapper is only there to force a bound parameter in the join condition rather than the WHERE clause.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_lib/srs
git commit -m "feat(srs): build the study queue from due and new cards"
```

---

### Task 4: Answering a card

**Files:**
- Create: `apps/web/app/learn/study/[courseId]/_actions.ts`
- Create: `apps/web/app/_lib/srs/index.ts`

**Interfaces:**
- Consumes: `schedule`, `newCardState` from Task 2; `requireMembership` from plan 1.
- Produces:
  - `@/app/_lib/srs` re-exports everything from `schedule.ts` and `queue.ts`
  - `answerCard(cardId: string, grade: Grade): Promise<{ ok: boolean; message?: string }>`

- [ ] **Step 1: Write the barrel**

Create `apps/web/app/_lib/srs/index.ts`:

```ts
/**
 * Spaced repetition: the scheduler and the queue.
 *
 * SERVER ONLY. `queue.ts` imports `server-only`, so this barrel poisons any
 * client component that touches it. Client components import
 * `./schedule` directly for values, and `./queue` with `import type`.
 *
 * @spec L2-SRS-03, L2-SRS-04
 */
export * from "./schedule"
export * from "./queue"
```

- [ ] **Step 2: Write the action**

Create `apps/web/app/learn/study/[courseId]/_actions.ts`:

```ts
"use server"

import {
  cardStates,
  cards,
  courses,
  db,
  decks,
  enrollments,
  reviewLogs,
} from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireMembership } from "@/app/_lib/school"
import { newCardState, schedule, type Grade } from "@/app/_lib/srs"

/**
 * Record one answer. The whole write path of the product:
 * read state → schedule() → one update and one insert, in a transaction.
 *
 * Always scoped to the session's own user id, never one from the client —
 * the same rule `L2-AUTH-27` applies to account actions, and here it is what
 * stops a student writing another student's progress.
 *
 * Nothing else runs. There is no job that recomputes schedules later.
 *
 * @spec L2-SRS-05, L2-SRS-06
 */

export async function answerCard(cardId: string, grade: Grade) {
  const member = await requireMembership()

  if (![1, 2, 3, 4].includes(grade)) {
    return { ok: false, message: "Unknown rating." }
  }

  // Enrolment + publication, proven by join. The card id alone grants nothing.
  const [allowed] = await db
    .select({ cardId: cards.id })
    .from(cards)
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .innerJoin(courses, eq(courses.id, decks.courseId))
    .innerJoin(enrollments, eq(enrollments.courseId, courses.id))
    .where(
      and(
        eq(cards.id, cardId),
        eq(enrollments.userId, member.userId),
        eq(courses.status, "published")
      )
    )
  if (!allowed) return { ok: false, message: "Card not available." }

  const now = new Date()

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(cardStates)
      .where(
        and(eq(cardStates.userId, member.userId), eq(cardStates.cardId, cardId))
      )

    const current = existing
      ? {
          due: existing.due,
          stability: existing.stability,
          difficulty: existing.difficulty,
          scheduledDays: existing.scheduledDays,
          learningSteps: existing.learningSteps,
          reps: existing.reps,
          lapses: existing.lapses,
          state: existing.state,
          lastReviewAt: existing.lastReviewAt,
        }
      : newCardState(now)

    const { next, logged } = schedule(current, grade, now)

    await tx
      .insert(cardStates)
      .values({ userId: member.userId, cardId, ...next })
      .onConflictDoUpdate({
        target: [cardStates.userId, cardStates.cardId],
        set: next,
      })

    await tx.insert(reviewLogs).values({
      userId: member.userId,
      cardId,
      rating: logged.rating,
      state: logged.state,
      stability: logged.stability,
      difficulty: logged.difficulty,
      scheduledDays: logged.scheduledDays,
      reviewedAt: now,
    })
  })

  return { ok: true }
}
```

- [ ] **Step 3: Typecheck**

```bash
corepack yarn workspace web typecheck
```

Expected: clean. If the `set: next` spread is rejected because `MemoryState` carries a `lastReviewAt: Date | null` that Drizzle types as optional, write the object out field by field instead of spreading.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/_lib/srs/index.ts apps/web/app/learn/study
git commit -m "feat(srs): record answers and reschedule in one transaction"
```

---

### Task 5: The student experience

**Files:**
- Modify: `apps/web/app/learn/page.tsx` (replace the plan 1 placeholder body)
- Create: `apps/web/app/learn/study/[courseId]/page.tsx`
- Create: `apps/web/app/learn/study/[courseId]/_components/study-session.tsx`

**Interfaces:**
- Consumes: `dueQueue`, `dueCount`, `GRADES` from `@/app/_lib/srs`; `answerCard` from Task 4; `Markdown` from plan 2.
- Produces: routes `/learn` (dashboard) and `/learn/study/[courseId]`.

- [ ] **Step 1: Replace the dashboard**

Replace the whole body of `apps/web/app/learn/page.tsx`:

```tsx
import Link from "next/link"

import { courses, db, enrollments } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireMembership } from "@/app/_lib/school"
import { dueCount } from "@/app/_lib/srs"

/**
 * Student dashboard: enrolled, published courses and what is waiting in each.
 * Draft courses are absent even when enrolled (`L2-COURSE-09`).
 *
 * @spec L2-SRS-07
 */
export default async function LearnHomePage() {
  const member = await requireMembership()

  const enrolled = await db
    .select({ id: courses.id, title: courses.title })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        eq(enrollments.userId, member.userId),
        eq(courses.status, "published")
      )
    )
    .orderBy(courses.title)

  const withCounts = await Promise.all(
    enrolled.map(async (c) => ({
      ...c,
      due: await dueCount(member.userId, c.id),
    }))
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your courses</h1>

      <ul className="divide-y">
        {withCounts.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3">
            <Link href={`/learn/study/${c.id}`} className="hover:underline">
              {c.title}
            </Link>
            <span className="text-muted-foreground ml-auto text-sm">
              {c.due > 0 ? `${c.due} due` : "Nothing due"}
            </span>
          </li>
        ))}
        {withCounts.length === 0 && (
          <li className="text-muted-foreground py-3 text-sm">
            You are not enrolled in any published courses yet.
          </li>
        )}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Write the study session component**

Create `apps/web/app/learn/study/[courseId]/_components/study-session.tsx`. The queue is held client-side and each answer posts as it happens, so a dropped connection costs one answer rather than the session.

```tsx
"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

// NOT from the `@/app/_lib/srs` barrel: that re-exports `queue.ts`, which
// imports `server-only` and would fail this client build. Values come from
// `schedule` (pure); the queue type is imported as a type, so it is erased.
import { GRADES, type Grade } from "@/app/_lib/srs/schedule"
import type { QueueCard } from "@/app/_lib/srs/queue"
import { answerCard } from "../_actions"

/**
 * The study screen: front, reveal, rate, next. Keyboard-driven — space or
 * enter reveals, 1-4 rate — because a session is dozens of repetitions and
 * reaching for a mouse each time is the difference between a habit and a chore.
 */
export function StudySession({ queue }: { queue: QueueCard[] }) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [pending, start] = useTransition()

  const card = queue[index]

  function rate(grade: Grade) {
    if (!card) return
    const cardId = card.cardId
    start(async () => {
      await answerCard(cardId, grade)
      setRevealed(false)
      setIndex((i) => i + 1)
    })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card || pending) return
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault()
        setRevealed(true)
        return
      }
      if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault()
        rate(Number(e.key) as Grade)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!card) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg">Nothing left to review.</p>
        <Link href="/learn" className="text-sm underline">
          Back to your courses
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-xs">
        {index + 1} of {queue.length}
        {card.isNew && " · new"}
      </p>

      <div className="min-h-32 rounded-lg border p-6 text-lg whitespace-pre-wrap">
        {card.front}
      </div>

      {revealed ? (
        <>
          <div className="min-h-32 rounded-lg border p-6 whitespace-pre-wrap">
            {card.back}
          </div>
          <div className="flex gap-2">
            {GRADES.map((g) => (
              <Button
                key={g.value}
                variant={g.value === 1 ? "destructive" : "outline"}
                disabled={pending}
                onClick={() => rate(g.value)}
              >
                {g.label}
                <span className="text-muted-foreground ml-2 text-xs">
                  {g.value}
                </span>
              </Button>
            ))}
          </div>
        </>
      ) : (
        <Button onClick={() => setRevealed(true)}>Show answer</Button>
      )}
    </div>
  )
}
```

Note: the card text renders as plain preformatted text here, not markdown, because `Markdown` is a server component and the queue lives in the client. Rendering markdown in the session is a follow-up (move `Markdown` to a client-safe module, or pre-render each side on the server and pass the HTML). Say so in `docs/notes/srs.md` rather than leaving it implicit.

- [ ] **Step 3: Write the study page**

Create `apps/web/app/learn/study/[courseId]/page.tsx`:

```tsx
import { notFound } from "next/navigation"

import { courses, db, enrollments } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireMembership } from "@/app/_lib/school"
import { dueQueue } from "@/app/_lib/srs"
import { StudySession } from "./_components/study-session"

/**
 * A study session. The queue is a snapshot taken here: a card deleted
 * mid-session simply fails its `answerCard` guard and the session moves on.
 *
 * @spec L2-SRS-07
 */
export default async function StudyPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const member = await requireMembership()

  const [course] = await db
    .select({ id: courses.id, title: courses.title })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        eq(enrollments.userId, member.userId),
        eq(enrollments.courseId, courseId),
        eq(courses.status, "published")
      )
    )
  if (!course) notFound()

  const queue = await dueQueue(member.userId, course.id)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{course.title}</h1>
      <StudySession queue={queue} />
    </div>
  )
}
```

- [ ] **Step 4: Verify the whole loop by hand**

```bash
corepack yarn dev
```

1. As a teacher, publish a course with at least three cards and enrol a student.
2. Sign in as that student. `/learn` shows the course with a due count equal to the card count.
3. Open it, reveal, rate every card. The counter advances and the session ends with "Nothing left to review."
4. Return to `/learn`. The due count is now 0, because everything was scheduled into the future.
5. Confirm the writes:

```bash
docker exec backflip-db psql -U backflip -d backflip -c \
  "select rating, count(*) from review_log group by rating order by rating;"
docker exec backflip-db psql -U backflip -d backflip -c \
  "select state, reps, lapses, due from card_state order by due;"
```

Expected: one `review_log` row per answer, one `card_state` row per card, every `due` in the future, and cards rated Again due sooner than cards rated Easy.

6. Rate one card Again, finish, then reload `/learn`. Expected: that card is due again within minutes, so the count is 1 rather than 0 once its due time passes.

- [ ] **Step 5: Typecheck, lint, full unit suite**

```bash
corepack yarn workspace web typecheck && corepack yarn workspace web lint && corepack yarn workspace web test
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/learn
git commit -m "feat(learn): add the student dashboard and study screen"
```

---

### Task 6: Teacher progress, e2e, and docs

**Files:**
- Create: `apps/web/app/learn/courses/[courseId]/progress/page.tsx`
- Modify: `apps/web/app/learn/courses/[courseId]/_components/course-header.tsx` (add a link)
- Create: `apps/web/e2e/learn.spec.ts`
- Modify: `apps/web/e2e/global-setup.ts`
- Create: `docs/contracts/srs.md`, `docs/notes/srs.md`
- Modify: `docs/contracts/testing.md`, `docs/notes/testing.md`

**Interfaces:**
- Consumes: everything above.
- Produces: `/learn/courses/[courseId]/progress`, and a Playwright spec covering the loop.

- [ ] **Step 1: Write the progress page**

Create `apps/web/app/learn/courses/[courseId]/progress/page.tsx`. One table, read straight from `card_state`. No charts in v1.

```tsx
import { notFound } from "next/navigation"

import {
  cardStates,
  cards,
  courses,
  db,
  decks,
  enrollments,
  users,
} from "@workspace/db"
import { and, count, eq, lte, max, sql } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"

/**
 * Per-course progress: who is studying and who has stalled. Deliberately one
 * table — retention curves want real data behind them first.
 *
 * @spec L2-SRS-08
 */
export default async function ProgressPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const teacher = await requireTeacher()

  const [course] = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId)))
  if (!course) notFound()

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      seen: count(cardStates.id),
      due: sql<number>`count(*) filter (where ${cardStates.due} <= now())`,
      lastStudied: max(cardStates.lastReviewAt),
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .leftJoin(cardStates, eq(cardStates.userId, enrollments.userId))
    .leftJoin(cards, eq(cards.id, cardStates.cardId))
    .leftJoin(decks, and(eq(decks.id, cards.deckId), eq(decks.courseId, course.id)))
    .where(eq(enrollments.courseId, course.id))
    .groupBy(users.id)
    .orderBy(users.email)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{course.title} — progress</h1>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-2 font-medium">Student</th>
            <th className="py-2 font-medium">Cards seen</th>
            <th className="py-2 font-medium">Due now</th>
            <th className="py-2 font-medium">Last studied</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="border-b">
              <td className="py-2">{r.name ?? r.email}</td>
              <td className="py-2">{r.seen}</td>
              <td className="py-2">{r.due}</td>
              <td className="py-2">
                {r.lastStudied
                  ? new Date(r.lastStudied).toLocaleDateString()
                  : "Never"}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="text-muted-foreground py-4">
                Nobody enrolled yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Link progress from the course header**

In `apps/web/app/learn/courses/[courseId]/_components/course-header.tsx`, add next to the Students link added in plan 2:

```tsx
      <Link
        href={`/learn/courses/${courseId}/progress`}
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        Progress
      </Link>
```

and move `ml-auto` onto the Students link if it is not already there, so both sit right.

- [ ] **Step 3: Extend the e2e fixtures**

In `apps/web/e2e/global-setup.ts`, after the existing owner/teammate fixtures are seeded, add a school, two members and their password hashes. Follow the file's existing bcrypt + insert style; the fixtures to add are:

- `teacher@e2e.test` — a `user` row with a bcrypt password, plus a `school_member` row with role `teacher` in the seeded school.
- `student@e2e.test` — same, role `student`.

Also add `card_state`, `review_log`, `enrollment`, `card`, `deck`, `course`, `school_member` to the truncate list, in that order (children before parents), so a rerun starts clean.

- [ ] **Step 4: Write the e2e spec**

Create `apps/web/e2e/learn.spec.ts`, following the sign-in helper style of the existing specs:

```ts
import { expect, test } from "@playwright/test"

/**
 * The two paths that matter: a teacher authors and enrols, a student studies.
 * Everything else about scheduling is unit-tested (`_lib/srs/schedule.test.ts`).
 *
 * @spec L2-TEST-06, L2-SRS-09
 */

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/backflip/login")
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill("e2e-password")
  await page.getByRole("button", { name: /sign in/i }).click()
  await page.waitForURL(/\/backflip/)
}

test("a student cannot reach the teacher's course list", async ({ page }) => {
  await signIn(page, "student@e2e.test")
  await page.goto("/learn/courses")
  await expect(page).toHaveURL(/\/learn$/)
})

test("teacher authors a course and a student studies it", async ({ page }) => {
  await signIn(page, "teacher@e2e.test")

  await page.goto("/learn/courses")
  await page.getByLabel("Title").fill("E2E Biology")
  await page.getByRole("button", { name: /create course/i }).click()
  await page.getByRole("link", { name: "E2E Biology" }).click()

  await page.getByPlaceholder("New deck title").fill("Cells")
  await page.getByRole("button", { name: /add deck/i }).click()
  await page.getByRole("link", { name: "Cells" }).click()

  await page.getByLabel(/front/i).fill("What is ATP?")
  await page.getByLabel(/back/i).fill("Adenosine triphosphate")
  await page.getByRole("button", { name: /add card/i }).click()
  await expect(page.getByText("What is ATP?")).toBeVisible()

  await page.goBack()
  await page.getByRole("link", { name: /students/i }).click()
  await page.getByRole("button", { name: /enrol/i }).click()

  await page.goBack()
  await page.getByRole("button", { name: /publish/i }).click()

  // Now study it as the student.
  await page.goto("/api/auth/signout")
  await page.getByRole("button", { name: /sign out/i }).click()
  await signIn(page, "student@e2e.test")

  await page.goto("/learn")
  await expect(page.getByText("1 due")).toBeVisible()

  await page.getByRole("link", { name: "E2E Biology" }).click()
  await page.getByRole("button", { name: /show answer/i }).click()
  await expect(page.getByText("Adenosine triphosphate")).toBeVisible()
  await page.getByRole("button", { name: /^good/i }).click()

  await expect(page.getByText(/nothing left to review/i)).toBeVisible()

  await page.goto("/learn")
  await expect(page.getByText("Nothing due")).toBeVisible()
})
```

- [ ] **Step 5: Run the e2e suite**

```bash
docker compose up -d
corepack yarn workspace web test:e2e
```

Expected: both new tests pass alongside the existing auth specs. If a selector misses, fix the selector rather than loosening the assertion — the assertions are the point.

- [ ] **Step 6: Write the L2 contract**

Create `docs/contracts/srs.md`, following the shape of `docs/contracts/school.md`:

- `L2-SRS-01` / `L2-SRS-02` — `card_state` and `review_log`, citing `L2-DB-44`/`L2-DB-45`. `card_state` is per (student, card); `card_state_user_due_idx` on `(userId, due)` serves the queue.
- `L2-SRS-03` — `@/app/_lib/srs/schedule` → `Grade`, `MemoryState`, `ReviewOutcome`, `newCardState`, `schedule`, `GRADES`. Pure: `now` is a parameter, no DB, no clock. Fuzz off, so scheduling is deterministic.
- `L2-SRS-04` — `@/app/_lib/srs/queue` → `interleave` (pure), `dueQueue`, `dueCount`, `NEW_CARDS_PER_DAY` (20). Two index-only queries interleaved in memory; the new-card cap bounds a first session.
- `L2-SRS-05` — Ratings are the four FSRS grades (Again 1 … Easy 4), self-assessed after reveal. No auto-grading in v1.
- `L2-SRS-06` — `answerCard(cardId, grade)` — the only write path. Scoped to `session.user.id`, never a client id. Proves enrolment and publication by join. One transaction: upsert `card_state`, insert `review_log`. **No scheduled job exists** — nothing recomputes schedules in the background, by design (droplet constraint).
- `L2-SRS-07` — Student routes: `/learn` (enrolled published courses + due counts), `/learn/study/[courseId]` (session). The queue is a server-side snapshot; a card deleted mid-session fails `answerCard`'s guard and the session continues.
- `L2-SRS-08` — `/learn/courses/[courseId]/progress` (teacher) — one table: cards seen, due now, last studied. No charts in v1.
- `L2-SRS-09` — `ts-fsrs` is pinned to an exact version and imported only by `_lib/srs`. A minor bump changes default parameters and would silently reschedule every student's cards.

Create `docs/notes/srs.md` with the module inventory, the manual verification steps from Task 5, and the known follow-up: the study screen renders card text as preformatted text rather than markdown, because `Markdown` is a server component.

- [ ] **Step 7: Update the testing docs**

In `docs/contracts/testing.md`, extend `L2-TEST-03` with the new fixtures and truncate list, and `L2-TEST-06` with the scheduler unit suite and the two `/learn` e2e paths. Mirror in `docs/notes/testing.md`.

- [ ] **Step 8: Full verification**

```bash
corepack yarn workspace web test \
  && corepack yarn workspace web typecheck \
  && corepack yarn workspace web lint \
  && corepack yarn workspace web test:e2e
```

Expected: all four green. Do not claim completion on any subset.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/learn apps/web/e2e docs/contracts docs/notes
git commit -m "feat(learn): add teacher progress and cover the review loop e2e"
```

---

## Done when

- A student studies a course end to end, and the due count drops to zero afterwards.
- A card rated Again returns sooner than one rated Easy — verified in the unit suite and visible in `card_state`.
- `review_log` gains exactly one row per answer.
- No cron, worker, queue or Redis was added. `grep -rn "node-cron\|bullmq\|ioredis" apps packages` returns nothing.
- Unit, typecheck, lint and e2e are all green.
- `docs/contracts/srs.md` and `docs/notes/srs.md` exist; `db.md` and `testing.md` are current.

## After v1

In rough order of value: render markdown on the study screen; image upload into `shared/`; retention charts on the progress page; exams; AI-assisted card generation from lesson text; FSRS parameter optimisation trained on `review_log`.

## L1 amendment still outstanding

`docs/constitution.md` remains untouched, and by the end of plan 3 it describes a foundation platform that no longer matches the code. A human must rewrite it: new purpose, a domain model covering school, course, deck, card and review, a third surface in `L1-ARCH-01`, a replacement for `L1-CON-03`, `ts-fsrs` in the stack list, and `school`, `courses` and `srs` added to the governed-domains list. A draft for review sits at the end of the spec's "Documentation impact" section.
