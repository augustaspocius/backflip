# Repeat & Learn — plan 2: authoring and enrolment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a teacher create a course, fill it with decks and markdown cards, and enrol students — so plan 3 has real content to schedule.

**Architecture:** Four tables under the school (`course` → `deck` → `card`, plus `enrollment`). Every page and action passes `requireTeacher()` and scopes to the teacher's own school. Cards are two markdown fields rendered with the `react-markdown` + `remark-gfm` pair already in the app.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + Postgres, zod 4, Vitest 4, `react-markdown` 10, `@workspace/ui`.

**Spec:** `docs/superpowers/specs/2026-09-04-repeat-and-learn-design.md`

**Depends on:** plan 1 (`docs/superpowers/plans/2026-09-04-repeat-and-learn-1-foundation.md`), complete and merged.

## Global constraints

- Package manager is yarn 4 via corepack. Every command is `corepack yarn …`.
- One schema source: `packages/db/src/schema.ts` (`L2-DB-09`). Migrations generated with `corepack yarn db:generate`, never hand-written (`L2-DB-11`).
- Non-route code in underscore dirs, colocated by scope (`L1-ARCH-07`, `L1-ARCH-08`).
- Pages are server components; mutations are server actions (`L1-ARCH-03`).
- Every `/learn/*` page and action calls `requireMembership()` or `requireTeacher()` server-side (`L2-SCHOOL-05`), and resolves the school through the membership, never a client-supplied id (`L2-SCHOOL-06`).
- A teacher may only touch courses whose `schoolId` matches their own membership. Check this in the query's `where`, not after fetching.
- Do NOT edit `docs/constitution.md`.
- Commits: one semantic line, no body, no trailers, no AI attribution.

---

### Task 1: Content schema

**Files:**
- Modify: `packages/db/src/schema.ts` (append)
- Create: `packages/db/migrations/00NN_*.sql` (generated)
- Modify: `docs/contracts/db.md`, `docs/notes/db.md`

**Interfaces:**
- Consumes: `schools`, `schoolMembers`, `users` from plan 1.
- Produces, all exported from `@workspace/db`:
  - `courseStatus` enum, values `"draft" | "published"`
  - `courses` = `{ id, schoolId, ownerId, title, description, status, createdAt, updatedAt }`
  - `decks` = `{ id, courseId, title, position, createdAt }`
  - `cards` = `{ id, deckId, front, back, position, createdAt, updatedAt }`
  - `enrollments` = `{ id, courseId, userId, createdAt }`

- [ ] **Step 1: Append the tables**

Add to the end of `packages/db/src/schema.ts`:

```ts
/** Draft courses are invisible to students; publishing activates enrolments. */
export const courseStatus = pgEnum("course_status", ["draft", "published"])

/**
 * A course: the unit a student enrols in. Owned by a teacher, scoped to a
 * school. `schoolId` is denormalized onto the course (rather than reached via
 * the owner's membership) so every listing query is one indexed read.
 *
 * @spec L2-COURSE-01
 */
export const courses = pgTable(
  "course",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    schoolId: text("schoolId")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    /** The authoring teacher. Deleting them keeps the course, ownerless. */
    ownerId: text("ownerId").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: courseStatus("status").notNull().default("draft"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // "Courses in my school", the only listing query.
    index("course_school_idx").on(t.schoolId),
  ]
)

/**
 * A deck: a named group of cards inside a course. Ordering is an explicit
 * integer, not creation time, so a teacher can reorder without touching rows'
 * timestamps.
 *
 * @spec L2-COURSE-02
 */
export const decks = pgTable(
  "deck",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("deck_course_idx").on(t.courseId)]
)

/**
 * A card: the atom a student reviews. `front` and `back` are markdown, with
 * images as markdown image references. No card type column in v1 — every card
 * is front/back and self-rated (`L2-SRS-05`).
 *
 * @spec L2-COURSE-03
 */
export const cards = pgTable(
  "card",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    deckId: text("deckId")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("card_deck_idx").on(t.deckId)]
)

/**
 * A student's enrolment in a course. Created by the teacher; the student does
 * not self-enrol in v1.
 *
 * @spec L2-COURSE-04
 */
export const enrollments = pgTable(
  "enrollment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    courseId: text("courseId")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // Enrolling twice is a mistake, not a second enrolment.
    uniqueIndex("enrollment_course_user_idx").on(t.courseId, t.userId),
    // "My courses", the student dashboard query.
    index("enrollment_user_idx").on(t.userId),
  ]
)
```

- [ ] **Step 2: Generate and apply the migration**

```bash
corepack yarn db:generate
corepack yarn db:migrate
```

Expected: a new SQL file creating `course_status`, `course`, `deck`, `card`, `enrollment`.

- [ ] **Step 3: Verify the tables exist**

```bash
docker compose exec backflip-db psql -U postgres -d backflip -c "\dt"
```

Expected: `course`, `deck`, `card`, `enrollment` present.

- [ ] **Step 4: Update the docs**

In `docs/contracts/db.md` add `L2-DB-40` through `L2-DB-43`, one per table, each naming its columns, indexes, cascade behaviour and owning domain (`L2-COURSE-01` … `L2-COURSE-04`). Add the four table names to `L2-DB-14`. Record the same in `docs/notes/db.md`.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations docs/contracts/db.md docs/notes/db.md
git commit -m "feat(db): add course, deck, card and enrollment tables"
```

---

### Task 2: Course validation and actions

**Files:**
- Create: `apps/web/app/learn/_lib/course-validation.ts`
- Create: `apps/web/app/learn/_lib/course-validation.test.ts`
- Create: `apps/web/app/learn/courses/_actions.ts`
- Modify: `docs/contracts/school.md` (or create `docs/contracts/courses.md`)

**Interfaces:**
- Consumes: `requireTeacher` from `@/app/_lib/school`; `firstError` from `@/app/_lib/validation`.
- Produces:
  - `courseSchema`, `deckSchema`, `cardSchema` from `@/app/learn/_lib/course-validation`
  - `type ActionState = { ok: boolean; message: string } | null`
  - `createCourse(prev, formData): Promise<ActionState>`
  - `updateCourse(prev, formData): Promise<ActionState>`
  - `setCourseStatus(courseId: string, status: "draft" | "published"): Promise<ActionState>`
  - `deleteCourse(courseId: string): Promise<ActionState>`

- [ ] **Step 1: Write the failing validation test**

Create `apps/web/app/learn/_lib/course-validation.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  cardSchema,
  courseSchema,
  deckSchema,
} from "@/app/learn/_lib/course-validation"

