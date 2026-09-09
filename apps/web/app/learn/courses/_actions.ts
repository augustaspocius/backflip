"use server"

import { revalidatePath } from "next/cache"

import { courses, db } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { firstError } from "@/app/_lib/validation"
import { courseSchema } from "@/app/learn/_lib/course-validation"

/**
 * Course authoring actions. Every one re-resolves the teacher server-side and
 * scopes writes with `schoolId` in the WHERE clause — a course id from the
 * client is never trusted on its own (`L2-SCHOOL-05`, `L2-SCHOOL-06`).
 *
 * @spec L2-COURSE-06
 */

export type ActionState = { ok: boolean; message: string } | null

export async function createCourse(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()

  const parsed = courseSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description:
      formData.get("description") == null
        ? undefined
        : String(formData.get("description")),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  await db.insert(courses).values({
    schoolId: teacher.schoolId,
    ownerId: teacher.userId,
    title: parsed.data.title,
    description: parsed.data.description,
  })

  revalidatePath("/learn/courses")
  return { ok: true, message: "Course created." }
}

export async function updateCourse(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const id = String(formData.get("id") ?? "")

  const parsed = courseSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description:
      formData.get("description") == null
        ? undefined
        : String(formData.get("description")),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  const updated = await db
    .update(courses)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      updatedAt: new Date(),
    })
    .where(and(eq(courses.id, id), eq(courses.schoolId, teacher.schoolId)))
    .returning({ id: courses.id })

  if (updated.length === 0) return { ok: false, message: "Course not found." }

  revalidatePath("/learn/courses")
  revalidatePath(`/learn/courses/${id}`)
  return { ok: true, message: "Saved." }
}

export async function setCourseStatus(
  courseId: string,
  status: "draft" | "published"
): Promise<ActionState> {
  const teacher = await requireTeacher()

  const updated = await db
    .update(courses)
    .set({ status, updatedAt: new Date() })
    .where(
      and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId))
    )
    .returning({ id: courses.id })

  if (updated.length === 0) return { ok: false, message: "Course not found." }

  revalidatePath("/learn/courses")
  revalidatePath(`/learn/courses/${courseId}`)
  return {
    ok: true,
    message: status === "published" ? "Course published." : "Course unpublished.",
  }
}

export async function deleteCourse(courseId: string): Promise<ActionState> {
  const teacher = await requireTeacher()

  // Decks, cards, enrolments and every student's scheduling state go with it,
  // by FK cascade. That is intended: an unpublished mistake should vanish.
  const deleted = await db
    .delete(courses)
    .where(
      and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId))
    )
    .returning({ id: courses.id })

  if (deleted.length === 0) return { ok: false, message: "Course not found." }

  revalidatePath("/learn/courses")
  return { ok: true, message: "Course deleted." }
}
