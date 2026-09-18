# Repeat & Learn — plan 1: foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the school tenancy seam, the `/learn/*` gated scope, and teacher/student invites, so later plans have a signed-in teacher and student to build for.

**Architecture:** Two new tables (`school`, `school_member`) hold membership; a single helper module scopes every future query to the current school. `/learn/*` reuses the existing Auth.js session and edge gate rather than introducing a second auth system. Invites need no token because `L2-AUTH-10` already refuses Google sign-in for any email that is not pre-registered.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Drizzle ORM + Postgres, Auth.js v5, zod 4, Vitest 4, shadcn/ui via `@workspace/ui`.

**Spec:** `docs/superpowers/specs/2026-09-04-repeat-and-learn-design.md`

## Global constraints

- Package manager is yarn 4 via corepack. Every command is `corepack yarn …`, never bare `yarn` or `npm`.
- One schema source: `packages/db/src/schema.ts`. Apps import from `@workspace/db` and never redeclare tables (`L2-DB-09`).
- Migrations are generated, never hand-written: `corepack yarn db:generate`, then commit the SQL (`L2-DB-11`).
- Non-route code lives in underscore-prefixed dirs (`_lib`, `_components`, `_actions`), colocated by scope (`L1-ARCH-07`, `L1-ARCH-08`).
- Pages are server components reading the DB directly; mutations are server actions. API routes only for consumers outside the app (`L1-ARCH-03`).
- Authorization is enforced server-side in every action and page, never by hiding UI (`L2-AUTH-22`).
- `user.role` (`owner|admin|teammate`) gates `/backflip/*` only. `school_member.role` (`teacher|student`) gates `/learn/*`. Never mix them.
- Do NOT edit `docs/constitution.md`. L1 is human-only.
- Commit messages: one semantic line, no body, no trailers, no AI attribution. `docs:`/`chore:`/`test:` ship no release; `feat:` cuts a minor.
- Every code change updates docs in the same commit: L3 notes always, L2 contracts when an interface changes.

---

### Task 1: School and membership schema

**Files:**
- Modify: `packages/db/src/schema.ts` (append at end)
- Create: `packages/db/migrations/00NN_*.sql` (generated)
- Modify: `docs/contracts/db.md`
- Modify: `docs/notes/db.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `schools`, `schoolMembers`, `schoolRole` exported from `@workspace/db`. Row shape: `schools` = `{ id, name, slug, createdAt }`; `schoolMembers` = `{ id, schoolId, userId, role, createdAt }` where `role` is `"teacher" | "student"`.

- [ ] **Step 1: Append the tables to the schema**

Add to the end of `packages/db/src/schema.ts`:

```ts
/**
 * School roles. Deliberately separate from `user_role` (`L2-DB-05`): that one
 * says what a person may do in the operator console, this one says whether
 * they author cards or study them. One person may hold both.
 */
export const schoolRole = pgEnum("school_role", ["teacher", "student"])

/**
 * A school. Exactly one row today — the seam for multiple schools later, so
 * that adding the second is new rows rather than a migration plus an audit of
 * every query written in the meantime.
 *
 * @spec L2-SCHOOL-01
 */
export const schools = pgTable("school", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  /** URL-safe handle. Unique so it can address a school in a path later. */
  slug: text("slug").unique().notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
})

/**
 * Membership of a person in a school, carrying their product role. A table
 * rather than columns on `user`, because this is what makes multi-school a
 * data change instead of a schema change.
 *
 * @spec L2-SCHOOL-02
 */
