# Repeat & Learn — v1 design

**Date:** 2026-09-04
**Status:** approved, ready for implementation planning
**Scope:** the first buildable slice of Repeat & Learn — teacher-authored decks, invited students, and an FSRS-driven review loop.

## Summary

Repeat & Learn turns this fork of backflip into a learning platform whose core is
spaced repetition. Teachers author decks of cards; students enrol and review those
cards on a schedule computed per student per card by FSRS. Everything else the
product will eventually grow — exams, curricula, AI card generation, analytics —
is deliberately out of this spec.

The repository is already a fork (`augustaspocius/backflip`), so the work lands in
`apps/web` rather than a new repo, and backflip's constitution becomes Repeat &
Learn's constitution.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Repo | Build in this fork, `apps/web` | Already forked; inherits auth, db, UI, devops |
| Tenancy | Single school now, multi-school seam built in | Many schools are planned; the seam is cheap, the retrofit is not |
| Signup | Invite-only, Google sign-in | `L2-AUTH-10` already implements exactly this |
| Content unit | Teacher-authored cards in decks | Simplest model, teacher controls what gets drilled |
| Exams | Cut from v1 | A second product; does not make the review loop better |
| Scheduler | FSRS via `ts-fsrs` (MIT, 5.4.2) | Anki's current algorithm; pure function, no runtime cost |
| Card format | Markdown front/back + images | Covers most subjects with one authoring form |
| Enrolment | Teacher enrols students | Matches a real class; no discovery UI needed |
| Surface | New gated scope `/learn/*` | Students must not land in an operator console |

### Non-goals for v1

Exams and graded assessments. Curricula as a layer above courses. AI card
generation. Cloze deletion. Multiple-choice cards. `.apkg` import. School
management UI (creation, switching, settings). Retention analytics and charts.
Mobile apps. Offline study.

### Licensing

FSRS is an openly published algorithm developed by the Open Spaced Repetition
project, not Anki property; algorithms are not copyrightable. `ts-fsrs` is MIT —
commercial and closed-source use is permitted, subject only to retaining the
licence notice. Anki's own AGPL-3.0 code is not used anywhere, and Anki's terms of
service do not apply because AnkiWeb is not consumed. The product must not use the
Anki name or imply endorsement. Should `.apkg` import ever be added, imported decks
are third-party content with their own licences — a content question, not a code one.

## Constraint: droplet resources

The app and Postgres share one droplet (`L2-DEVOPS-04`), and it is not to grow.
Three rules follow, and they shape the design more than any feature decision:

- **No background workers, cron, queues or Redis.** Schedules are computed at the
  moment a student answers, never by a nightly sweep over every student × card.
- **No media pipeline.** Images are files under the existing persistent `shared/`
  dir, served by one route handler. No transcoding, no object storage, no thumbnails.
- **`review_log` is the only unbounded table.** It stays narrow — integers and
  timestamps — and indexed.

When nobody is studying, the system does no work at all.

## Architecture

### Surfaces

Three scopes in `apps/web`:

- **Public** — unchanged.
- **`/backflip/*`** — the operator console, unchanged. Settings, integrations,
  platform user admin. Roles `owner | admin | teammate`.
- **`/learn/*`** — new, gated. Teachers author, students review.

The edge gate in `apps/web/proxy.ts` extends to `/learn/:path*` with the same
behaviour it already applies to `/backflip/*`: no token → redirect to login with
the original path in `from` (`L2-AUTH-01`, `L2-AUTH-12`). Pages are server
components reading data server-side; mutations are server actions (`L1-ARCH-03`).

### Two role axes

`user.role` continues to mean *platform operator* and gates `/backflip/*` only.
School membership carries `teacher | student` and gates `/learn/*`. Neither implies
the other; one person may hold both. Folding teachers into `user_role` was rejected
because the two axes answer different questions and would entangle the console's
capability matrix (`L2-AUTH-21`) with product permissions.

### Invites

