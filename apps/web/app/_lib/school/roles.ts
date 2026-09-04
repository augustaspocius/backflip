/**
 * The pure, dependency-free half of the school module: the role types and the
 * one predicate over them. No `server-only`, no `@workspace/db`, no
 * `@/app/_lib/auth` — safe to import from client components for cosmetic
 * gating, and safe to unit-test without pulling the auth stack (and thus the
 * real `next-auth` package) into the test runner. `./index.ts` re-exports
 * this module alongside the server-only DB-backed guards.
 *
 * @spec L2-SCHOOL-03
 */

export const SCHOOL_ROLES = ["teacher", "student"] as const

export type SchoolRole = (typeof SCHOOL_ROLES)[number]

export type Membership = { schoolId: string; role: SchoolRole }

/** Pure, so it is safe to import from client components for cosmetic gating. */
export function isTeacher(role: SchoolRole | null | undefined) {
  return role === "teacher"
}