describe("courseSchema", () => {
  it("trims the title and nulls a blank description", () => {
    const parsed = courseSchema.safeParse({
      title: "  Biology 101  ",
      description: "   ",
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.title).toBe("Biology 101")
    expect(parsed.data.description).toBeNull()
  })

  it("rejects an empty title", () => {
    expect(courseSchema.safeParse({ title: "   " }).success).toBe(false)
  })

  it("rejects a title over 200 characters", () => {
    expect(courseSchema.safeParse({ title: "x".repeat(201) }).success).toBe(
      false
    )
  })
})

describe("deckSchema", () => {
  it("requires a title", () => {
    expect(deckSchema.safeParse({ title: "Cell structure" }).success).toBe(true)
    expect(deckSchema.safeParse({ title: "" }).success).toBe(false)
  })
})

describe("cardSchema", () => {
  it("requires both sides", () => {
    expect(
      cardSchema.safeParse({ front: "What is ATP?", back: "Energy currency" })
        .success
    ).toBe(true)
    expect(cardSchema.safeParse({ front: "q", back: "  " }).success).toBe(false)
    expect(cardSchema.safeParse({ front: " ", back: "a" }).success).toBe(false)
  })

  it("rejects a side over 10000 characters", () => {
    expect(
      cardSchema.safeParse({ front: "x".repeat(10001), back: "a" }).success
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
corepack yarn workspace web test course-validation
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write the schemas**

Create `apps/web/app/learn/_lib/course-validation.ts`:

```ts
import { z } from "zod"

/**
 * Input schemas for authoring. Pure — no server imports — so both the actions
 * and their tests use the same rules.
 *
 * The length ceilings are guards against a paste accident filling a column,
 * not editorial limits: 200 chars is a long course title, 10k a long card.
 *
 * @spec L2-COURSE-05
 */

const requiredText = (max: number, label: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, `${label} is required.`)
    .refine((v) => v.length <= max, `${label} must be ${max} characters or fewer.`)

/** Trim → null when empty. */
const optionalText = z
  .string()
  .nullish()
  .transform((v) => {
    const t = (v ?? "").trim()
    return t.length > 0 ? t : null
  })

export const courseSchema = z.object({
  title: requiredText(200, "Title"),
  description: optionalText,
})

export const deckSchema = z.object({
  title: requiredText(200, "Title"),
})

export const cardSchema = z.object({
  front: requiredText(10_000, "Front"),
  back: requiredText(10_000, "Back"),
})
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
corepack yarn workspace web test course-validation
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Write the course actions**

Create `apps/web/app/learn/courses/_actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"

import { courses, db } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { firstError } from "@/app/_lib/validation"
import { courseSchema } from "@/app/learn/_lib/course-validation"

/**
 * Course authoring actions. Every one re-resolves the teacher server-side and
 * scopes writes with `schoolId` in the WHERE clause — a course id from the
 * client is never trusted on its own (`L2-SCHOOL-05`, `L2-SCHOOL-06`).
 *
 * @spec L2-COURSE-06
 */

export type ActionState = { ok: boolean; message: string } | null

export async function createCourse(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()

  const parsed = courseSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description:
      formData.get("description") == null
        ? undefined
        : String(formData.get("description")),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  await db.insert(courses).values({
    schoolId: teacher.schoolId,
    ownerId: teacher.userId,
    title: parsed.data.title,
    description: parsed.data.description,
  })

  revalidatePath("/learn/courses")
  return { ok: true, message: "Course created." }
}

export async function updateCourse(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const id = String(formData.get("id") ?? "")

  const parsed = courseSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description:
      formData.get("description") == null
        ? undefined
        : String(formData.get("description")),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  const updated = await db
    .update(courses)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      updatedAt: new Date(),
    })
    .where(and(eq(courses.id, id), eq(courses.schoolId, teacher.schoolId)))
    .returning({ id: courses.id })

  if (updated.length === 0) return { ok: false, message: "Course not found." }

  revalidatePath("/learn/courses")
  revalidatePath(`/learn/courses/${id}`)
  return { ok: true, message: "Saved." }
}

export async function setCourseStatus(
  courseId: string,
  status: "draft" | "published"
): Promise<ActionState> {
  const teacher = await requireTeacher()

  const updated = await db
    .update(courses)
    .set({ status, updatedAt: new Date() })
    .where(
      and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId))
    )
    .returning({ id: courses.id })

  if (updated.length === 0) return { ok: false, message: "Course not found." }

  revalidatePath("/learn/courses")
  revalidatePath(`/learn/courses/${courseId}`)
  return {
    ok: true,
    message: status === "published" ? "Course published." : "Course unpublished.",
  }
}

export async function deleteCourse(courseId: string): Promise<ActionState> {
  const teacher = await requireTeacher()

  // Decks, cards, enrolments and every student's scheduling state go with it,
  // by FK cascade. That is intended: an unpublished mistake should vanish.
  const deleted = await db
    .delete(courses)
    .where(
      and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId))
    )
    .returning({ id: courses.id })

  if (deleted.length === 0) return { ok: false, message: "Course not found." }

  revalidatePath("/learn/courses")
  return { ok: true, message: "Course deleted." }
}
```

- [ ] **Step 6: Typecheck**

```bash
corepack yarn workspace web typecheck
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/learn/_lib apps/web/app/learn/courses/_actions.ts
git commit -m "feat(learn): add course authoring actions"
```

---

### Task 3: Course list and detail pages

**Files:**
- Create: `apps/web/app/learn/courses/page.tsx`
- Create: `apps/web/app/learn/courses/_components/course-form.tsx`
- Create: `apps/web/app/learn/courses/[courseId]/page.tsx`
- Create: `apps/web/app/learn/courses/[courseId]/_components/course-header.tsx`

**Interfaces:**
- Consumes: the actions from Task 2; `requireTeacher` from plan 1.
- Produces: routes `/learn/courses` and `/learn/courses/[courseId]`. Later tasks add deck and card management inside the detail page.

- [ ] **Step 1: Write the course form**

Create `apps/web/app/learn/courses/_components/course-form.tsx`:

```tsx
"use client"

