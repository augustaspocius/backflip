# Notes (L3) — school

> L3 = how / volatile. AI writes free. Cites L2 IDs up. Matches code as-is.

## File map
- `packages/db/src/schema.ts` — `schoolRole` enum (`teacher | student`), `schools` table (`id`, `name`, `slug` unique, `createdAt`), `schoolMembers` table (`id`, `schoolId` fk cascade, `userId` fk cascade, `role`, `createdAt`; unique `(schoolId, userId)`, index on `userId`). Satisfies `L2-SCHOOL-01`, `L2-SCHOOL-02`, `L2-DB-38`, `L2-DB-39`.
- `packages/db/migrations/0019_*.sql` — creates both tables, seeds one row (`Default School` / `default`, `ON CONFLICT DO NOTHING`).
- `apps/web/app/_lib/school/index.ts` — the whole module: `SchoolRole`, `Membership`, `isTeacher` (pure), `getCurrentSchoolId()`, `getMembership(userId)`, `requireMembership()`, `requireTeacher()`. Satisfies `L2-SCHOOL-03`.
- `apps/web/app/_lib/school/membership.test.ts` — unit test for `isTeacher` only.

## Why only `isTeacher` is unit-tested
The DB-backed functions (`getCurrentSchoolId`, `getMembership`, `requireMembership`, `requireTeacher`) are covered end to end once `/learn/*` pages exist to drive them (plan 3), not here. Unit-testing them now would mean mocking Drizzle's query builder, which asserts the mock reproduces the SQL rather than that the SQL is correct — the same reasoning `auth/tokens.test.ts` accepts for its recording stub, except there even a stub is judged worth it because the invalidate/consume ordering is easy to get wrong silently. Here the functions are one `select` and two redirects; the payoff isn't there yet.

## Two role axes, kept apart
`user.role` (`owner | admin | teammate`, `L2-DB-05`) gates `/backflip/*` — the operator console. `school_member.role` (`teacher | student`) gates `/learn/*` — the product. They live in different tables, are read by different modules (`@/app/_lib/auth/permissions` vs `@/app/_lib/school`), and neither function consults the other's role. A person can be a `teammate` in the console and a `teacher` in a school; changing one never changes the other. See `L2-SCHOOL-04`.

## Guard shape mirrors `requireCapability`, deliberately
`requireMembership()` reads `auth()` itself rather than taking a session, so every `/learn/*` page/action is a one-line call — same shape as `@/app/_lib/auth/guard.ts`'s `requireCapability`. The three-way branch (no session → login; session, no membership → console; membership → return identity) exists because "not a member" is not an error state for this deployment: every authenticated user can reach `/backflip`, so a non-member visiting `/learn` lands somewhere real instead of a dead end.

## `getCurrentSchoolId` is a lookup, not a chooser
One `school` row exists today (seeded by migration). The function still queries rather than hardcoding the seeded id, so the day a second school is added, this is the only place that needs to change — every caller already routes through it rather than reading `schools` directly. `L2-SCHOOL-06` extends this to all school-scoped queries, not just this function.

## Gotcha: real `next-auth` under Vitest needs `deps.inline`
`@/app/_lib/school` imports `@/app/_lib/auth`, which imports the real (unmocked) `next-auth`. `next@16.2.6` ships no `"exports"` map in its `package.json`, so next-auth's own `import { NextRequest } from "next/server"` (extensionless) fails once Vitest externalizes the dependency and Node's native ESM resolver tries to resolve it — `require` and Next's own bundler both probe file extensions for a legacy (no-`exports`) package; Node's ESM loader does not. `apps/web/vitest.config.ts` now sets `test.server.deps.inline: ["next-auth"]`, which routes the package through Vite's resolver (which does the probing) instead of loading it natively. `auth/auth-callbacks.test.ts` never hit this because it mocks `next-auth`'s default export before import; this module is the first test to pull in the real package transitively.

## State
- Module + unit test done. `getCurrentSchoolId`/`getMembership`/`requireMembership`/`requireTeacher` unverified beyond typecheck until plan 3 wires up `/learn/*` pages to exercise them e2e.