export const schoolMembers = pgTable(
  "school_member",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    schoolId: text("schoolId")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: schoolRole("role").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // One membership per person per school. A role change is an update.
    uniqueIndex("school_member_school_user_idx").on(t.schoolId, t.userId),
    // "Which schools is this person in" — the session-path query.
    index("school_member_user_idx").on(t.userId),
  ]
)
```

- [ ] **Step 2: Generate the migration**

Run from the repo root:

```bash
corepack yarn db:generate
```

Expected: a new `packages/db/migrations/00NN_<name>.sql` creating `school_role`, `school`, `school_member`.

- [ ] **Step 3: Append the seed to the generated migration**

Open the generated SQL file and append at the end. A statement-breakpoint comment separates statements, matching the generated style:

```sql
--> statement-breakpoint
INSERT INTO "school" ("id", "name", "slug")
VALUES (gen_random_uuid()::text, 'Default School', 'default')
ON CONFLICT ("slug") DO NOTHING;
```

`ON CONFLICT DO NOTHING` makes re-running harmless, matching how `0006` seeds `analytics_config`.

- [ ] **Step 4: Apply and verify**

```bash
docker compose up -d
corepack yarn db:migrate
```

Then confirm the seeded row exists:

```bash
docker exec backflip-db psql -U backflip -d backflip -c "select slug, name from school;"
```

Expected: exactly one row, `default | Default School`.

- [ ] **Step 5: Update the docs**

In `docs/contracts/db.md`, add under Schemas (use the next free `L2-DB-<NN>`, currently 38 and 39):

```markdown
- `L2-DB-38` — `school_role` enum (`teacher` | `student`) + `school` table: `id`, `name`, `slug` (unique), `createdAt`. Migration `00NN` creates it and seeds one row (`Default School` / `default`, `ON CONFLICT DO NOTHING`). Exactly one row today; the table is the multi-school seam. Owned by the `school` domain (`L2-SCHOOL-01`).
- `L2-DB-39` — `school_member` table: `id`, `schoolId` (fk → `school`, cascade), `userId` (fk → `user`, cascade), `role` (`school_role`), `createdAt`. Unique `(schoolId, userId)` — a role change is an update, not a second row. Index on `userId`. Distinct from `user.role` (`L2-DB-05`): that gates the operator console, this gates `/learn/*`. Owned by the `school` domain (`L2-SCHOOL-02`).
```

Add the same two table names to the `L2-DB-14` acceptance list.

In `docs/notes/db.md`, note the new tables and the seeded school under whatever heading that file uses for the table inventory.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations docs/contracts/db.md docs/notes/db.md
git commit -m "feat(db): add school and school_member tables"
```

---

### Task 2: Membership helpers

**Files:**
- Create: `apps/web/app/_lib/school/index.ts`
- Create: `apps/web/app/_lib/school/membership.test.ts`
- Create: `docs/contracts/school.md`
- Create: `docs/notes/school.md`

**Interfaces:**
- Consumes: `schools`, `schoolMembers` from Task 1.
- Produces:
  - `type SchoolRole = "teacher" | "student"`
  - `type Membership = { schoolId: string; role: SchoolRole }`
  - `isTeacher(role: SchoolRole | null | undefined): boolean`
  - `getCurrentSchoolId(): Promise<string>` — server-only
  - `getMembership(userId: string): Promise<Membership | null>` — server-only
  - `requireMembership(): Promise<{ userId: string; schoolId: string; role: SchoolRole; name: string | null; email: string }>` — server-only, redirects
  - `requireTeacher(): Promise<…same shape…>` — server-only, redirects

- [ ] **Step 1: Write the failing test**

Only the pure part is unit-tested here. The DB-backed helpers are covered end to end in plan 3; unit-testing them would mean mocking Drizzle, which tests the mock.

Create `apps/web/app/_lib/school/membership.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { isTeacher } from "@/app/_lib/school"

describe("isTeacher", () => {
  it("is true only for the teacher role", () => {
    expect(isTeacher("teacher")).toBe(true)
    expect(isTeacher("student")).toBe(false)
  })

  it("is false for absent membership", () => {
    expect(isTeacher(null)).toBe(false)
    expect(isTeacher(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

```bash
corepack yarn workspace web test membership
```

Expected: FAIL, cannot resolve `@/app/_lib/school`.

- [ ] **Step 3: Write the module**

Create `apps/web/app/_lib/school/index.ts`:

```ts
import "server-only"

import { redirect } from "next/navigation"

import { db, schoolMembers, schools, users } from "@workspace/db"
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
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
corepack yarn workspace web test membership
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck**

```bash
corepack yarn workspace web typecheck
```

Expected: no errors.

- [ ] **Step 6: Write the L2 contract**

Create `docs/contracts/school.md`:

```markdown
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
- `L2-SCHOOL-03` — `@/app/_lib/school` → `isTeacher` (pure, client-safe), `getCurrentSchoolId()`, `getMembership(userId)`, `requireMembership()`, `requireTeacher()`. The last two are server-only guards: no session → `/backflip/login`; non-member → `/backflip`; student hitting a teacher route → `/learn`.

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
```

Create `docs/notes/school.md` following the shape of the other files in `docs/notes/`, recording: the module path, the seeded default school, and that the DB-backed guards are covered by e2e rather than unit tests.

- [ ] **Step 7: Register the domain in L1 — do not edit it yourself**

