"use server"

import { revalidatePath } from "next/cache"

import { courses, db, enrollments, schoolMembers } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import type { ActionState } from "../../_actions"

/**
 * Enrolment. Both the course and the student are re-verified against the
 * teacher's school, so neither id from the form grants access on its own
 * (`L2-SCHOOL-06`).
 *
 * @spec L2-COURSE-08
 */

export async function enrollStudent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const courseId = String(formData.get("courseId") ?? "")
  const userId = String(formData.get("userId") ?? "")

  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId)))
  if (!course) return { ok: false, message: "Course not found." }

  const [member] = await db
    .select({ userId: schoolMembers.userId })
    .from(schoolMembers)
    .where(
      and(
        eq(schoolMembers.userId, userId),
        eq(schoolMembers.schoolId, teacher.schoolId),
        eq(schoolMembers.role, "student")
      )
    )
  if (!member) return { ok: false, message: "Not a student in this school." }

  // Enrolling twice is a no-op, not an error — the teacher's intent is met.
  await db
    .insert(enrollments)
    .values({ courseId, userId })
    .onConflictDoNothing({
      target: [enrollments.courseId, enrollments.userId],
    })

  revalidatePath(`/learn/courses/${courseId}/students`)
  return { ok: true, message: "Student enrolled." }
}

export async function unenrollStudent(
  courseId: string,
  userId: string
): Promise<ActionState> {
  const teacher = await requireTeacher()

  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId)))
  if (!course) return { ok: false, message: "Course not found." }

  // Their `card_state` rows survive: re-enrolling should resume a schedule,
  // not reset one. Only the enrolment is removed.
  await db
    .delete(enrollments)
    .where(
      and(eq(enrollments.courseId, courseId), eq(enrollments.userId, userId))
    )

  revalidatePath(`/learn/courses/${courseId}/students`)
  return { ok: true, message: "Student removed." }
}
