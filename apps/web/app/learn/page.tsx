import { requireMembership } from "@/app/_lib/school"

/**
 * `/learn` home. Plan 3 replaces this body with the student dashboard (enrolled
 * courses and their due counts).
 *
 * @spec L2-SCHOOL-05
 */
export default async function LearnHomePage() {
  const member = await requireMembership()

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Repeat &amp; Learn</h1>
      <p className="text-muted-foreground text-sm">
        Signed in as {member.email} ({member.role}).
      </p>
    </div>
  )
}
