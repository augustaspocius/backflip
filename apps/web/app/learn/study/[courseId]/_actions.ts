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
import type { ActionState } from "@/app/learn/courses/_actions"

/**
 * Record one answer. The whole write path of the product:
 * read state → schedule() → one update and one insert, in a transaction.
 *
 * Always scoped to the session's own user id, never one from the client —
 * the same rule `L2-AUTH-27` applies to account actions, and here it is what
 * stops a student writing another student's progress.
 *
 * `grade` and `cardId` are untrusted: a server action receives whatever a
 * client posts, not just what a well-behaved UI sends. Both are validated
 * before anything touches the database.
 *
 * Nothing else runs. There is no job that recomputes schedules later.
 *
 * @spec L2-SRS-05, L2-SRS-06
 */
export async function answerCard(
  cardId: string,
  grade: Grade
): Promise<ActionState> {
  const member = await requireMembership()

  if (typeof cardId !== "string" || cardId.length === 0) {
    return { ok: false, message: "Card not available." }
  }
  if (!Number.isInteger(grade) || grade < 1 || grade > 4) {
    return { ok: false, message: "Unknown rating." }
  }

  // Enrolment + publication + same school, proven by join. The card id
  // alone grants nothing.
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
        eq(courses.status, "published"),
        eq(courses.schoolId, member.schoolId)
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

  return { ok: true, message: "Saved." }
}
