import "server-only"

import { redirect } from "next/navigation"

import { db, schoolMembers, schools } from "@workspace/db"
import { eq } from "drizzle-orm"

import { auth } from "@/app/_lib/auth"

/**
 * School membership — the product's authorization axis, and the single place
 * every `/learn/*` query goes through to learn which school it is scoped to.
 *
 * Deliberately separate from `@/app/_lib/auth/permissions`: that model says
 * what a person may do in the operator console (`user.role`), this one says
 * whether they author cards or study them (`school_member.role`). Neither
 * implies the other.
 *
 * @spec L2-SCHOOL-01, L2-SCHOOL-02, L2-SCHOOL-03
 */

export type SchoolRole = "teacher" | "student"

export type Membership = { schoolId: string; role: SchoolRole }

/** Pure, so it is safe to import from client components for cosmetic gating. */
export function isTeacher(role: SchoolRole | null | undefined) {
  return role === "teacher"
}

/**
 * The school this deployment serves. One row exists (seeded by migration), so
 * this is a lookup, not a choice. When a second school arrives, this is the
 * one function that changes — every caller already routes through it.
 */
export async function getCurrentSchoolId() {
  const [school] = await db.select({ id: schools.id }).from(schools).limit(1)
  if (!school) {
    throw new Error(
      "No school row found. Run `corepack yarn db:migrate` — the seed lives in the school migration."
    )
  }
  return school.id
}

/** This person's membership, or null when they are not in the school. */
export async function getMembership(userId: string): Promise<Membership | null> {
  const [row] = await db
    .select({ schoolId: schoolMembers.schoolId, role: schoolMembers.role })
    .from(schoolMembers)
    .where(eq(schoolMembers.userId, userId))
    .limit(1)
  return row ?? null
}

/**
 * Guard for every `/learn/*` page and action. No session → login. Signed in
 * but not a member → the operator console, which every authenticated user can
 * reach. Returns identity so callers skip a second `auth()`.
 */
export async function requireMembership() {
  const session = await auth()
  if (!session?.user) redirect("/backflip/login")

  const membership = await getMembership(session.user.id)
  if (!membership) redirect("/backflip")

  return {
    userId: session.user.id,
    schoolId: membership.schoolId,
    role: membership.role,
    name: session.user.name ?? null,
    email: session.user.email!,
  }
}

/** As `requireMembership`, and additionally refuses students. */
export async function requireTeacher() {
  const member = await requireMembership()
  if (!isTeacher(member.role)) redirect("/learn")
  return member
}