`L2-AUTH-10` refuses Google sign-in unless a `user` row with that email already
exists, and `L2-AUTH-41` requires `email_verified`. So an invite is: create the
`user` row plus its `school_member` row, and email a link to the login page. No
invite token, no accept page, no new auth machinery. If expiring invites are wanted
later, `user_token` (`L2-DB-20`) takes a new type and the flow upgrades cleanly.

## Data model

Eight tables added to `packages/db/src/schema.ts` — one schema source, per `L2-DB-09`.

### Tenancy seam

- **`school`** — `id, name, slug, createdAt`. Exactly one row, seeded by migration.
- **`school_member`** — `id, schoolId, userId, role (school_role enum: teacher | student), createdAt`.
  Unique `(schoolId, userId)`. Indexed on `userId`.

A membership table rather than columns on `user`. This is the multi-school seam:
when a second school arrives, it is new rows, not a migration plus an audit of every
query written in the meantime.

### Content

- **`course`** — `id, schoolId, ownerId, title, description, status (draft | published), createdAt`.
  A `draft` course is visible only to its owner: enrolled students do not see it on
  their dashboard and its study routes redirect. Publishing is what makes an
  enrolment take effect, so a teacher can build a course with students already
  attached.
- **`deck`** — `id, courseId, title, position, createdAt`
- **`card`** — `id, deckId, front, back, position, createdAt, updatedAt`.
  `front` and `back` are markdown; images are markdown image references pointing at
  uploads under `shared/`.
- **`enrollment`** — `id, courseId, userId, createdAt`. Unique `(courseId, userId)`.

### Scheduling state

- **`card_state`** — one row per `(userId, cardId)`: `stability, difficulty, due,
  state, reps, lapses, lastReviewAt, scheduledDays`. Unique `(userId, cardId)`.
  **Index on `(userId, due)`** — this index is the entire "what do I study now" query.
- **`review_log`** — append-only, one row per answer: `userId, cardId, rating (1–4),
  stability, difficulty, elapsedDays, scheduledDays, reviewedAt`. Indexed
  `(userId, reviewedAt)`.

`card_state` being per student per card is what lets one authored deck serve thirty
students on thirty schedules — it is the reason this is a platform rather than a
shared deck. `review_log` earns its unbounded growth by being what any future FSRS
parameter optimisation trains on.

## The scheduler

`_lib/srs/` is the only module that knows FSRS exists. Its public surface is two
functions:

- **`schedule(state, rating, now)` → next `card_state`.** Pure: no database, no
  clock of its own. `now` is a parameter, which makes every scheduling rule testable
  without mocking time.
- **`dueQueue(userId, courseId, limit)` → cards to study, ordered.**

Everything above this boundary deals in cards and ratings and never touches
stability or difficulty, so the algorithm can be replaced or tuned without the
product code noticing.

### The review transaction

One server action, `answerCard(cardId, rating)`: read current state → `schedule()` →
write the `card_state` update and the `review_log` insert in a single transaction.
Always scoped to `session.user.id`, never a client-supplied user id — the rule
`L2-AUTH-27` already applies to account actions, and here it is what stops a student
writing another student's progress.

### The queue

Due cards:

```
WHERE userId = ? AND courseId = ? AND due <= now()
ORDER BY due ASC LIMIT ?
```

straight down the `(userId, due)` index. New cards — those with no `card_state` row
— come from a separate query with a daily cap, and the two lists interleave in
memory. Two index-only queries rather than one `LEFT JOIN`, deliberately. The daily
new-card cap is the knob that stops a student being handed 400 cards on day one and
never returning.

### Ratings

The four FSRS expects: Again, Hard, Good, Easy. The student self-rates after
revealing the answer. No auto-grading in v1, which keeps review to a single screen.

## Experiences

### Teacher — `/learn/courses/*`

Create a course; add decks; write cards in a markdown editor with live preview;
enrol students from the school; view per-course progress. Authoring is the bulk of
the UI work. Progress in v1 is one table — student, cards seen, cards due, last
studied — read straight from `card_state`. No charts and no retention curves: those
are a later spec and want real data behind them first.

