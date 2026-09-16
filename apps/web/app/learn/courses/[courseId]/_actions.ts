"use server"

import { revalidatePath } from "next/cache"

import { cards, courses, db, decks } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { firstError } from "@/app/_lib/validation"
import { cardSchema, deckSchema } from "@/app/learn/_lib/course-validation"
import type { ActionState } from "../_actions"

/**
 * Deck and card authoring. Ownership is proven by joining up to the course and
 * matching the teacher's school — an id posted from the client is only ever a
 * lookup key, never evidence of access (`L2-SCHOOL-06`).
 *
 * @spec L2-COURSE-06
 */

/** The deck's course id when this teacher may touch it, else null. */
async function courseIdForDeck(deckId: string, schoolId: string) {
  const [row] = await db
    .select({ courseId: decks.courseId })
    .from(decks)
    .innerJoin(courses, eq(courses.id, decks.courseId))
    .where(and(eq(decks.id, deckId), eq(courses.schoolId, schoolId)))
  return row?.courseId ?? null
}

export async function createDeck(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const courseId = String(formData.get("courseId") ?? "")

  const parsed = deckSchema.safeParse({ title: String(formData.get("title") ?? "") })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

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
  const courseId = await courseIdForDeck(deckId, teacher.schoolId)
  if (!courseId) return { ok: false, message: "Deck not found." }

  await db.delete(decks).where(eq(decks.id, deckId))

  revalidatePath(`/learn/courses/${courseId}`)
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

  const courseId = await courseIdForDeck(deckId, teacher.schoolId)
  if (!courseId) return { ok: false, message: "Deck not found." }

  await db.insert(cards).values({
    deckId,
    front: parsed.data.front,
    back: parsed.data.back,
  })

  revalidatePath(`/learn/courses/${courseId}/decks/${deckId}`)
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

  const [owned] = await db
    .select({ deckId: cards.deckId, courseId: decks.courseId })
    .from(cards)
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .innerJoin(courses, eq(courses.id, decks.courseId))
    .where(and(eq(cards.id, id), eq(courses.schoolId, teacher.schoolId)))
  if (!owned) return { ok: false, message: "Card not found." }

  await db
    .update(cards)
    .set({ front: parsed.data.front, back: parsed.data.back, updatedAt: new Date() })
    .where(eq(cards.id, id))

  revalidatePath(`/learn/courses/${owned.courseId}/decks/${owned.deckId}`)
  return { ok: true, message: "Saved." }
}

export async function deleteCard(cardId: string): Promise<ActionState> {
  const teacher = await requireTeacher()

  const [owned] = await db
    .select({ deckId: cards.deckId, courseId: decks.courseId })
    .from(cards)
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .innerJoin(courses, eq(courses.id, decks.courseId))
    .where(and(eq(cards.id, cardId), eq(courses.schoolId, teacher.schoolId)))
  if (!owned) return { ok: false, message: "Card not found." }

  await db.delete(cards).where(eq(cards.id, cardId))

  revalidatePath(`/learn/courses/${owned.courseId}/decks/${owned.deckId}`)
  return { ok: true, message: "Card deleted." }
}
