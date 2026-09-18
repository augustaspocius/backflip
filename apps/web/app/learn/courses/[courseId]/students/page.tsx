import { notFound } from "next/navigation"

import { courses, db, enrollments, schoolMembers, users } from "@workspace/db"
import { and, eq, notInArray } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { EnrollForm } from "./_components/enroll-form"
import { UnenrollButton } from "./_components/unenroll-button"

/**
 * Roster for one course: who is enrolled, and who else could be.
 *
 * @spec L2-COURSE-08
 */
export default async function StudentsPage({
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

  const enrolled = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(eq(enrollments.courseId, course.id))
    .orderBy(users.email)

  const enrolledIds = enrolled.map((e) => e.id)

  const candidateRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(schoolMembers)
    .innerJoin(users, eq(users.id, schoolMembers.userId))
    .where(
      and(
        eq(schoolMembers.schoolId, teacher.schoolId),
        eq(schoolMembers.role, "student"),
        // `notInArray` with an empty list is invalid SQL, so guard it.
        enrolledIds.length > 0 ? notInArray(users.id, enrolledIds) : undefined
      )
    )
    .orderBy(users.email)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{course.title} — students</h1>

      <ul className="divide-y">
        {enrolled.map((s) => (
          <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
            {s.name ?? s.email}
            <span className="text-muted-foreground text-xs">{s.email}</span>
            <span className="ml-auto">
              <UnenrollButton courseId={course.id} userId={s.id} />
            </span>
          </li>
        ))}
        {enrolled.length === 0 && (
          <li className="text-muted-foreground py-2 text-sm">
            Nobody enrolled yet.
          </li>
        )}
      </ul>

      <EnrollForm
        courseId={course.id}
        candidates={candidateRows.map((c) => ({
          id: c.id,
          label: c.name ? `${c.name} (${c.email})` : c.email,
        }))}
      />
    </div>
  )
}
