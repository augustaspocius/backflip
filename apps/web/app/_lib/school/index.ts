import "server-only"

import { redirect } from "next/navigation"

import { db, schoolMembers, schools } from "@workspace/db"
import { asc, eq } from "drizzle-orm"

import { auth } from "@/app/_lib/auth"

import { isTeacher, type Membership } from "./roles"

/**
 * School membership — the product's authorization axis, and the single place
 * every `/learn/*` query goes through to learn which school it is scoped to.
 *
 * Deliberately separate from `@/app/_lib/auth/permissions`: that model says
 * what a person may do in the operator console (`user.role`), this one says
 * whether they author cards or study them (`school_member.role`). Neither
 * implies the other.
 *
 * The role types and `isTeacher` live in `./roles` (pure, no server-only /
 * db / auth imports) and are re-exported here so callers keep importing
 * everything from `@/app/_lib/school`.
 *
 * @spec L2-SCHOOL-01, L2-SCHOOL-02, L2-SCHOOL-03, L2-SCHOOL-11
 */

export * from "./roles"

/**
 * The school this deployment serves. One row exists (seeded by migration), so
 * this is a lookup, not a choice. Ordered (`createdAt` asc, `id` asc as a
 * tiebreak) so the pick is deterministic even before a second row exists.
 *
 * **Pre-membership contexts only.** Once a caller has a membership (which is
 * every `/learn/*` page/action after `requireMembership()`), scope writes and
 * reads with `membership.schoolId`, not this function — the two are only
 * guaranteed to agree while exactly one school row exists. The invite page is
 * the one legitimate caller today: it has to resolve a school before the
 * invitee is a member of one. See `L2-SCHOOL-11`.
 */
export async function getCurrentSchoolId() {
  const [school] = await db
    .select({ id: schools.id })
    .from(schools)
    .orderBy(asc(schools.createdAt), asc(schools.id))
    .limit(1)
  if (!school) {
    throw new Error(
      "No school row found. Run `corepack yarn db:migrate` — the seed lives in the school migration."
    )
  }
  return school.id
}

/**
 * This person's membership, or null when they are not in the school.
 * Ordered (`createdAt` asc, `id` asc as a tiebreak) so a person who is
 * eventually a member of more than one school gets a stable, reproducible
 * pick rather than whatever row Postgres returns first — not a claim that
 * multi-school membership is otherwise supported yet (see `L2-SCHOOL-11`).
 */
export async function getMembership(
  userId: string
): Promise<Membership | null> {
  const [row] = await db
    .select({ schoolId: schoolMembers.schoolId, role: schoolMembers.role })
    .from(schoolMembers)
    .where(eq(schoolMembers.userId, userId))
    .orderBy(asc(schoolMembers.createdAt), asc(schoolMembers.id))
    .limit(1)
  return row ?? null
}

/**
 * Guard for every `/learn/*` page and action. No session → login. Signed in
 * but not a member → the operator console, which every authenticated user can
 * reach. Returns identity so callers skip a second `auth()`.
 *
 * The returned `schoolId` is the source of truth for scoping any
 * school-scoped read or write in a membership context — not
 * `getCurrentSchoolId()`. See that function's doc comment and `L2-SCHOOL-11`.
 */
export async function requireMembership() {
  const session = await auth()
  if (!session?.user) redirect("/rnl-admin/login")

  const membership = await getMembership(session.user.id)
  if (!membership) redirect("/rnl-admin")

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
