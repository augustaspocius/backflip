import { redirect } from "next/navigation"

import { courses, db, enrollments } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireMembership } from "@/app/_lib/school"
import { dueQueue } from "@/app/_lib/srs"
import { Markdown } from "@/app/learn/_components/markdown"
import { StudySession } from "./_components/study-session"

/**
 * A study session. The queue is a snapshot taken here: a card deleted
 * mid-session simply fails its `answerCard` guard and the session moves on.
 * A course the student cannot study (not enrolled, draft, unknown id)
 * redirects to `/learn` rather than showing an error page.
 *
 * Card sides are rendered here, server-side, through `Markdown` and handed
 * to the client session as ready nodes: the client never parses markdown.
 *
 * @spec L2-SRS-07
 */
export default async function StudyPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const member = await requireMembership()

  const [course] = await db
    .select({ id: courses.id, title: courses.title })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        eq(enrollments.userId, member.userId),
        eq(enrollments.courseId, courseId),
        eq(courses.status, "published")
      )
    )
  if (!course) redirect("/learn")

  const queue = (await dueQueue(member.userId, course.id)).map((c) => ({
    cardId: c.cardId,
    isNew: c.isNew,
    front: <Markdown source={c.front} />,
    back: <Markdown source={c.back} />,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{course.title}</h1>
      <StudySession queue={queue} />
    </div>
  )
}