import { useActionState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

import { createCourse, type ActionState } from "../_actions"

/** New-course form. The action re-checks the teacher role server-side. */
export function CourseForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createCourse,
    null
  )

  return (
    <form action={action} className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="course-title">Title</Label>
        <Input id="course-title" name="title" required placeholder="Biology 101" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="course-description">Description</Label>
        <Textarea
          id="course-description"
          name="description"
          rows={3}
          placeholder="What this course covers."
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create course"}
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

- [ ] **Step 2: Write the list page**

Create `apps/web/app/learn/courses/page.tsx`:

```tsx
import Link from "next/link"

import { cards, courses, db, decks } from "@workspace/db"
import { count, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { CourseForm } from "./_components/course-form"

/**
 * Teacher's course list. Scoped to the teacher's school in the WHERE clause,
 * so a course from another school is unreachable, not merely unlinked.
 *
 * @spec L2-COURSE-06, L2-SCHOOL-06
 */
export default async function CoursesPage() {
  const teacher = await requireTeacher()

  const rows = await db
    .select({
      id: courses.id,
      title: courses.title,
      status: courses.status,
      cardCount: count(cards.id),
    })
    .from(courses)
    .leftJoin(decks, eq(decks.courseId, courses.id))
    .leftJoin(cards, eq(cards.deckId, decks.id))
    .where(eq(courses.schoolId, teacher.schoolId))
    .groupBy(courses.id)
    .orderBy(courses.title)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Courses</h1>

      <ul className="divide-y">
        {rows.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-3">
            <Link href={`/learn/courses/${c.id}`} className="hover:underline">
              {c.title}
            </Link>
            <span className="text-muted-foreground text-xs capitalize">
              {c.status}
            </span>
            <span className="text-muted-foreground ml-auto text-xs">
              {c.cardCount} card{c.cardCount === 1 ? "" : "s"}
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-muted-foreground py-3 text-sm">
            No courses yet. Create the first one below.
          </li>
        )}
      </ul>

      <CourseForm />
    </div>
  )
}
```

- [ ] **Step 3: Write the course header component**

Create `apps/web/app/learn/courses/[courseId]/_components/course-header.tsx`:

```tsx
"use client"

import { useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

import { setCourseStatus } from "../../_actions"

/**
 * Course title plus the publish toggle. Publishing is what makes enrolments
 * take effect, so it is the primary control here, not a settings detail.
 */
export function CourseHeader({
  courseId,
  title,
  description,
  status,
}: {
  courseId: string
  title: string
  description: string | null
  status: "draft" | "published"
}) {
  const [pending, start] = useTransition()
  const next = status === "published" ? "draft" : "published"

  return (
    <div className="flex items-start gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
        <p className="text-muted-foreground text-xs capitalize">{status}</p>
      </div>

      <Button
        variant="outline"
        className="ml-auto"
        disabled={pending}
        onClick={() => start(() => void setCourseStatus(courseId, next))}
      >
        {status === "published" ? "Unpublish" : "Publish"}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Write the detail page**

Create `apps/web/app/learn/courses/[courseId]/page.tsx`. Task 4 replaces the deck placeholder with real deck management.

```tsx
import { notFound } from "next/navigation"

import { courses, db } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { CourseHeader } from "./_components/course-header"

/**
 * Course detail. The school check lives in the WHERE clause, so a course id
 * belonging to another school 404s rather than leaking a title.
 *
 * @spec L2-COURSE-06, L2-SCHOOL-06
 */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const teacher = await requireTeacher()

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId)))

  if (!course) notFound()

  return (
    <div className="space-y-8">
      <CourseHeader
        courseId={course.id}
        title={course.title}
        description={course.description}
        status={course.status}
      />
      <p className="text-muted-foreground text-sm">
        Decks appear here once deck management lands.
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Verify by hand**

```bash
corepack yarn dev
```

Signed in as a teacher (plan 1 task 4 invited one), visit http://localhost:3070/learn/courses. Create a course, open it, publish it, unpublish it. Then confirm a student is refused:

```bash
docker compose exec backflip-db psql -U postgres -d backflip -c \
  "update school_member set role = 'student' where \"userId\" = (select id from \"user\" where role = 'owner');"
```

Reload `/learn/courses`. Expected: redirected to `/learn`. Set the role back to `teacher` afterwards.

- [ ] **Step 6: Typecheck and lint**

```bash
corepack yarn workspace web typecheck && corepack yarn workspace web lint
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/learn/courses
git commit -m "feat(learn): add course list and detail pages"
```

---

### Task 4: Decks and cards

**Files:**
- Create: `apps/web/app/learn/courses/[courseId]/_actions.ts`
- Create: `apps/web/app/learn/courses/[courseId]/_components/deck-list.tsx`
- Create: `apps/web/app/learn/courses/[courseId]/decks/[deckId]/page.tsx`
- Create: `apps/web/app/learn/courses/[courseId]/decks/[deckId]/_components/card-editor.tsx`
- Create: `apps/web/app/learn/_components/markdown.tsx`
- Modify: `apps/web/app/learn/courses/[courseId]/page.tsx` (replace the placeholder from Task 3 step 4)

**Interfaces:**
- Consumes: `deckSchema`, `cardSchema` from Task 2; `requireTeacher`.
- Produces:
  - `createDeck(prev, formData): Promise<ActionState>` — form fields `courseId`, `title`
  - `deleteDeck(deckId: string): Promise<ActionState>`
  - `createCard(prev, formData): Promise<ActionState>` — form fields `deckId`, `front`, `back`
  - `updateCard(prev, formData): Promise<ActionState>` — form fields `id`, `front`, `back`
  - `deleteCard(cardId: string): Promise<ActionState>`
  - `<Markdown source={string} />` from `@/app/learn/_components/markdown`

Ownership is verified by joining up to the course and matching `schoolId`, never by trusting the id in the form.

- [ ] **Step 1: Write the markdown renderer**

Create `apps/web/app/learn/_components/markdown.tsx`. `react-markdown` and `remark-gfm` are already dependencies of `web`.

```tsx
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * Card and lesson markdown. `react-markdown` does not render raw HTML unless
 * `rehype-raw` is added, so teacher input cannot inject markup — do not add
 * that plugin without an sanitizer.
 *
 * @spec L2-COURSE-07
 */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 2: Write the deck and card actions**

Create `apps/web/app/learn/courses/[courseId]/_actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"

import { cards, courses, db, decks } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { firstError } from "@/app/_lib/validation"
import { cardSchema, deckSchema } from "@/app/learn/_lib/course-validation"
import type { ActionState } from "../_actions"

/**
 * Deck and card authoring. Ownership is proven by joining up to the course and
 * matching the teacher's school — an id posted from the client is only ever a
 * lookup key, never evidence of access (`L2-SCHOOL-06`).
 *
 * @spec L2-COURSE-06
 */

/** The deck's course id when this teacher may touch it, else null. */
async function courseIdForDeck(deckId: string, schoolId: string) {
  const [row] = await db
    .select({ courseId: decks.courseId })
    .from(decks)
    .innerJoin(courses, eq(courses.id, decks.courseId))
    .where(and(eq(decks.id, deckId), eq(courses.schoolId, schoolId)))
  return row?.courseId ?? null
}

export async function createDeck(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const courseId = String(formData.get("courseId") ?? "")

  const parsed = deckSchema.safeParse({ title: String(formData.get("title") ?? "") })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId)))
  if (!course) return { ok: false, message: "Course not found." }

  await db.insert(decks).values({ courseId, title: parsed.data.title })

  revalidatePath(`/learn/courses/${courseId}`)
  return { ok: true, message: "Deck added." }
}