### Student — `/learn`

A dashboard of enrolled courses with a due count each, and a study screen. The study
screen is the product and is built as though it were the only page: card front,
reveal, four rating buttons, next card. Keyboard-driven, works on a phone. It holds
the session queue client-side and posts each answer as it goes, so a dropped
connection loses one answer rather than a session.

## Module boundaries

- `_lib/srs/` — scheduling. Pure, no DB.
- `_lib/school/` — membership, and the current-school helper every query scopes through.
- `learn/_actions/` — server actions, one file per domain object.
- Route-scoped components colocated under each page (`L1-ARCH-07`, `L1-ARCH-08`).

The current-school helper matters more than its size suggests: it is the single
chokepoint that makes multi-school a data change rather than an audit of every query.

## Failure modes

**Authorization is the failure mode that matters.** Every `/learn/*` action
re-checks membership server-side: a teacher may only touch courses their school
owns; a student may only answer cards in a course they are enrolled in. Hidden UI is
cosmetic — this extends `L2-AUTH-22` to the new surface rather than inventing a
second model.

Ordinary failures, none needing new infrastructure:

- Card deleted mid-session → skip it; the queue is a snapshot.
- Double-submitted answer → the transaction makes it last-write-wins; one extra
  `review_log` row is harmless.
- Unenrolled student hitting a study URL directly → redirect, not an error page.

## Testing

Uses the existing tooling (`L2-TEST-01`, `L2-TEST-02`), following `L2-TEST-06`'s
"essential paths, not coverage" rule.

**Vitest carries the load**, because a pure scheduler is unit-testable outright and
needs no database:

- a correct answer lengthens the interval
- a lapse shortens it and increments `lapses`
- a new card enters the learning state
- the queue respects the daily new-card cap
- the queue returns nothing when nothing is due

**Playwright** covers two paths end to end — teacher authors a deck and enrols a
student; student studies a card and watches the queue shrink — plus the
authorization redirects for `/learn/*`.

The e2e suite runs credentials-only, with no `AUTH_GOOGLE_*` configured
(`L2-TEST-02`), so its fixtures sign in with passwords. The Google half of the
invite flow stays a unit test against the `signIn` callback, where `L2-AUTH-10` and
`L2-AUTH-41` are already covered.

## Documentation impact

New L2 contracts: `school`, `courses`, `srs`.

Updated L2 contracts: `db` (eight tables, the `school_role` enum, migrations),
`auth` (the `/learn` gate, membership checks, the invite flow), `testing`,
`ui` (the `/learn` shell).

**L1 requires a human rewrite.** `docs/constitution.md` is human-only and will not
be edited by the AI. It currently forbids what this spec builds:

- `L1-CON-03` — "features stay generic/extensible, not project-specific"
- `L1-ARCH-01` — exactly two surfaces
- Purpose and domain model describe a foundation platform, not a learning product

A proposed replacement block — new purpose, a domain model covering school, course,
deck, card, review, teacher and student, and a third surface in `L1-ARCH-01` — will
be drafted alongside the implementation plan for review and manual paste. Invariants
that survive unchanged and are worth keeping: `L1-CON-01`, `L1-CON-02`, `L1-CON-05`
(auth methods), `L1-ARCH-03` (RSC + server actions), `L1-ARCH-05` through
`L1-ARCH-08` (monorepo and colocation), and the entire stack section, plus
`ts-fsrs` added to it.

## Implementation order

1. Schema, migration, seeded school. Membership helpers.
2. Invite flow — create user + membership, send email.
3. Teacher authoring — courses, decks, cards.
4. Enrolment.
5. `_lib/srs/` with its unit suite, ahead of any UI that uses it.
6. Student dashboard and study screen.
7. Teacher progress table.
8. Playwright paths.

Steps 1–2 unblock everything. Step 5 is written and tested before step 6 so the
study screen is built against a scheduler already known to be correct.
