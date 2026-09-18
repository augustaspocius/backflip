import "server-only"

import {
  cardStates,
  cards,
  courses,
  db,
  decks,
  enrollments,
  reviewLogs,
} from "@workspace/db"
import { and, asc, count, eq, gte, isNull, lte } from "drizzle-orm"

/**
 * Building a study session. Two index-only queries rather than one clever
 * join: "what is overdue" goes straight down `card_state_user_due_idx`, and
 * "what has this student never seen" is a separate left-join-is-null. They
 * are then interleaved in memory.
 *
 * The daily new-card cap is the knob that stops a student being handed 400
 * cards on day one and never coming back. It is a DAILY cap, not a
 * per-query one: it is derived each call from how many cards this student
 * has already been introduced to today (`review_log` rows with
 * `state = 0`, i.e. the card's very first answer), counted from UTC
 * midnight. Reloading the page does not hand out a fresh batch.
 *
 * @spec L2-SRS-04
 */

export type QueueCard = {
  cardId: string
  front: string
  back: string
  isNew: boolean
}

/** New cards introduced per UTC day. Deliberately conservative. */
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
 * How many new cards may still be introduced today, given how many already
 * were. Pure: the arithmetic half of the daily cap, testable without a
 * database. Never negative, even past the cap.
 */
export function newCardAllowance(introducedToday: number): number {
  return Math.max(0, NEW_CARDS_PER_DAY - introducedToday)
}

/**
 * Midnight UTC of the day `now` falls on. The daily new-card cap resets
 * here, not at local midnight — a student far from UTC sees the reset at an
 * odd local hour. Known trade-off, no per-user timezone in v1.
 */
export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
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

/**
 * How many new cards this student may still be introduced to today, in this
 * course. Shared by `dueQueue` (caps the fresh-card query) and `dueCount`
 * (caps how many unseen cards count toward the badge).
 */
async function remainingNewCardAllowance(
  userId: string,
  courseId: string,
  now: Date
) {
  const [row] = await db
    .select({ n: count() })
    .from(reviewLogs)
    .innerJoin(cards, eq(cards.id, reviewLogs.cardId))
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .where(
      and(
        eq(reviewLogs.userId, userId),
        eq(decks.courseId, courseId),
        eq(reviewLogs.state, 0),
        gte(reviewLogs.reviewedAt, startOfUtcDay(now))
      )
    )
  return newCardAllowance(row?.n ?? 0)
}

/**
 * How many cards are waiting: reviewed cards already due, plus however many
 * unseen cards fit inside today's remaining new-card allowance. Drives the
 * dashboard badge — a freshly enrolled, never-studied course still counts
 * its first card as due rather than reporting nothing.
 */
export async function dueCount(
  userId: string,
  courseId: string,
  now: Date = new Date()
): Promise<number> {
  if (!(await studiableCourse(userId, courseId))) return 0

  const [reviewedRow] = await db
    .select({ n: count() })
    .from(cardStates)
    .innerJoin(cards, eq(cards.id, cardStates.cardId))
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .where(
      and(
        eq(cardStates.userId, userId),
        eq(decks.courseId, courseId),
        lte(cardStates.due, now)
      )
    )
  const reviewed = reviewedRow?.n ?? 0

  const remaining = await remainingNewCardAllowance(userId, courseId, now)
  if (remaining === 0) return reviewed

  const [unseenRow] = await db
    .select({ n: count() })
    .from(cards)
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .leftJoin(
      cardStates,
      and(eq(cardStates.cardId, cards.id), eq(cardStates.userId, userId))
    )
    .where(and(eq(decks.courseId, courseId), isNull(cardStates.id)))
  const unseen = unseenRow?.n ?? 0

  return reviewed + Math.min(unseen, remaining)
}

/** The session queue: overdue cards interleaved with a capped batch of new ones. */
export async function dueQueue(
  userId: string,
  courseId: string,
  limit = 50,
  now: Date = new Date()
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
        lte(cardStates.due, now)
      )
    )
    .orderBy(asc(cardStates.due))
    .limit(limit)

  const remaining = await remainingNewCardAllowance(userId, courseId, now)
  const fresh =
    remaining === 0
      ? []
      : await db
          .select({ cardId: cards.id, front: cards.front, back: cards.back })
          .from(cards)
          .innerJoin(decks, eq(decks.id, cards.deckId))
          .leftJoin(
            cardStates,
            and(eq(cardStates.cardId, cards.id), eq(cardStates.userId, userId))
          )
          .where(and(eq(decks.courseId, courseId), isNull(cardStates.id)))
          .orderBy(
            asc(decks.position),
            asc(cards.position),
            asc(cards.createdAt)
          )
          .limit(remaining)

  return interleave(
    due.map((c) => ({ ...c, isNew: false })),
    fresh.map((c) => ({ ...c, isNew: true }))
  )
}
