import { db, schoolMembers, users } from "@workspace/db"
import { eq } from "drizzle-orm"

import { requireCapability } from "@/app/_lib/auth/guard"
import { getCurrentSchoolId } from "@/app/_lib/school"

import { InviteForm } from "./_components/invite-form"

/**
 * School membership admin. Owner-only, in the operator console rather than
 * `/learn`, because in v1 onboarding is the platform owner's job.
 *
 * @spec L2-SCHOOL-09
 */
export default async function SchoolPage() {
  await requireCapability("users.edit")

  const schoolId = await getCurrentSchoolId()
  const members = await db
    .select({
      id: schoolMembers.id,
      role: schoolMembers.role,
      name: users.name,
      email: users.email,
    })
    .from(schoolMembers)
    .innerJoin(users, eq(users.id, schoolMembers.userId))
    .where(eq(schoolMembers.schoolId, schoolId))
    .orderBy(users.email)

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">School members</h1>
        <p className="text-muted-foreground text-sm">
          Invited people sign in with Google. Teachers author courses; students
          study them.
        </p>
      </div>

      <InviteForm />

      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Email</th>
            <th className="py-2 font-medium">Role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-b">
              <td className="py-2">{m.name ?? "—"}</td>
              <td className="py-2">{m.email}</td>
              <td className="py-2 capitalize">{m.role}</td>
            </tr>
          ))}
          {members.length === 0 && (
            <tr>
              <td colSpan={3} className="text-muted-foreground py-4">
                No members yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
