# Contract (L2) — school

> L2 = contract / what. AI proposes, human approves. Cite ≥1 L1.
> Style: terse. One fact per line.

> **Implements L1:** `L1-ARCH-03`, `L1-ARCH-04`, `L1-ARCH-07`
> **Depends on L2:** `db` (school tables), `auth` (session)

## Owns
School tenancy and product roles: the school row, membership, and the guards every `/learn/*` page and action passes through.

## Interfaces
- `L2-SCHOOL-01` — `school` table, exactly one row, seeded by migration. The schema and data model already support more: a second school is new rows, not a migration. What is *not* multi-school yet is the helper API (`L2-SCHOOL-03`) — `getCurrentSchoolId()` takes no argument and picks one row; `getMembership`/`requireMembership` return a single `schoolId` per user. A second school needs those signatures to grow a `schoolId` parameter; the tables need nothing. (`L2-DB-38`)
- `L2-SCHOOL-02` — `school_member` table — `(schoolId, userId)` unique, `role` ∈ `teacher | student`. (`L2-DB-39`)
- `L2-SCHOOL-03` — `@/app/_lib/school` → `isTeacher` (pure, client-safe), `getCurrentSchoolId()`, `getMembership(userId)`, `requireMembership()`, `requireTeacher()`. The last two are server-only guards: no session → `/backflip/login`; non-member → `/backflip`; student hitting a teacher route → `/learn`. Split across two files: `school/roles.ts` holds the role types and `isTeacher` (no `server-only` / db / auth imports — safe for client components and for unit tests), `school/index.ts` is the `server-only` module with the DB-backed functions and re-exports `roles.ts` so every caller still imports from `@/app/_lib/school`.

## Invariants
- `L2-SCHOOL-04` — Two role axes, never merged. `user.role` gates `/backflip/*` and nothing else; `school_member.role` gates `/learn/*` and nothing else. Neither implies the other; one person may hold both.
- `L2-SCHOOL-05` — Every `/learn/*` page and server action calls a guard from `L2-SCHOOL-03` server-side. Hidden nav and buttons are cosmetic — extends `L2-AUTH-22` to this surface.
- `L2-SCHOOL-06` — Every query over school-scoped data resolves its school through `getCurrentSchoolId()` or a membership, never a client-supplied id. This is the chokepoint that keeps multi-school a data change.
- `L2-SCHOOL-11` — Within that chokepoint, the two sources are not interchangeable. School-scoped work in a membership context takes `schoolId` from the membership (`requireMembership()`'s return, or a `Membership` from `getMembership()`) — never a fresh `getCurrentSchoolId()` call. `getCurrentSchoolId()` is for pre-membership contexts only: today, resolving a school for the invite page, before the invitee has a membership row. The two queries agree only by construction while exactly one `school` row exists; both are ordered deterministically (`createdAt` asc, `id` asc as tiebreak) so behavior is reproducible, but that is not correctness once a second school exists — mixing the two sources in one code path becomes a bug the day it does.

## Errors
- `L2-SCHOOL-07` — No `school` row → `getCurrentSchoolId()` throws with a hint to run migrations. A deployment cannot function without the seeded row.

## Acceptance
- `L2-SCHOOL-08` — A signed-in non-member visiting `/learn` lands on `/backflip`. A student visiting a teacher route lands on `/learn`. A teacher reaches both. Signing in from a `/learn` deep link (`from=%2Flearn`, or via the login page while already signed in) lands back on `/learn`, not the console (`L2-AUTH-47`). Observed by `apps/web/e2e/learn.spec.ts` (logged-out redirect, sign-in from `/learn` landing on `/learn`, non-member bounce, member shell, teacher's Courses link).

- `L2-SCHOOL-09` — Invite: `/backflip/school` (owner, capability `users.edit`) + server action `inviteMember`. Validated by `inviteMemberSchema` (`_lib/validation.ts`) — email normalized to lowercase, role ∈ `teacher | student`. Creates the `user` row when absent (no password → Google-only) and upserts the `school_member` row, so re-inviting changes a role rather than failing. Welcome email is best-effort (`L2-EMAIL-11`); a send failure never undoes the invite. The round trip, including the idempotent re-invite, is observed through the UI by `apps/web/e2e/learn.spec.ts`.
- `L2-SCHOOL-10` — There is no invite token and no accept page. `L2-AUTH-10` already refuses Google sign-in for any email without a `user` row and `L2-AUTH-41` requires a verified address, so creating the row is the invite. An expiring invite would add a `user_token` type (`L2-DB-20`) without changing this flow's shape.

## Constrained L3
- `/docs/notes/school.md`

---
IDs: `L2-SCHOOL-<NN>`. Permanent, never renumber.
Change: propose diff + affected-L3 → stop → await human.
