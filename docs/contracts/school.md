# Contract (L2) — school

> L2 = contract / what. AI proposes, human approves. Cite ≥1 L1.
> Style: terse. One fact per line.

> **Implements L1:** `L1-ARCH-03`, `L1-ARCH-04`, `L1-ARCH-07`
> **Depends on L2:** `db` (school tables), `auth` (session)

## Owns
School tenancy and product roles: the school row, membership, and the guards every `/learn/*` page and action passes through.

## Interfaces
- `L2-SCHOOL-01` — `school` table, exactly one row, seeded by migration. The multi-school seam: a second school is new rows, not a schema change. (`L2-DB-38`)
- `L2-SCHOOL-02` — `school_member` table — `(schoolId, userId)` unique, `role` ∈ `teacher | student`. (`L2-DB-39`)
- `L2-SCHOOL-03` — `@/app/_lib/school` → `isTeacher` (pure, client-safe), `getCurrentSchoolId()`, `getMembership(userId)`, `requireMembership()`, `requireTeacher()`. The last two are server-only guards: no session → `/backflip/login`; non-member → `/backflip`; student hitting a teacher route → `/learn`. Split across two files: `school/roles.ts` holds the role types and `isTeacher` (no `server-only` / db / auth imports — safe for client components and for unit tests), `school/index.ts` is the `server-only` module with the DB-backed functions and re-exports `roles.ts` so every caller still imports from `@/app/_lib/school`.

## Invariants
- `L2-SCHOOL-04` — Two role axes, never merged. `user.role` gates `/backflip/*` and nothing else; `school_member.role` gates `/learn/*` and nothing else. Neither implies the other; one person may hold both.
- `L2-SCHOOL-05` — Every `/learn/*` page and server action calls a guard from `L2-SCHOOL-03` server-side. Hidden nav and buttons are cosmetic — extends `L2-AUTH-22` to this surface.
- `L2-SCHOOL-06` — Every query over school-scoped data resolves its school through `getCurrentSchoolId()` or a membership, never a client-supplied id. This is the chokepoint that keeps multi-school a data change.

## Errors
- `L2-SCHOOL-07` — No `school` row → `getCurrentSchoolId()` throws with a hint to run migrations. A deployment cannot function without the seeded row.

## Acceptance
- `L2-SCHOOL-08` — A signed-in non-member visiting `/learn` lands on `/backflip`. A student visiting a teacher route lands on `/learn`. A teacher reaches both.

## Constrained L3
- `/docs/notes/school.md`

---
IDs: `L2-SCHOOL-<NN>`. Permanent, never renumber.
Change: propose diff + affected-L3 → stop → await human.
