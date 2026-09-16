# Contract (L2) — courses

> L2 = contract / what. AI proposes, human approves. Cite ≥1 L1.
> Style: terse. One fact per line.

> **Implements L1:** `L1-ARCH-03`, `L1-ARCH-07`, `L1-ARCH-08`
> **Depends on L2:** `db` (course tables), `school` (membership, `requireTeacher`)

## Owns
Course authoring and enrolment: courses, decks, cards, who is enrolled in what, and the markdown rendering of a card's content. Not the study/review flow — that is a later domain in this plan.

## Interfaces
- `L2-COURSE-01` — `course` table: `id`, `schoolId` (fk → `school`, cascade, denormalized for read speed), `ownerId` (fk → `user`, set null), `title`, `description` (nullable), `status` (`draft` | `published`, default `draft`), `createdAt`, `updatedAt`. Index on `schoolId`. (`L2-DB-40`)
- `L2-COURSE-02` — `deck` table: `id`, `courseId` (fk → `course`, cascade), `title`, `position` (int, default 0, explicit order not creation time), `createdAt`. Index on `courseId`. (`L2-DB-41`)
- `L2-COURSE-03` — `card` table: `id`, `deckId` (fk → `deck`, cascade), `front` + `back` (markdown text), `position` (int, default 0), `createdAt`, `updatedAt`. No card-type column in v1 — every card is front/back and self-rated (`L2-SRS-05`). Index on `deckId`. (`L2-DB-42`)
- `L2-COURSE-04` — `enrollment` table: `id`, `courseId` (fk → `course`, cascade), `userId` (fk → `user`, cascade), `createdAt`. Unique `(courseId, userId)` — enrolling twice is a mistake, not a second enrolment. Index on `userId` for the student's "my courses" query. Created by the teacher; the student does not self-enrol in v1. (`L2-DB-43`)
- `L2-COURSE-05` — `@/app/learn/_lib/course-validation` → `courseSchema`, `deckSchema`, `cardSchema`. Pure (no server/db imports), shared by the actions and their unit tests. `title` (course/deck) required, trimmed, ≤200 chars. `description` trimmed, blank → `null`. Card `front`/`back` required, trimmed, ≤10,000 chars each — paste-accident guards, not editorial limits.
- `L2-COURSE-06` — Every authoring action calls `requireTeacher()` first and takes `schoolId` only from its return — never a client-supplied id, never a fresh `getCurrentSchoolId()` call (`L2-SCHOOL-06`, `L2-SCHOOL-11`). Ownership proof takes one of two shapes, by SQL necessity, not choice:
  - An UPDATE/DELETE self-scopes *inside its own* `WHERE`: `courses.schoolId` directly, when the row carries the column itself (`updateCourse`, `setCourseStatus`, `deleteCourse`); otherwise a subselect via `inArray(<fk column>, select ... where courses.schoolId = teacher.schoolId)` for a row with no `schoolId` of its own (`deleteDeck`, `updateCard`, `deleteCard`). One round trip, no window between check and write; an empty `.returning()` is the single "not found" signal, covering a nonexistent id and a wrong-school id identically.
  - An INSERT has no existing row to scope, so the parent is checked *before* the insert instead: `createDeck`/`createCard` `SELECT` the parent (course, or deck→course) filtered on `schoolId`, then insert. `createCourse` is the base case of this shape — it sets `courses.schoolId` to `teacher.schoolId` directly from `requireTeacher()`'s return, so a course can never be created with a `schoolId` that disagrees with its owner's `school_member` row. That is the concrete enforcement `L2-DB-44` hazard 1 requires.

  An id from the client is a lookup key, never evidence of access.
- `L2-COURSE-07` — Card `front`/`back` are markdown, rendered by `@/app/learn/_components/markdown` (`<Markdown source={string} />`, `react-markdown` + `remark-gfm`). Raw HTML is not rendered — `react-markdown` does not interpret embedded HTML unless `rehype-raw` is added, so a pasted `<script>` renders as literal text. Adding `rehype-raw` later requires pairing it with a sanitizer (e.g. `rehype-sanitize`), not adding it alone.
- `L2-COURSE-08` — Enrolment: teacher-driven only, `apps/web/app/learn/courses/[courseId]/students/_actions.ts`. `enrollStudent(prev, formData)` re-verifies, server-side, that the course belongs to `requireTeacher()`'s school **and** that the target user is a `school_member` with role `student` in that same school — neither the course id nor the user id from the form is trusted on its own. This is the concrete enforcement `L2-DB-44` hazard 2 requires, since `enrollment` carries no `schoolId` of its own to be checked by a foreign key. Re-enrolling is a no-op (`onConflictDoNothing` on the `(courseId, userId)` unique index), not an error. `unenrollStudent(courseId, userId)` removes only the `enrollment` row and leaves the student's `card_state` rows (a plan 3 table) untouched, so re-enrolling resumes a schedule rather than resetting it.
- `L2-COURSE-09` — A `draft` course is invisible to students; publishing (`setCourseStatus`) activates existing enrolments. Enrolment and publication are independent operations — a teacher can build a course and attach students to it before it is published.

## Invariants
- Every route and action under `apps/web/app/learn/courses/**` calls `requireTeacher()` server-side (`L2-SCHOOL-05`); hidden nav/buttons are never the only gate.
- `schoolId` is never denormalized onto `deck`, `card`, or `enrollment` — ownership of those rows is always proven by walking up to `course.schoolId`, per `L2-COURSE-06`.

## Errors
- A course, deck, or card id belonging to another school is indistinguishable from a nonexistent id: the scoped query matches zero rows and the action returns "not found", never leaking that the row exists elsewhere.
- `enrollStudent` returns a distinct message ("Not a student in this school.") when the target user exists but is not a student member of the teacher's school — this is not a leak, since the teacher already knows their own school's roster from the candidate dropdown; the message only ever reaches the teacher who owns the course.

## Acceptance
- Manual walkthrough (`docs/notes/courses.md`): invite a second person as a student, enrol them from a course's Students page, confirm they move from the candidate dropdown into the roster, and confirm a duplicate enrolment attempt is a no-op (no error, no duplicate row).
- Cross-school isolation for `enrollStudent`/`unenrollStudent` (a course or a student belonging to a different school) is asserted by the code shape here but is exercised end-to-end by a later task in this plan, with a real second school and second teacher — see the test-coverage gap in `docs/notes/courses.md`.

## Constrained L3
- `/docs/notes/courses.md`

---
IDs: `L2-COURSE-<NN>`. Permanent, never renumber.
Change: propose diff + affected-L3 → stop → await human.
