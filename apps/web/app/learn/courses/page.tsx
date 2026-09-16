import Link from "next/link"

import { cards, courses, db, decks } from "@workspace/db"
import { count, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { CourseForm } from "./_components/course-form"

/**
 * Teacher's course list. Scoped to the teacher's school in the WHERE clause,
 * so a course from another school is unreachable, not merely unlinked.
 *
 * @spec L2-COURSE-06, L2-SCHOOL-06
 */
export default async function CoursesPage() {
  const teacher = await requireTeacher()

  const rows = await db
    .select({
      id: courses.id,
      title: courses.title,
      status: courses.status,
      cardCount: count(cards.id),
    })
    .from(courses)
    .leftJoin(decks, eq(decks.courseId, courses.id))
    .leftJoin(cards, eq(cards.deckId, decks.id))
    .where(eq(courses.schoolId, teacher.schoolId))
    .groupBy(courses.id)
    .orderBy(courses.title)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Courses</h1>

      <ul className="divide-y">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3">
            <Link href={`/learn/courses/${c.id}`} className="hover:underline">
              {c.title}
            </Link>
            <span className="text-muted-foreground text-xs capitalize">
              {c.status}
            </span>
            <span className="text-muted-foreground ml-auto text-xs">
              {c.cardCount} card{c.cardCount === 1 ? "" : "s"}
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-muted-foreground py-3 text-sm">
            No courses yet. Create the first one below.
          </li>
        )}
      </ul>

      <CourseForm />
    </div>
  )
}
