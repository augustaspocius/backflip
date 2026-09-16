"use server"

import { revalidatePath } from "next/cache"

import { cards, courses, db, decks } from "@workspace/db"
import { and, eq, inArray } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { firstError } from "@/app/_lib/validation"
import { cardSchema, deckSchema } from "@/app/learn/_lib/course-validation"
import type { ActionState } from "../_actions"

/**
 * Deck and card authoring. Ownership is proven by joining up to the course and
 * matching the teacher's school — an id posted from the client is only ever a
 * lookup key, never evidence of access (`L2-SCHOOL-06`).
 *
 * Every UPDATE/DELETE here proves ownership inside its own WHERE clause (a
 * subquery scoped to the teacher's school), the same no-window-between-
 * check-and-write shape `courses/_actions.ts` uses — never a preceding
 * SELECT followed by an unscoped write. INSERTs (`createDeck`, `createCard`)
 * are the one exception, and necessarily so: there is no existing row for an
 * INSERT to scope itself by, so checking the parent (course/deck) belongs to
 * the teacher's school beforehand is the only option.
 *
 * @spec L2-COURSE-06
 */

export async function createDeck(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const courseId = String(formData.get("courseId") ?? "")

  const parsed = deckSchema.safeParse({ title: String(formData.get("title") ?? "") })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  // INSERT has no existing row to scope itself by, so the parent course's
  // school is checked beforehand — the one place a preceding check is
  // unavoidable rather than a shortcut around the self-scoping rule below.
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId)))
  if (!course) return { ok: false, message: "Course not found." }

  await db.insert(decks).values({ courseId, title: parsed.data.title })

  revalidatePath(`/learn/courses/${courseId}`)
  return { ok: true, message: "Deck added." }
}

export async function deleteDeck(deckId: string): Promise<ActionState> {
  const teacher = await requireTeacher()

  const deleted = await db
    .delete(decks)
    .where(
      and(
        eq(decks.id, deckId),
        inArray(
          decks.courseId,
          db
            .select({ id: courses.id })
            .from(courses)
            .where(eq(courses.schoolId, teacher.schoolId))
        )
      )
    )
    .returning({ courseId: decks.courseId })
  if (deleted.length === 0) return { ok: false, message: "Deck not found." }

  revalidatePath(`/learn/courses/${deleted[0]!.courseId}`)
  return { ok: true, message: "Deck deleted." }
}

export async function createCard(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const deckId = String(formData.get("deckId") ?? "")

  const parsed = cardSchema.safeParse({
    front: String(formData.get("front") ?? ""),
    back: String(formData.get("back") ?? ""),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  // INSERT has no existing row to scope itself by, so the parent deck's
  // course/school is checked beforehand — the one place a preceding check is
  // unavoidable rather than a shortcut around the self-scoping rule below.
  const [deck] = await db
    .select({ courseId: decks.courseId })
    .from(decks)
    .innerJoin(courses, eq(courses.id, decks.courseId))
    .where(and(eq(decks.id, deckId), eq(courses.schoolId, teacher.schoolId)))
  if (!deck) return { ok: false, message: "Deck not found." }

  await db.insert(cards).values({
    deckId,
    front: parsed.data.front,
    back: parsed.data.back,
  })

  revalidatePath(`/learn/courses/${deck.courseId}/decks/${deckId}`)
  return { ok: true, message: "Card added." }
}

export async function updateCard(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const id = String(formData.get("id") ?? "")

  const parsed = cardSchema.safeParse({
    front: String(formData.get("front") ?? ""),
    back: String(formData.get("back") ?? ""),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  const updated = await db
    .update(cards)
    .set({ front: parsed.data.front, back: parsed.data.back, updatedAt: new Date() })
    .where(
      and(
        eq(cards.id, id),
        inArray(
          cards.deckId,
          db
            .select({ id: decks.id })
            .from(decks)
            .innerJoin(courses, eq(courses.id, decks.courseId))
            .where(eq(courses.schoolId, teacher.schoolId))
        )
      )
    )
    .returning({ deckId: cards.deckId })
  if (updated.length === 0) return { ok: false, message: "Card not found." }

  // Path revalidation is not a security operation, so resolving the course
  // id with a plain follow-up lookup (after the scoped write succeeded) is
  // fine — it never gates anything.
  const [deck] = await db
    .select({ courseId: decks.courseId })
    .from(decks)
    .where(eq(decks.id, updated[0]!.deckId))
  if (deck) {
    revalidatePath(`/learn/courses/${deck.courseId}/decks/${updated[0]!.deckId}`)
  }
  return { ok: true, message: "Saved." }
}

export async function deleteCard(cardId: string): Promise<ActionState> {
  const teacher = await requireTeacher()

  const deleted = await db
    .delete(cards)
    .where(
      and(
        eq(cards.id, cardId),
        inArray(
          cards.deckId,
          db
            .select({ id: decks.id })
            .from(decks)
            .innerJoin(courses, eq(courses.id, decks.courseId))
            .where(eq(courses.schoolId, teacher.schoolId))
        )
      )
    )
    .returning({ deckId: cards.deckId })
  if (deleted.length === 0) return { ok: false, message: "Card not found." }

  // Path revalidation is not a security operation, so resolving the course
  // id with a plain follow-up lookup (after the scoped delete succeeded) is
  // fine — it never gates anything.
  const [deck] = await db
    .select({ courseId: decks.courseId })
    .from(decks)
    .where(eq(decks.id, deleted[0]!.deckId))
  if (deck) {
    revalidatePath(`/learn/courses/${deck.courseId}/decks/${deleted[0]!.deckId}`)
  }
  return { ok: true, message: "Card deleted." }
}
