import { notFound } from "next/navigation"

import { courses, db } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { CourseHeader } from "./_components/course-header"

/**
 * Course detail. The school check lives in the WHERE clause, so a course id
 * belonging to another school 404s rather than leaking a title.
 *
 * @spec L2-COURSE-06, L2-SCHOOL-06
 */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const teacher = await requireTeacher()

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId)))

  if (!course) notFound()

  return (
    <div className="space-y-8">
      <CourseHeader
        courseId={course.id}
        title={course.title}
        description={course.description}
        status={course.status}
      />
      <p className="text-muted-foreground text-sm">
        Decks appear here once deck management lands.
      </p>
    </div>
  )
}