`docs/constitution.md` lists governed L2 domains and is human-only. Note in the commit summary that `school` needs adding to that list, and leave the file untouched.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/_lib/school docs/contracts/school.md docs/notes/school.md
git commit -m "feat(school): add membership helpers and learn-scope guards"
```

---

### Task 3: The /learn scope and its shell

**Files:**
- Modify: `apps/web/proxy.ts` (the `config.matcher` array at the end)
- Create: `apps/web/app/learn/layout.tsx`
- Create: `apps/web/app/learn/page.tsx`
- Create: `apps/web/app/learn/_components/learn-nav.tsx`
- Modify: `docs/contracts/auth.md`
- Modify: `docs/notes/auth.md`

**Interfaces:**
- Consumes: `requireMembership` from Task 2.
- Produces: a gated `/learn` route rendering the signed-in member's name and role. Later plans add pages under it.

- [ ] **Step 1: Extend the edge gate**

In `apps/web/proxy.ts`, change the exported config at the bottom of the file from:

```ts
export const config = {
  matcher: ["/backflip/:path*"],
}
```

to:

```ts
export const config = {
  // Both gated scopes share one session and one redirect rule. `/learn/*` has
  // no public paths of its own — its login page is the admin one.
  matcher: ["/backflip/:path*", "/learn/:path*"],
}
```

No other change to that file. `PUBLIC_PATHS` stays as it is: every `/learn/*` path requires a session.

- [ ] **Step 2: Write the shell layout**

Create `apps/web/app/learn/layout.tsx`:

```tsx
import type { ReactNode } from "react"

import { requireMembership } from "@/app/_lib/school"
import { LearnNav } from "./_components/learn-nav"

/**
 * Authenticated `/learn` shell. The proxy has already rejected sessionless
 * requests; this layout enforces the product-side rule the edge cannot check —
 * that the signed-in person is actually a member of the school.
 *
 * Deliberately not the `/backflip` shell: students are not operators, and the
 * console's sidebar, density and vocabulary are wrong for them.
 *
 * @spec L2-SCHOOL-05
 */
