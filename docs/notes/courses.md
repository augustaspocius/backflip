# Notes (L3) — courses

> L3 = how / volatile. AI writes free. Cites L2 IDs up. Matches code as-is.
> `docs/contracts/courses.md` does not exist yet (arrives in a later task in
> this plan) — the `@spec` tags below forward-reference `L2-COURSE-05` and
> `L2-COURSE-06`, the same forward-reference pattern already used by
> `packages/db/src/schema.ts` and `docs/contracts/db.md` for `L2-COURSE-01..04`.

## File map
- `apps/web/app/learn/_lib/course-validation.ts` — pure input schemas for authoring, no server imports so both the actions and their test share one set of rules: `courseSchema` (`title` required, trimmed, ≤200 chars; `description` trimmed, blank → `null`), `deckSchema` (`title`, same rule), `cardSchema` (`front`/`back`, required + trimmed, ≤10,000 chars each). Length ceilings are paste-accident guards, not editorial limits. Forward-references `L2-COURSE-05`.
- `apps/web/app/learn/_lib/course-validation.test.ts` — unit tests for the three schemas: title trim + blank-description → `null`, empty-title rejection, over-length rejection (course + card), deck title required, card requires both non-blank sides.
- `apps/web/app/learn/courses/_actions.ts` — course authoring server actions: `createCourse`, `updateCourse`, `setCourseStatus`, `deleteCourse`, plus the shared `ActionState` type. Every action calls `requireTeacher()` itself (never trusts a hidden-UI check) and takes `schoolId` from that call's returned membership, never from a fresh `getCurrentSchoolId()` call — the `L2-SCHOOL-11` rule. Every update/delete proves ownership inside the `WHERE` clause (`eq(courses.id, id), eq(courses.schoolId, teacher.schoolId)`) in the same query that mutates, not a fetch-then-check — a course id from another school matches zero rows and the action returns "Course not found." rather than leaking existence. `deleteCourse` relies on FK cascade (`L2-DB-40..43`) to remove decks/cards/enrolments with the course. Forward-references `L2-COURSE-06`; satisfies `L2-SCHOOL-05`, `L2-SCHOOL-06`, `L2-SCHOOL-11`.

## Ownership proof shape
Every mutating action in `courses/_actions.ts` follows the same two-line shape: resolve the teacher server-side first (`const teacher = await requireTeacher()`), then filter the query itself on `and(eq(courses.id, id), eq(courses.schoolId, teacher.schoolId))`. This is deliberate over fetch-then-check (select the course, compare `schoolId`, then act): a single scoped `UPDATE`/`DELETE ... WHERE ... RETURNING` is one round trip with no window between the check and the write, and an empty `.returning()` array is the one signal needed to tell "not found" from "found but wrong school" apart — both report identically as "Course not found.", so a teacher never learns whether a course id belongs to a different school.

## `schoolId` source, restated
`createCourse` and every scoped update/delete take `schoolId` from `requireTeacher()`'s return, never a second `getCurrentSchoolId()` call — the single most load-bearing rule carried over from the school domain's review (`L2-SCHOOL-11`, `docs/notes/school.md`). `getCurrentSchoolId()` has no caller in this file.

## State
Schemas + unit tests + course CRUD actions done, no UI yet — `/learn/courses` pages, forms, and the deck/card authoring surfaces arrive in later tasks of this plan and will call these same actions/schemas.
