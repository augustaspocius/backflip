import { notFound } from "next/navigation"

import { cards, courses, db, decks as decksTable } from "@workspace/db"
import { and, count, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { CourseHeader } from "./_components/course-header"
import { DeckList } from "./_components/deck-list"

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

  const deckRows = await db
    .select({
      id: decksTable.id,
      title: decksTable.title,
      cardCount: count(cards.id),
    })
    .from(decksTable)
    .leftJoin(cards, eq(cards.deckId, decksTable.id))
    .where(eq(decksTable.courseId, course.id))
    .groupBy(decksTable.id)
    .orderBy(decksTable.position, decksTable.title)

  return (
    <div className="space-y-8">
      <CourseHeader
        courseId={course.id}
        title={course.title}
        description={course.description}
        status={course.status}
      />
      <DeckList courseId={course.id} decks={deckRows} />
    </div>
  )
}