export default async function LearnLayout({
  children,
}: {
  children: ReactNode
}) {
  const member = await requireMembership()

  return (
    <div className="bg-background min-h-svh">
      <LearnNav role={member.role} name={member.name} />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Write the nav**

Create `apps/web/app/learn/_components/learn-nav.tsx`:

```tsx
import Link from "next/link"

import type { SchoolRole } from "@/app/_lib/school"

/**
 * Top bar for `/learn`. The teacher link is cosmetic gating only — the routes
 * behind it call `requireTeacher()` themselves (`L2-SCHOOL-05`).
 */
export function LearnNav({
  role,
  name,
}: {
  role: SchoolRole
  name: string | null
}) {
  return (
    <header className="border-b">
      <nav className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-3">
        <Link href="/learn" className="font-semibold">
          Repeat &amp; Learn
        </Link>
        {role === "teacher" && (
          <Link
            href="/learn/courses"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Courses
          </Link>
        )}
        <span className="text-muted-foreground ml-auto text-sm">
          {name ?? "Signed in"}
        </span>
      </nav>
    </header>
  )
}
```

- [ ] **Step 4: Write the placeholder home page**

Create `apps/web/app/learn/page.tsx`. Plan 3 replaces its body with the real dashboard; the guard and the file stay.

```tsx
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
```

- [ ] **Step 5: Verify the gate by hand**

```bash
corepack yarn dev
```

Check three things at http://localhost:3070:

1. Logged out, visit `/learn` → redirected to `/backflip/login?from=/learn`.
2. Signed in as the seeded owner (who has no `school_member` row yet) → visiting `/learn` redirects to `/backflip`.
3. Insert a membership for that user and reload `/learn` → the page renders with their email and role.

For step 3:

```bash
docker exec backflip-db psql -U backflip -d backflip -c \
  "insert into school_member (id, \"schoolId\", \"userId\", role) \
   select gen_random_uuid()::text, s.id, u.id, 'teacher' \
   from school s, \"user\" u where u.role = 'owner' limit 1;"
```

- [ ] **Step 6: Typecheck and lint**

```bash
corepack yarn workspace web typecheck && corepack yarn workspace web lint
```

Expected: both clean.

- [ ] **Step 7: Update the auth docs**

In `docs/contracts/auth.md`, amend `L2-AUTH-01` so the matcher line reads that the gate covers `/backflip/:path*` **and** `/learn/:path*`, with the note that `/learn` has no public paths of its own and that membership (not just a session) is enforced node-side by `L2-SCHOOL-05`. Record the same in `docs/notes/auth.md`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/proxy.ts apps/web/app/learn docs/contracts/auth.md docs/notes/auth.md
git commit -m "feat(learn): gate the /learn scope and add its shell"
```

---

### Task 4: Invite a teacher or student

**Files:**
- Create: `apps/web/app/backflip/(protected)/school/page.tsx`
- Create: `apps/web/app/backflip/(protected)/school/_actions.ts`
- Create: `apps/web/app/backflip/(protected)/school/_components/invite-form.tsx`
- Create: `apps/web/app/_lib/school/invite.test.ts`
- Modify: `apps/web/app/_lib/validation.ts`
- Modify: `docs/contracts/school.md`, `docs/notes/school.md`

**Interfaces:**
- Consumes: `getCurrentSchoolId` from Task 2; `sendWelcomeEmail` and `appUrl` from `@/app/_lib/email/send`; `canEditUsers` from `@/app/_lib/auth/permissions`.
- Produces: `inviteMemberSchema` exported from `@/app/_lib/validation`; server action `inviteMember(prev, formData) => { ok: boolean; message: string } | null`.

Invites live in the operator console rather than `/learn`, because in v1 the person who onboards people is the platform owner. A teacher-facing invite screen is a later change; the action already carries the school id, so it moves without a rewrite.

- [ ] **Step 1: Write the failing validation test**

Create `apps/web/app/_lib/school/invite.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { inviteMemberSchema } from "@/app/_lib/validation"

describe("inviteMemberSchema", () => {
  it("normalizes the email and keeps the role", () => {
    const parsed = inviteMemberSchema.safeParse({
      name: "  Ada  ",
      email: "  Ada@Example.COM ",
      role: "teacher",
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.email).toBe("ada@example.com")
    expect(parsed.data.name).toBe("Ada")
    expect(parsed.data.role).toBe("teacher")
  })

  it("rejects an unknown school role", () => {
    const parsed = inviteMemberSchema.safeParse({
      email: "ada@example.com",
      role: "owner",
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a malformed email", () => {
    const parsed = inviteMemberSchema.safeParse({
      email: "not-an-email",
      role: "student",
    })
    expect(parsed.success).toBe(false)
  })

  it("treats a blank name as absent", () => {
    const parsed = inviteMemberSchema.safeParse({
      name: "   ",
      email: "ada@example.com",
      role: "student",
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.name).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
corepack yarn workspace web test invite
```

Expected: FAIL, `inviteMemberSchema` is not exported.

- [ ] **Step 3: Add the schema**

In `apps/web/app/_lib/validation.ts`, append. It reuses the file's existing `nameField` and `emailField`, so the email normalization matches the rest of the app.

```ts
/** School roles, mirrored from the db enum. Kept here so validation stays pure. */
const SCHOOL_ROLES = ["teacher", "student"] as const

const schoolRoleField = z
  .string()
  .refine(
    (v): v is (typeof SCHOOL_ROLES)[number] =>
      (SCHOOL_ROLES as readonly string[]).includes(v),
    "Unknown school role."
  )

/**
 * Inviting someone into the school. No password field: an invited member signs
 * in with Google, which `L2-AUTH-10` permits precisely because the invite has
 * created their `user` row.
 *
 * @spec L2-SCHOOL-09
 */
export const inviteMemberSchema = z.object({
  name: nameField,
  email: emailField,
  role: schoolRoleField,
})
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
corepack yarn workspace web test invite
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Write the server action**

Create `apps/web/app/backflip/(protected)/school/_actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"

import { db, schoolMembers, users } from "@workspace/db"
import { eq } from "drizzle-orm"

import { auth } from "@/app/_lib/auth"
import { canEditUsers } from "@/app/_lib/auth/permissions"
import { appUrl, sendWelcomeEmail } from "@/app/_lib/email/send"
import { getCurrentSchoolId } from "@/app/_lib/school"
import { firstError, inviteMemberSchema } from "@/app/_lib/validation"

/**
 * Invite someone into the school.
 *
 * There is no invite token and no accept page, and that is the point: Google
 * sign-in already refuses any email without a `user` row (`L2-AUTH-10`) and
 * requires a verified address (`L2-AUTH-41`). Creating the row IS the invite.
 * The email is a courtesy pointing at the login page.
 *
 * Idempotent by design — inviting an existing user adds or updates their
 * membership rather than failing on the unique email.
 *
 * @spec L2-SCHOOL-09, L2-SCHOOL-10
 */

export type InviteState = { ok: boolean; message: string } | null

export async function inviteMember(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const session = await auth()
  if (!session?.user || !canEditUsers(session.user.role)) {
    return { ok: false, message: "Unauthorized" }
  }

  const parsed = inviteMemberSchema.safeParse({
    name: formData.get("name") == null ? undefined : String(formData.get("name")),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { name, email, role } = parsed.data

  const schoolId = await getCurrentSchoolId()

  const userId = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))

    // No password: this account signs in with Google (`L2-DB-06`, null hash).
    const id =
      existing?.id ??
      (
        await tx
          .insert(users)
          .values({ name, email, role: "teammate" })
          .returning({ id: users.id })
      )[0]!.id

    await tx
      .insert(schoolMembers)
      .values({ schoolId, userId: id, role })
      .onConflictDoUpdate({
        target: [schoolMembers.schoolId, schoolMembers.userId],
        set: { role },
      })

    return id
  })

  // Best-effort, exactly like user creation (`L2-AUTH-25`): an unconfigured
  // email provider must not undo an invite that already landed in the db.
  await sendWelcomeEmail({
    to: email,
    name,
    loginUrl: `${appUrl()}/backflip/login`,
  }).catch(() => undefined)

  revalidatePath("/backflip/school")
  return {
    ok: true,
    message: `${email} can now sign in as a ${role}.`,
  }
}
```

Note on `userId`: it is returned by the transaction but unused by the caller. Keep the return so the action can grow a redirect to the member later without restructuring; if lint objects to the unused binding, change `const userId = await db.transaction` to `await db.transaction`.

- [ ] **Step 6: Write the invite form**

Create `apps/web/app/backflip/(protected)/school/_components/invite-form.tsx`:

```tsx
"use client"

import { useActionState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { inviteMember, type InviteState } from "../_actions"

/** Invite form. The action re-checks the capability server-side. */
export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    inviteMember,
    null
  )

  return (
    <form action={action} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="invite-name">Name</Label>
        <Input id="invite-name" name="name" placeholder="Ada Lovelace" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="ada@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue="student"
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </select>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Send invite"}
      </Button>

      {state && (
        <p
          className={
            state.ok ? "text-sm text-green-600" : "text-destructive text-sm"
          }
        >
          {state.message}
        </p>
      )}
    </form>
  )
}
```

- [ ] **Step 7: Write the page**

Create `apps/web/app/backflip/(protected)/school/page.tsx`:

```tsx
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
```

- [ ] **Step 8: Verify by hand**

```bash
corepack yarn dev
```

Signed in as the owner, go to http://localhost:3070/backflip/school and invite `student@example.test` as a student. Confirm the row appears in the table, then confirm the database agrees:

```bash
docker exec backflip-db psql -U backflip -d backflip -c \
  "select u.email, m.role from school_member m join \"user\" u on u.id = m.\"userId\";"
```

Invite the same address again as a teacher. Expected: still one row, role now `teacher`.

- [ ] **Step 9: Run the full unit suite, typecheck and lint**

```bash
corepack yarn workspace web test && corepack yarn workspace web typecheck && corepack yarn workspace web lint
```

Expected: all green, with no regressions in the existing auth suites.

- [ ] **Step 10: Update the docs**

In `docs/contracts/school.md`, add under Interfaces:

```markdown
- `L2-SCHOOL-09` — Invite: `/backflip/school` (owner, capability `users.edit`) + server action `inviteMember`. Validated by `inviteMemberSchema` (`_lib/validation.ts`) — email normalized to lowercase, role ∈ `teacher | student`. Creates the `user` row when absent (no password → Google-only) and upserts the `school_member` row, so re-inviting changes a role rather than failing. Welcome email is best-effort (`L2-EMAIL-11`); a send failure never undoes the invite.
- `L2-SCHOOL-10` — There is no invite token and no accept page. `L2-AUTH-10` already refuses Google sign-in for any email without a `user` row and `L2-AUTH-41` requires a verified address, so creating the row is the invite. An expiring invite would add a `user_token` type (`L2-DB-20`) without changing this flow's shape.
```

Record the same in `docs/notes/school.md`, plus the manual verification steps.

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/backflip/'(protected)'/school apps/web/app/_lib/validation.ts apps/web/app/_lib/school/invite.test.ts docs/contracts/school.md docs/notes/school.md
git commit -m "feat(school): invite teachers and students from the console"
```

---

## Done when

- `corepack yarn workspace web test` is green, including the 6 new tests.
- `corepack yarn workspace web typecheck` and `lint` are clean.
- A logged-out request to `/learn` redirects to login; a signed-in non-member lands on `/backflip`; an invited member sees the `/learn` shell with their role.
- Re-inviting an existing email updates their role instead of erroring.
- `docs/contracts/school.md` and `docs/notes/school.md` exist; `db.md` and `auth.md` reflect the new tables and the extended gate.

## Handoff to plan 2

Plan 2 (`authoring`) builds courses, decks, cards and enrolment on top of `requireTeacher()` and `getCurrentSchoolId()`. It assumes a signed-in teacher exists, which Task 4 provides.