export async function deleteDeck(deckId: string): Promise<ActionState> {
  const teacher = await requireTeacher()
  const courseId = await courseIdForDeck(deckId, teacher.schoolId)
  if (!courseId) return { ok: false, message: "Deck not found." }

  await db.delete(decks).where(eq(decks.id, deckId))

  revalidatePath(`/learn/courses/${courseId}`)
  return { ok: true, message: "Deck deleted." }
}

export async function createCard(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const deckId = String(formData.get("deckId") ?? "")

  const parsed = cardSchema.safeParse({
    front: String(formData.get("front") ?? ""),
    back: String(formData.get("back") ?? ""),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  const courseId = await courseIdForDeck(deckId, teacher.schoolId)
  if (!courseId) return { ok: false, message: "Deck not found." }

  await db.insert(cards).values({
    deckId,
    front: parsed.data.front,
    back: parsed.data.back,
  })

  revalidatePath(`/learn/courses/${courseId}/decks/${deckId}`)
  return { ok: true, message: "Card added." }
}

export async function updateCard(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const id = String(formData.get("id") ?? "")

  const parsed = cardSchema.safeParse({
    front: String(formData.get("front") ?? ""),
    back: String(formData.get("back") ?? ""),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }

  const [owned] = await db
    .select({ deckId: cards.deckId, courseId: decks.courseId })
    .from(cards)
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .innerJoin(courses, eq(courses.id, decks.courseId))
    .where(and(eq(cards.id, id), eq(courses.schoolId, teacher.schoolId)))
  if (!owned) return { ok: false, message: "Card not found." }

  await db
    .update(cards)
    .set({ front: parsed.data.front, back: parsed.data.back, updatedAt: new Date() })
    .where(eq(cards.id, id))

  revalidatePath(`/learn/courses/${owned.courseId}/decks/${owned.deckId}`)
  return { ok: true, message: "Saved." }
}

export async function deleteCard(cardId: string): Promise<ActionState> {
  const teacher = await requireTeacher()

  const [owned] = await db
    .select({ deckId: cards.deckId, courseId: decks.courseId })
    .from(cards)
    .innerJoin(decks, eq(decks.id, cards.deckId))
    .innerJoin(courses, eq(courses.id, decks.courseId))
    .where(and(eq(cards.id, cardId), eq(courses.schoolId, teacher.schoolId)))
  if (!owned) return { ok: false, message: "Card not found." }

  await db.delete(cards).where(eq(cards.id, cardId))

  revalidatePath(`/learn/courses/${owned.courseId}/decks/${owned.deckId}`)
  return { ok: true, message: "Card deleted." }
}
```

- [ ] **Step 3: Write the deck list**

Create `apps/web/app/learn/courses/[courseId]/_components/deck-list.tsx`:

```tsx
"use client"

import Link from "next/link"
import { useActionState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import type { ActionState } from "../../_actions"
import { createDeck } from "../_actions"

export type DeckRow = { id: string; title: string; cardCount: number }

/** Decks in a course, with an inline add form. */
export function DeckList({
  courseId,
  decks,
}: {
  courseId: string
  decks: DeckRow[]
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createDeck,
    null
  )

  return (
    <div className="space-y-4">
      <h2 className="font-medium">Decks</h2>

      <ul className="divide-y">
        {decks.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-2">
            <Link
              href={`/learn/courses/${courseId}/decks/${d.id}`}
              className="hover:underline"
            >
              {d.title}
            </Link>
            <span className="text-muted-foreground ml-auto text-xs">
              {d.cardCount} card{d.cardCount === 1 ? "" : "s"}
            </span>
          </li>
        ))}
        {decks.length === 0 && (
          <li className="text-muted-foreground py-2 text-sm">No decks yet.</li>
        )}
      </ul>

      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="courseId" value={courseId} />
        <Input name="title" required placeholder="New deck title" />
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add deck"}
        </Button>
      </form>

      {state && !state.ok && (
        <p className="text-destructive text-sm">{state.message}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire decks into the course page**

In `apps/web/app/learn/courses/[courseId]/page.tsx`, replace the placeholder paragraph from Task 3 with a deck query and the component. Add these imports at the top:

```tsx
import { cards, decks as decksTable } from "@workspace/db"
import { count } from "drizzle-orm"

import { DeckList } from "./_components/deck-list"
```

Then, after the `if (!course) notFound()` line, add:

```tsx
  const deckRows = await db
    .select({
      id: decksTable.id,
      title: decksTable.title,
      cardCount: count(cards.id),
    })
    .from(decksTable)
    .leftJoin(cards, eq(cards.deckId, decksTable.id))
    .where(eq(decksTable.courseId, course.id))
    .groupBy(decksTable.id)
    .orderBy(decksTable.position, decksTable.title)
```

and replace the placeholder `<p>` with:

```tsx
      <DeckList courseId={course.id} decks={deckRows} />
```

- [ ] **Step 5: Write the card editor**

Create `apps/web/app/learn/courses/[courseId]/decks/[deckId]/_components/card-editor.tsx`:

```tsx
"use client"

import { useActionState, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

import type { ActionState } from "../../../../_actions"
import { createCard } from "../../../_actions"

/**
 * New-card form with a live preview. Preview is plain text rather than
 * rendered markdown: `Markdown` is a server component here, and pulling a
 * renderer into the client bundle for a preview is not worth the kilobytes in
 * v1. The saved card renders as markdown on the study screen.
 */
export function CardEditor({ deckId }: { deckId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createCard,
    null
  )
  const [front, setFront] = useState("")

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="deckId" value={deckId} />

      <div className="space-y-2">
        <Label htmlFor="card-front">Front (markdown)</Label>
        <Textarea
          id="card-front"
          name="front"
          required
          rows={4}
          value={front}
          onChange={(e) => setFront(e.target.value)}
          placeholder="What does ATP stand for?"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="card-back">Back (markdown)</Label>
        <Textarea
          id="card-back"
          name="back"
          required
          rows={4}
          placeholder="Adenosine triphosphate"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add card"}
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

- [ ] **Step 6: Write the deck page**

Create `apps/web/app/learn/courses/[courseId]/decks/[deckId]/page.tsx`:

```tsx
import { notFound } from "next/navigation"

import { cards, courses, db, decks } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { Markdown } from "@/app/learn/_components/markdown"
import { CardEditor } from "./_components/card-editor"

/**
 * Deck detail: the cards in it, and the form to add one. Ownership is proven
 * by the join to `course` on the teacher's school.
 *
 * @spec L2-COURSE-06, L2-SCHOOL-06
 */
export default async function DeckPage({
  params,
}: {
  params: Promise<{ courseId: string; deckId: string }>
}) {
  const { deckId } = await params
  const teacher = await requireTeacher()

  const [deck] = await db
    .select({ id: decks.id, title: decks.title })
    .from(decks)
    .innerJoin(courses, eq(courses.id, decks.courseId))
    .where(and(eq(decks.id, deckId), eq(courses.schoolId, teacher.schoolId)))

  if (!deck) notFound()

  const rows = await db
    .select({ id: cards.id, front: cards.front, back: cards.back })
    .from(cards)
    .where(eq(cards.deckId, deck.id))
    .orderBy(cards.position, cards.createdAt)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{deck.title}</h1>

      <ul className="divide-y">
        {rows.map((c) => (
          <li key={c.id} className="space-y-2 py-4">
            <Markdown source={c.front} />
            <div className="text-muted-foreground border-l-2 pl-3">
              <Markdown source={c.back} />
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-muted-foreground py-3 text-sm">No cards yet.</li>
        )}
      </ul>

      <CardEditor deckId={deck.id} />
    </div>
  )
}
```

- [ ] **Step 7: Verify by hand**

```bash
corepack yarn dev
```

As a teacher: open a course, add a deck, open it, add a card with markdown (`**bold**` and a list). Confirm the list renders as formatted markdown, not literal asterisks.

- [ ] **Step 8: Typecheck, lint and full test run**

```bash
corepack yarn workspace web typecheck && corepack yarn workspace web lint && corepack yarn workspace web test
```

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/learn
git commit -m "feat(learn): author decks and markdown cards"
```

---

### Task 5: Enrolment

**Files:**
- Create: `apps/web/app/learn/courses/[courseId]/students/page.tsx`
- Create: `apps/web/app/learn/courses/[courseId]/students/_actions.ts`
- Create: `apps/web/app/learn/courses/[courseId]/students/_components/enroll-form.tsx`
- Modify: `apps/web/app/learn/courses/[courseId]/_components/course-header.tsx` (add a link)
- Modify: `docs/contracts/courses.md`, `docs/notes/courses.md`

**Interfaces:**
- Consumes: `requireTeacher`; `schoolMembers`, `users`, `enrollments`, `courses` from `@workspace/db`.
- Produces:
  - `enrollStudent(prev, formData): Promise<ActionState>` — form fields `courseId`, `userId`
  - `unenrollStudent(courseId: string, userId: string): Promise<ActionState>`

- [ ] **Step 1: Write the enrolment actions**

Create `apps/web/app/learn/courses/[courseId]/students/_actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"

import { courses, db, enrollments, schoolMembers } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import type { ActionState } from "../../_actions"

/**
 * Enrolment. Both the course and the student are re-verified against the
 * teacher's school, so neither id from the form grants access on its own
 * (`L2-SCHOOL-06`).
 *
 * @spec L2-COURSE-08
 */

export async function enrollStudent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const teacher = await requireTeacher()
  const courseId = String(formData.get("courseId") ?? "")
  const userId = String(formData.get("userId") ?? "")

  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId)))
  if (!course) return { ok: false, message: "Course not found." }

  const [member] = await db
    .select({ userId: schoolMembers.userId })
    .from(schoolMembers)
    .where(
      and(
        eq(schoolMembers.userId, userId),
        eq(schoolMembers.schoolId, teacher.schoolId),
        eq(schoolMembers.role, "student")
      )
    )
  if (!member) return { ok: false, message: "Not a student in this school." }

  // Enrolling twice is a no-op, not an error — the teacher's intent is met.
  await db
    .insert(enrollments)
    .values({ courseId, userId })
    .onConflictDoNothing({
      target: [enrollments.courseId, enrollments.userId],
    })

  revalidatePath(`/learn/courses/${courseId}/students`)
  return { ok: true, message: "Student enrolled." }
}

export async function unenrollStudent(
  courseId: string,
  userId: string
): Promise<ActionState> {
  const teacher = await requireTeacher()

  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId)))
  if (!course) return { ok: false, message: "Course not found." }

  // Their `card_state` rows survive: re-enrolling should resume a schedule,
  // not reset one. Only the enrolment is removed.
  await db
    .delete(enrollments)
    .where(
      and(eq(enrollments.courseId, courseId), eq(enrollments.userId, userId))
    )

  revalidatePath(`/learn/courses/${courseId}/students`)
  return { ok: true, message: "Student removed." }
}
```

- [ ] **Step 2: Write the enrol form**

Create `apps/web/app/learn/courses/[courseId]/students/_components/enroll-form.tsx`:

```tsx
"use client"

import { useActionState } from "react"

import { Button } from "@workspace/ui/components/button"

import type { ActionState } from "../../../_actions"
import { enrollStudent } from "../_actions"

export type Candidate = { id: string; label: string }

/** Enrol one of the school's students who is not already on the course. */
export function EnrollForm({
  courseId,
  candidates,
}: {
  courseId: string
  candidates: Candidate[]
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    enrollStudent,
    null
  )

  if (candidates.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Every student in the school is already enrolled.
      </p>
    )
  }

  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <select
        name="userId"
        required
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending}>
        {pending ? "Enrolling…" : "Enrol"}
      </Button>
      {state && !state.ok && (
        <p className="text-destructive text-sm">{state.message}</p>
      )}
    </form>
  )
}
```

- [ ] **Step 3: Write the students page**

Create `apps/web/app/learn/courses/[courseId]/students/page.tsx`:

```tsx
import { notFound } from "next/navigation"

import { courses, db, enrollments, schoolMembers, users } from "@workspace/db"
import { and, eq, notInArray } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { EnrollForm } from "./_components/enroll-form"

/**
 * Roster for one course: who is enrolled, and who else could be.
 *
 * @spec L2-COURSE-08
 */
export default async function StudentsPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  const teacher = await requireTeacher()

  const [course] = await db
    .select({ id: courses.id, title: courses.title })
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.schoolId, teacher.schoolId)))
  if (!course) notFound()

  const enrolled = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(eq(enrollments.courseId, course.id))
    .orderBy(users.email)

  const enrolledIds = enrolled.map((e) => e.id)

  const candidateRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(schoolMembers)
    .innerJoin(users, eq(users.id, schoolMembers.userId))
    .where(
      and(
        eq(schoolMembers.schoolId, teacher.schoolId),
        eq(schoolMembers.role, "student"),
        // `notInArray` with an empty list is invalid SQL, so guard it.
        enrolledIds.length > 0 ? notInArray(users.id, enrolledIds) : undefined
      )
    )
    .orderBy(users.email)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{course.title} — students</h1>

      <ul className="divide-y">
        {enrolled.map((s) => (
          <li key={s.id} className="py-2 text-sm">
            {s.name ?? s.email}
            <span className="text-muted-foreground ml-2 text-xs">{s.email}</span>
          </li>
        ))}
        {enrolled.length === 0 && (
          <li className="text-muted-foreground py-2 text-sm">
            Nobody enrolled yet.
          </li>
        )}
      </ul>

      <EnrollForm
        courseId={course.id}
        candidates={candidateRows.map((c) => ({
          id: c.id,
          label: c.name ? `${c.name} (${c.email})` : c.email,
        }))}
      />
    </div>
  )
}
```

- [ ] **Step 4: Link the roster from the course header**

In `apps/web/app/learn/courses/[courseId]/_components/course-header.tsx`, add the import:

```tsx
import Link from "next/link"
```

and place this immediately before the publish `<Button>`, changing the button's `className` from `"ml-auto"` to `""`:

```tsx
      <Link
        href={`/learn/courses/${courseId}/students`}
        className="text-muted-foreground hover:text-foreground ml-auto text-sm"
      >
        Students
      </Link>
```

- [ ] **Step 5: Verify by hand**

```bash
corepack yarn dev
```

Invite a second person as a student from `/backflip/school`. As the teacher, open a course, click Students, enrol them. Confirm they move out of the dropdown and into the list. Submit the same enrolment twice by going back and forward: expect no error and no duplicate row.

```bash
docker compose exec backflip-db psql -U postgres -d backflip -c "select count(*) from enrollment;"
```

- [ ] **Step 6: Typecheck, lint, test**

```bash
corepack yarn workspace web typecheck && corepack yarn workspace web lint && corepack yarn workspace web test
```

- [ ] **Step 7: Write the L2 contract**

Create `docs/contracts/courses.md` following the shape of `docs/contracts/school.md`, with:

- `L2-COURSE-01` … `L2-COURSE-04` — the four tables, citing `L2-DB-40` … `L2-DB-43`.
- `L2-COURSE-05` — `@/app/learn/_lib/course-validation` → `courseSchema`, `deckSchema`, `cardSchema`. Pure. Title ≤ 200 chars, card side ≤ 10 000, blank description → null.
- `L2-COURSE-06` — Every authoring action calls `requireTeacher()` and proves ownership by matching `courses.schoolId` in the WHERE clause or a join. An id from the client is a lookup key, never evidence of access.
- `L2-COURSE-07` — Card `front`/`back` are markdown, rendered by `@/app/learn/_components/markdown` with `remark-gfm`. Raw HTML is not rendered; adding `rehype-raw` would require a sanitizer.
- `L2-COURSE-08` — Enrolment: teacher-driven only. `enrollStudent` verifies the target is a `student` member of the same school; re-enrolling is a no-op (`onConflictDoNothing`). `unenrollStudent` removes only the enrolment row and leaves `card_state`, so re-enrolling resumes a schedule rather than resetting it.
- `L2-COURSE-09` — A `draft` course is invisible to students; publishing activates existing enrolments. Enrolment and publication are independent, so a teacher can build a course with students already attached.

Add `courses` to the L2 domain list in the commit summary for the human to add to L1. Create `docs/notes/courses.md` with the route inventory and the manual verification steps.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/learn docs/contracts/courses.md docs/notes/courses.md
git commit -m "feat(learn): enrol students into courses"
```

---

### Task 6: Card images

The spec calls for images on cards, stored in the persistent `shared/` dir the deploy already provisions (`L2-DEVOPS-01`). Upload is a server action (a server action can take a `File` straight off `FormData`); **serving** must be a route handler, because there is no other way to return bytes. That is consistent with `L1-ARCH-03`: a binary endpoint is not a data layer.

**Files:**
- Create: `apps/web/app/learn/_lib/uploads.ts`
- Create: `apps/web/app/learn/_lib/uploads.test.ts`
- Create: `apps/web/app/learn/courses/[courseId]/decks/[deckId]/_upload-actions.ts`
- Create: `apps/web/app/api/learn/uploads/[name]/route.ts`
- Modify: `.env.example`
- Modify: `docs/contracts/courses.md`, `docs/notes/courses.md`, `docs/contracts/infra.md`

**Interfaces:**
- Produces:
  - `UPLOAD_DIR: string` and `uploadPath(name: string): string` from `@/app/learn/_lib/uploads`
  - `safeUploadName(originalName: string): string | null` — pure; returns a random name with a permitted extension, or null when the type is not allowed
  - `uploadCardImage(prev, formData): Promise<{ ok: boolean; message: string; url?: string }>` — form field `file`
  - `GET /api/learn/uploads/[name]` — serves an uploaded file

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/learn/_lib/uploads.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { safeUploadName } from "@/app/learn/_lib/uploads"

describe("safeUploadName", () => {
  it("keeps a permitted extension and discards the original name", () => {
    const name = safeUploadName("Holiday Photo.PNG")
    expect(name).not.toBeNull()
    expect(name!.endsWith(".png")).toBe(true)
    expect(name!.toLowerCase()).not.toContain("holiday")
  })

  it("accepts the image types we render", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp"]) {
      expect(safeUploadName(`a.${ext}`)).not.toBeNull()
    }
  })

  it("refuses anything else", () => {
    expect(safeUploadName("payload.svg")).toBeNull()
    expect(safeUploadName("payload.html")).toBeNull()
    expect(safeUploadName("payload.js")).toBeNull()
    expect(safeUploadName("noextension")).toBeNull()
  })

  it("cannot be talked into a path", () => {
    const name = safeUploadName("../../etc/passwd.png")
    expect(name).not.toBeNull()
    expect(name!).not.toContain("/")
    expect(name!).not.toContain("..")
  })

  it("gives every upload a distinct name", () => {
    expect(safeUploadName("a.png")).not.toBe(safeUploadName("a.png"))
  })
})
```

SVG is refused deliberately: it is a script-carrying document, and serving one from our own origin would be stored XSS.

- [ ] **Step 2: Run it and watch it fail**

```bash
corepack yarn workspace web test uploads
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write the module**

Create `apps/web/app/learn/_lib/uploads.ts`:

```ts
import { join } from "node:path"

/**
 * Card image storage. Files land in the persistent `shared/` dir the deploy
 * already provisions and never in the build output, so a release does not wipe
 * them.
 *
 * The stored name is generated, never the uploaded one: that closes path
 * traversal, collisions and unicode-lookalike tricks in one move, and it means
 * `uploadPath` can never be pointed outside `UPLOAD_DIR`.
 *
 * @spec L2-COURSE-10
 */

/** Extensions we will store and serve. SVG is excluded — it can carry script. */
const ALLOWED = new Map<string, string>([
  ["png", "png"],
  ["jpg", "jpg"],
  ["jpeg", "jpg"],
  ["gif", "gif"],
  ["webp", "webp"],
])

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? join(process.cwd(), "shared", "uploads")

/**
 * A safe stored name for an upload, or null when the type is not permitted.
 * Pure apart from the random id, so it is testable directly.
 */
export function safeUploadName(originalName: string): string | null {
  const dot = originalName.lastIndexOf(".")
  if (dot < 0) return null
  const ext = ALLOWED.get(originalName.slice(dot + 1).toLowerCase())
  if (!ext) return null
  return `${crypto.randomUUID()}.${ext}`
}

/**
 * Absolute path for a stored name. Rejects anything that is not a bare
 * filename, so a crafted route param cannot escape the directory.
 */
export function uploadPath(name: string) {
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error("Invalid upload name.")
  }
  return join(UPLOAD_DIR, name)
}
```

- [ ] **Step 4: Run the test and watch it pass**

```bash
corepack yarn workspace web test uploads
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Write the upload action**

Create `apps/web/app/learn/courses/[courseId]/decks/[deckId]/_upload-actions.ts`:

```ts
"use server"

import { mkdir, writeFile } from "node:fs/promises"

import { requireTeacher } from "@/app/_lib/school"
import { UPLOAD_DIR, safeUploadName, uploadPath } from "@/app/learn/_lib/uploads"

/**
 * Store one card image and hand back the markdown URL for it. Teacher-only.
 *
 * @spec L2-COURSE-10
 */

const MAX_BYTES = 2 * 1024 * 1024

export type UploadState =
  | { ok: boolean; message: string; url?: string }
  | null

export async function uploadCardImage(
  _prev: UploadState,
  formData: FormData
): Promise<UploadState> {
  await requireTeacher()

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file." }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "Images must be 2 MB or smaller." }
  }

  const name = safeUploadName(file.name)
  if (!name) {
    return { ok: false, message: "Use a PNG, JPEG, GIF or WebP image." }
  }

  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(uploadPath(name), Buffer.from(await file.arrayBuffer()))

  const url = `/api/learn/uploads/${name}`
  return { ok: true, message: `Uploaded. Paste ![](${url}) into a card.`, url }
}
```

- [ ] **Step 6: Write the serving route**

Create `apps/web/app/api/learn/uploads/[name]/route.ts`:

```ts
import { readFile } from "node:fs/promises"

import { auth } from "@/app/_lib/auth"
import { uploadPath } from "@/app/learn/_lib/uploads"

/**
 * Serve an uploaded card image. A route handler rather than a server action
 * because there is no other way to return bytes; this is a binary endpoint,
 * not a data layer, so `L1-ARCH-03` is satisfied.
 *
 * Gated on a session only, not on membership: images are embedded in card
 * markdown and requested by the browser as sub-resources, and a per-image
 * enrolment check would cost one query per image on every study screen. The
 * names are unguessable UUIDs, so a session is the meaningful boundary here.
 *
 * @spec L2-COURSE-10
 */

export const runtime = "nodejs"

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth()
  if (!session?.user) return new Response("Unauthorized", { status: 401 })

  const { name } = await params

  let path: string
  try {
    path = uploadPath(name)
  } catch {
    return new Response("Not found", { status: 404 })
  }

  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase()
  const type = TYPES[ext]
  if (!type) return new Response("Not found", { status: 404 })

  try {
    const bytes = await readFile(path)
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        // Names are content-addressed by randomness, so a stored file never
        // changes under its name.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
```

- [ ] **Step 7: Document the env var**

Add to `.env.example`:

```
# Where card images are stored. Defaults to ./shared/uploads.
# On the droplet, point this at the persistent shared dir:
# UPLOAD_DIR=/var/www/<domain>/shared/uploads
UPLOAD_DIR=
```

Add the same line to `devops/env/production.env.example`, and record the variable in `docs/contracts/infra.md` alongside the other runtime env entries.

- [ ] **Step 8: Verify by hand**

Add an upload control to the deck page by rendering a small client form that calls `uploadCardImage`, or test the action directly for now by uploading through the card editor once wired. At minimum, confirm:

```bash
corepack yarn dev
```

- Uploading a PNG returns a `/api/learn/uploads/<uuid>.png` URL and the file appears under `shared/uploads/`.
- Pasting `![](that-url)` into a card front renders the image on the deck page.
- Requesting the URL while signed out returns 401.
- `curl -i 'http://localhost:3070/api/learn/uploads/..%2F..%2Fpackage.json'` returns 404, not a file.

- [ ] **Step 9: Typecheck, lint, test**

```bash
corepack yarn workspace web typecheck && corepack yarn workspace web lint && corepack yarn workspace web test
```

- [ ] **Step 10: Update the docs**

Add to `docs/contracts/courses.md`:

```markdown
- `L2-COURSE-10` — Card images: server action `uploadCardImage` (teacher-only, ≤2 MB, PNG/JPEG/GIF/WebP — **SVG refused**, it can carry script) writes to `UPLOAD_DIR` (default `./shared/uploads`, the deploy's persistent dir per `L2-DEVOPS-01`). Stored names are generated UUIDs, never the uploaded name, which closes traversal and collisions at once. `GET /api/learn/uploads/[name]` serves them, gated on a session — a binary endpoint, not a data layer, so `L1-ARCH-03` holds. Images are referenced from card markdown as ordinary `![](…)` links.
```

Record in `docs/notes/courses.md`, including the traversal curl check.

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/learn apps/web/app/api/learn .env.example devops/env docs/contracts docs/notes
git commit -m "feat(learn): upload and serve card images"
```

---

## Done when

- A teacher can create a course, add decks, add markdown cards, enrol students, and publish.
- A student hitting `/learn/courses` is redirected to `/learn`.
- A course id from another school 404s rather than rendering.
- Re-enrolling the same student changes nothing and raises no error.
- A teacher can upload a PNG and reference it from a card; a traversal attempt on the serving route 404s.
- `corepack yarn workspace web test`, `typecheck` and `lint` are all green.
- `docs/contracts/courses.md` and `docs/notes/courses.md` exist; `db.md` covers the four new tables.

## Handoff to plan 3

Plan 3 (`review loop`) adds `card_state`, `review_log`, the `_lib/srs/` scheduler and the study screen. It reads `cards` through `enrollments` and needs a published course with at least one card and one enrolled student, which this plan provides.
