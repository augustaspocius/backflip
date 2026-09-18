# Contract (L2) — srs

> L2 = contract / what. AI proposes, human approves. Cite ≥1 L1.
> Style: terse. One fact per line.

> **Implements L1:** `L1-ARCH-03`, `L1-ARCH-07`, `L1-ARCH-08`
> **Depends on L2:** `db` (`card_state`, `review_log` tables)

## Owns
The study loop: per-student card scheduling (FSRS), the append-only review history it is computed from, and building the study queue (`L2-SRS-04`) from the two. Not course authoring or enrolment — that is `courses`/`school`. The write path (`answerCard`) and the student/teacher routes are later tasks in this plan and add further IDs.

## Interfaces
- `L2-SRS-01` — `card_state` table, one row per (student, card): the FSRS memory state. Cites `L2-DB-45`. Unique `(userId, cardId)` — a review updates the row, never inserts a second one. Index `(userId, due)` is what a later due-cards query runs against; without it, "what's due for this student now" is a sequential scan.
- `L2-SRS-02` — `review_log` table, append-only: one row per answer, holding the pre-answer state plus the rating given. Cites `L2-DB-46`. Never updated or deleted by product code; growth is unbounded by design and is what a later FSRS parameter optimisation would train on.
- `L2-SRS-03` — `@/app/_lib/srs/schedule` → `Grade` (`1 | 2 | 3 | 4`: Again, Hard, Good, Easy), `MemoryState` (the `card_state` row shape, field-for-field), `ReviewOutcome` (`{ next, logged }`, where `logged` is the state as it stood *before* the answer — what `review_log` records), `newCardState(now)`, `schedule(current, grade, now)`, `GRADES` (`{ value, label }[]`, ordered Again→Easy, for building rating UI without hardcoding the labels). Pure: `now` is a parameter, not read from a clock; no DB access; neither argument to `schedule` is mutated. Fuzz stays off (the `ts-fsrs` default), so the same inputs always produce the same schedule and the unit suite can assert exact values instead of ranges.
- `L2-SRS-04` — `@/app/_lib/srs/queue`, server-only. `QueueCard` (`{ cardId, front, back, isNew }`). `interleave(due, fresh)` — pure: alternates the two lists starting with `due`, appending whichever list outlasts the other; tested without a database. `NEW_CARDS_PER_DAY = 20` — the new-card cap, but it is a **daily** cap, not a per-call one: it is derived each call from `review_log` rows for this user, joined `card → deck` to this course, with `state = 0` (the pre-answer state was New, so a card counts once, on its first answer) and `reviewedAt` on or after the current UTC day's start. Reloading the page does not hand out a fresh batch. `dueQueue(userId, courseId, limit = 50, now = new Date())` — the session queue: overdue `card_state` rows (`due <= now`, ordered by `due`, capped at `limit`) interleaved with unseen cards (no `card_state` row) capped at the day's *remaining* allowance (`NEW_CARDS_PER_DAY` minus cards already introduced today), not the raw daily constant. `dueCount(userId, courseId, now = new Date())` — the dashboard badge: `(reviewed cards in this course with due <= now) + min(unseen cards in this course, remaining new-card allowance today)`; without the unseen half, a freshly enrolled, never-studied course reports 0 instead of counting its first card. Both take `now` as their one clock read, used for both the `due <=` comparison and the UTC day boundary, so a single call sees one consistent instant. Both are gated by `studiableCourse` — enrolment **and** publication — before any other query (`L2-COURSE-08`, `L2-COURSE-09`); an unenrolled or not-yet-published course returns an empty queue / zero count, never an error. `startOfUtcDay(now)` — pure, exported: midnight UTC of `now`'s day. The cap resets at UTC midnight, not local midnight — a student far from UTC sees the reset at an odd local hour; known trade-off, no per-user timezone in v1.

## Invariants
- `L2-SRS-09` — `ts-fsrs` is pinned to an exact version (`5.4.2`, `apps/web/package.json`) and imported only by `apps/web/app/_lib/srs` (today: `schedule.ts`). A minor bump changes the algorithm's default parameters and would silently reschedule every student's cards without a code change to review; upgrading is a deliberate, version-bumping decision, not a routine dependency update.

## Constrained L3
- `/docs/notes/srs.md`

---
IDs: `L2-SRS-<NN>`. Permanent, never renumber.
Change: propose diff + affected-L3 → stop → await human.
