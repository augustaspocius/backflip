import { notFound } from "next/navigation"

import {
  cardStates,
  cards,
  courses,
  db,
  decks,
  enrollments,
  users,
} from "@workspace/db"
import { and, count, eq, lte, max, sql } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"

/**
 * Per-course progress: who is studying and who has stalled. Deliberately one
 * table; retention curves want real data behind them first.
 *
 * Rows are the students enrolled in THIS course (every review query reaches
 * `card_state` through `enrollment`, `L2-COURSE-08`). Their `card_state`
 * rows are aggregated in a subquery that is itself restricted to this
 * course's cards, so progress in other courses never leaks into the counts.
 * "Due now" counts reviewed cards only: it reads `card_state` straight, and a
 * card nobody has answered has no row there.
 *
 * `now` is a JS `Date` bound through the column (`lte`), not SQL `now()`:
 * `due` is `timestamp without time zone` written from JS Dates, so the
 * comparison must use the same kind of value the writes did.
 *
 * @spec L2-SRS-08
 */
export default async function ProgressPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const teacher = await requireTeacher()

  const [course] = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(
      and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId))
    )
  if (!course) notFound()

  const now = new Date()

  const progress = db
    .select({
      userId: cardStates.userId,
      seen: count().as("seen"),
      due: sql<number>`count(*) filter (where ${lte(cardStates.due, now)})`.as(
        "due"
      ),
      lastStudied: max(cardStates.lastReviewAt).as("lastStudied"),
    })
    .from(cardStates)
    .innerJoin(cards, eq(cards.id, cardStates.cardId))
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .where(eq(decks.courseId, course.id))
    .groupBy(cardStates.userId)
    .as("progress")

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      seen: sql<number>`coalesce(${progress.seen}, 0)`.mapWith(Number),
      due: sql<number>`coalesce(${progress.due}, 0)`.mapWith(Number),
      lastStudied: progress.lastStudied,
    })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .leftJoin(progress, eq(progress.userId, enrollments.userId))
    .where(eq(enrollments.courseId, course.id))
    .orderBy(users.email)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{course.title}: progress</h1>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">Student</th>
            <th className="py-2 font-medium">Cards seen</th>
            <th
              className="py-2 font-medium"
              title="Reviewed cards whose next review is due. Cards the student has never answered are not counted."
            >
              Due now
            </th>
            <th className="py-2 font-medium">Last studied</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className="border-b">
              <td className="py-2">
                {r.name ?? r.email}
                {r.name && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.email}
                  </span>
                )}
              </td>
              <td className="py-2">{r.seen}</td>
              <td className="py-2">{r.due}</td>
              <td className="py-2">
                {r.lastStudied
                  ? new Date(r.lastStudied).toISOString().slice(0, 10)
                  : "Never"}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-muted-foreground">
                Nobody enrolled yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
