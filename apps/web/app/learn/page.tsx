import Link from "next/link"

import { courses, db, enrollments } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireMembership } from "@/app/_lib/school"
import { dueCount } from "@/app/_lib/srs"

/**
 * Student dashboard: enrolled, published courses and what is waiting in each.
 * Draft courses are absent even when enrolled (`L2-COURSE-09`).
 *
 * @spec L2-SRS-07
 */
export default async function LearnHomePage() {
  const member = await requireMembership()

  const enrolled = await db
    .select({ id: courses.id, title: courses.title })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        eq(enrollments.userId, member.userId),
        eq(courses.status, "published")
      )
    )
    .orderBy(courses.title)

  const withCounts = await Promise.all(
    enrolled.map(async (c) => ({
      ...c,
      due: await dueCount(member.userId, c.id),
    }))
  )

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Your courses</h1>
        <p className="text-muted-foreground text-sm">
          Signed in as {member.email} ({member.role}).
        </p>
      </div>

      <ul className="divide-y">
        {withCounts.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3">
            <Link href={`/learn/study/${c.id}`} className="hover:underline">
              {c.title}
            </Link>
            <span className="text-muted-foreground ml-auto text-sm">
              {c.due > 0 ? `${c.due} due` : "Nothing due"}
            </span>
          </li>
        ))}
        {withCounts.length === 0 && (
          <li className="text-muted-foreground py-3 text-sm">
            You are not enrolled in any published courses yet.
          </li>
        )}
      </ul>
    </div>
  )
}
