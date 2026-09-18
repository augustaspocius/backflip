# Notes (L3) — db

> L3 = how / volatile. AI writes free. Cites L2 IDs up. Matches code as-is.

## File map
- `packages/db/package.json` — `@workspace/db`. Deps: drizzle-orm, pg, bcryptjs. Dev: drizzle-kit, tsx, dotenv, @types/pg. Scripts satisfy `L2-DB-03`.
- `packages/db/src/schema.ts` — Drizzle schema. `user_role` enum (`owner|admin|teammate`) + `user` (incl. `tokenVersion`)/`account`/`session`/`verificationToken`; `ai_provider` enum + `ai_config`; `email_config`; `user_token_type` enum (`password_reset|email_change`) + `user_token`. Satisfies `L2-DB-05`, `L2-DB-06`, `L2-DB-07`, `L2-DB-17`, `L2-DB-18`, `L2-DB-20`, `L2-DB-22`.
- `packages/db/src/client.ts` — `db = drizzle(process.env.DATABASE_URL!, { schema })` (node-postgres). Satisfies `L2-DB-01`.
- `packages/db/src/index.ts` — barrel: `export * from schema` + `db`. Satisfies `L2-DB-02`, `L2-DB-09`.
- `packages/db/src/load-env.ts` — loads root `.env` + `.env.local` (root = 3 up from src). Imported by drizzle.config. NOTE: the owner seed loads its own env inline (`.env` + `.env.init`), not `.env.local`.
- `packages/db/src/seed/owner.ts` — `init-owner`. Self-contained: loads `.env` + `.env.init` via `dotenv` at the top (root = 4 up from src/seed), deliberately out of `.env.local` so `ADMIN_*` never reaches the running app. `db`/`users` are dynamically `import()`ed inside `main()` so `config()` runs before the db client reads `DATABASE_URL` at eval time. Reads `ADMIN_EMAIL` (required) + `ADMIN_PASSWORD` (optional). With a password → bcrypt(12) hash; without → `passwordHash` null (Google-only owner). Upsert on email, role `owner`; on re-run without a password, the existing hash is preserved (not overwritten). Satisfies `L2-DB-04`.
- `packages/db/drizzle.config.ts` — dialect postgresql, schema `src/schema.ts`, out `migrations/`. Imports `load-env`.
- `packages/db/src/crypto.ts` — `encryptSecret`/`decryptSecret` (AES-256-GCM, key = sha256(`ENCRYPTION_KEY`)) + `generateToken()` (32-byte base64url) / `hashToken(raw)` (sha256 hex) for one-time link tokens. Satisfies `L2-DB-16`, `L2-DB-19`.
- `packages/db/src/index.ts` — also re-exports `generateToken`/`hashToken` alongside encrypt/decrypt.
- `packages/db/src/schema.ts` (cont.) — connector/OAuth tables: `oauth_client` (incl. `origin`, `createdByUserId`, `allowLoopbackPorts`), `oauth_auth_code`, `oauth_token`, plus `connector_dcr_mode` enum + `connector_config` (`@spec L2-DB-28, L2-MCP-48`). Satisfies `L2-DB-25`, `L2-DB-26`, `L2-DB-27`, `L2-DB-28`.
- `packages/db/src/schema.ts` (cont.) — integration tables: `clickup_config` (`@spec L2-DB-29, L2-CLICKUP-01`), `slack_app` (`@spec L2-DB-30, L2-SLACK-01`), `slack_webhook` (`@spec L2-DB-31, L2-SLACK-02`), `n8n_config` (`@spec L2-DB-32, L2-N8N-01`). Slack is the only multi-row pair — every other integration config is a single `kind`/`provider`-keyed row. Satisfies `L2-DB-29`, `L2-DB-30`, `L2-DB-31`, `L2-DB-32`.
- `packages/db/src/schema.ts` (cont.) — `user_preference` (`@spec L2-DB-33, L2-UI-25`): per-user UI prefs, `userId` doubling as pk and fk so a user can never hold two rows. Satisfies `L2-DB-33`.
- `packages/db/src/schema.ts` (cont.) — `chrome_preset` (`@spec L2-DB-37, L2-UI-55`). Satisfies `L2-DB-37`.
- `packages/db/src/schema.ts` (cont.) — `school_role` enum (`teacher|student`) + `school` (`@spec L2-SCHOOL-01`) + `school_member` (`@spec L2-SCHOOL-02`). Satisfies `L2-DB-38`, `L2-DB-39`.
- `packages/db/src/schema.ts` (cont.) — `course_status` enum (`draft|published`) + `course` (`@spec L2-COURSE-01`) + `deck` (`@spec L2-COURSE-02`) + `card` (`@spec L2-COURSE-03`) + `enrollment` (`@spec L2-COURSE-04`). Satisfies `L2-DB-40`, `L2-DB-41`, `L2-DB-42`, `L2-DB-43`.
- `packages/db/src/schema.ts` (cont.) — `card_state` (`@spec L2-SRS-01`) + `review_log` (`@spec L2-SRS-02`); the `@spec` tags forward-reference `docs/contracts/srs.md`, which does not exist yet (a later task in this plan). Satisfies `L2-DB-45`, `L2-DB-46`.
- `packages/db/migrations/` — `0000` baseline, `0001` email_config, `0002` role rename `member`→`teammate`, `0003` `user_token` table, `0004` `user.tokenVersion` column, `0005`+`0006` analytics_config, `0007` speech_config, `0008` reworded cookie-banner copy, `0009` oauth client/code/token tables + `oauth_token_type` enum, `0010` `connector_config` + `oauth_client` manual-client columns, `0011` `connector_config.enabled`, `0012` `clickup_config` + `slack_app` + `slack_webhook` + `n8n_config`, `0013` `user_preference`, `0014` `user_preference.chromeHeaderThemed`, `0015` `user_preference` custom-colour columns, `0016` `user_preference.chromeHeaderGlass` (the pinned frosted header, `L2-UI-45`), `0017` `telemetry_install` + `telemetry_start`, `0018` `chrome_preset`, `0019` `school_role` enum + `school` + `school_member` (seeds the default school), `0020` `course_status` enum + `course` + `deck` + `card` + `enrollment`, `0021` `card_state` + `review_log`, + `meta/`. Satisfies `L2-DB-08`.

## Role rename (migration 0002)
- `user_role` value `member` → `teammate`. drizzle-kit generated a drop/recreate (`SET DATA TYPE text` → `DROP TYPE` → recreate → recast); hand-replaced with `ALTER TYPE ... RENAME VALUE 'member' TO 'teammate'` + `ALTER COLUMN role SET DEFAULT 'teammate'`. Rename preserves rows + the default binding and reaches the same end state as the `0002` snapshot (drop/recreate would reject any existing `member` row on the recast). Not yet applied here (no DB in the web session); apply with `db:migrate` when a DB is up.

## Gotcha — type-change migrations
- `drizzle-kit generate` emits column type changes as bare `SET DATA TYPE` with no `USING` cast. For incompatible casts (e.g. text→integer) Postgres rejects the SQL, and `drizzle-kit migrate` fails *quietly* (prints "applying…", no success line, journal not advanced — looks like a no-op). Fix: hand-edit the generated SQL to add `USING <col>::<type>`, or `db:push` in dev. (This is what broke the old `0001`; the baseline was squashed to avoid it.)

## Notes / deviations
- tsconfig overrides base to `module ESNext` + `moduleResolution Bundler` (pkg is consumed by Next bundler + run by tsx; avoids NodeNext `.js` extension churn).
- Column names kept Auth.js-exact (camelCase, quoted in pg): `passwordHash`, `emailVerified`, `providerAccountId`, etc. Query with double-quotes in raw SQL.
- `account.expires_at` typed `integer` (required by `@auth/drizzle-adapter` types).
- `session`/`verificationToken` tables unused under JWT strategy; kept for adapter completeness.
- Env: `DATABASE_URL` (localhost:5544) in `.env`; one-off admin seed creds in `.env.init` (loaded inline by the seed script, never the app). `.env.init.example` is the committed template. All `.env*` gitignored except the `*.example` files.

## user_token table (migration 0003)
- Purpose-scoped one-time tokens for self-service flows: `password_reset`, `email_change` (holds pending `newEmail`). Store only `tokenHash` (sha256 of the raw token); raw lives only in the emailed link. `expiresAt` + `consumedAt` enforce single-use, time-boxed validity. Cascade-deletes with the user. Consumed by `apps/web/app/_lib/auth/tokens.ts`.
- **Not yet applied here** (no DB in the web session) — apply `0003_unique_bill_hollister.sql` + `0004_low_hulk.sql` with `db:migrate` when a DB is up (also `0002` per above).

## State
- Owner seeded: `gigedas@gmail.com`, role `owner`. Migrations applied to docker db (through `0001`; `0002`/`0003` pending in this session — no DB).
- No app code consumes `@workspace/db` yet — auth wiring is the next phase.

## TODO
- Auth.js DrizzleAdapter + Credentials/Google (auth domain) consumes these tables next.

## Telemetry tables (0017)
- `telemetry_install` + `telemetry_start`, drizzle-kit generated, no seed. Owned by the `telemetry` domain (`L2-TELEMETRY-01`, `L2-TELEMETRY-02`); `L2-DB-34`/`L2-DB-35` are the db-side counterparts.
- Both key on `installIdHash`, never a raw install id, and `telemetry_start.ipHash` is an HMAC of the source IP (`L2-DB-36`). The salt is `TELEMETRY_HASH_SALT`, deliberately not `ENCRYPTION_KEY`: these values are only ever compared, never decrypted, so they want a keyed digest rather than reversible encryption.
- No fk between the two tables. `telemetry_start` rows are written by an unauthenticated endpoint and the join is on the hash; a fk would turn a race between two concurrent first-reports into a write error for something that is allowed to be lossy.

## Chrome presets table (0018)
- `chrome_preset`, drizzle-kit generated, no seed. Owned by the `ui` domain (`L2-UI-55`); `L2-DB-37` is the db-side counterpart.
- Its own table rather than more columns on `user_preference`: this is a *list*, and that row is deliberately one-per-user (pk-as-fk, `L2-DB-33`).
- Unique `(userId, name)` is load-bearing, not hygiene — it is the `onConflictDoUpdate` target that makes "save under a name you already used" mean "update that preset".
- `on delete cascade` from `user`: deleting an account takes its presets with it, same as its preferences row.

## School and school_member tables (0019)
- `school_role` enum (`teacher|student`) + `school` + `school_member`, drizzle-kit generated, then hand-appended a seed `INSERT ... ON CONFLICT ("slug") DO NOTHING` (matches the `0006` `analytics_config` seed pattern). Owned by the `school` domain (`L2-SCHOOL-01`, `L2-SCHOOL-02`); `L2-DB-38`/`L2-DB-39` are the db-side counterparts.
- `school` seeded with exactly one row: `Default School` / `default`. This is the seam for multiple schools later — a second school is new rows, not a migration.
- `school_member.role` is deliberately separate from `user.role` (`L2-DB-05`): the former gates the future `/learn/*` surface (course/study access), the latter gates the operator console. One person may hold both roles independently.
- Unique `(schoolId, userId)` on `school_member` — a role change is an `UPDATE`, not a second membership row. Index on `userId` for the "which schools is this person in" session-path lookup.
- Both fks (`schoolId` → `school`, `userId` → `user`) cascade on delete — deleting a school or a user takes its memberships with it.
- App code consumes both tables now: `apps/web/app/_lib/school/index.ts` (`getCurrentSchoolId`, `getMembership`, `requireMembership`, `requireTeacher`), the `/learn/*` shell, and `/backflip/school`'s invite flow (`_actions.ts`, `page.tsx`). See `docs/contracts/school.md` and `docs/notes/school.md`.

## Course, deck, card, and enrollment tables (0020)
- `course_status` enum (`draft|published`) + `course` + `deck` + `card` + `enrollment`, drizzle-kit generated, no hand edits and no seed. Owned by the (forthcoming) `course` domain (`L2-COURSE-01` … `L2-COURSE-04`); `L2-DB-40`..`L2-DB-43` are the db-side counterparts.
- `course.schoolId` is deliberately denormalized rather than reached through `ownerId`'s `school_member` row: every authoring/listing query in this and later tasks filters courses by school, and this keeps that a single indexed read instead of a join through membership. Index on `schoolId`.
- `course.ownerId` cascades `set null`, not `cascade`: deleting the authoring teacher's account must not take their course (and its decks/cards/enrolments) down with it — the course survives, ownerless.
- `deck.position` and `card.position` are explicit integers (default 0), not derived from `createdAt`: a teacher reordering decks or cards is a position update, never a timestamp rewrite.
- `card` has no type/kind column in v1 — every card is a plain front/back pair, markdown text with images as markdown image references, self-rated by the student rather than auto-graded (`L2-SRS-05`, owned by the future SRS domain).
- `enrollment` unique `(courseId, userId)` — enrolling the same student twice is a mistake, not a second enrolment; index on `userId` for the student's "my courses" query. Enrolment is teacher-created in v1; there is no student self-enrol path.
- Cascade chain: deleting a `school` takes its `course`s; deleting a `course` takes its `deck`s and `enrollment`s; deleting a `deck` takes its `card`s. Deleting a `user` cascades their `enrollment`s but only nulls their `course.ownerId`.
- `docs/contracts/courses.md` does not exist yet (arrives in a later task in this plan) — the `@spec L2-COURSE-01`..`L2-COURSE-04` tags on the schema forward-reference it and resolve once that contract is written.
- Cross-table coherence (`course.schoolId` vs. the owner's membership; `enrollment` vs. its course's school) is unenforced by the database — see `L2-DB-44`. Both are deliberate, code-side invariants, not gaps to close with a trigger or check constraint.
- Watch-items, not omissions — each index below is currently correct because nothing reads on that column yet; adding one now would be write cost with no reader:
  - No index on `course.ownerId`. Harmless today because the only authoring listing query filters on `schoolId`, not owner. Revisit if a "courses I authored" view is added.
  - No index touching `course.status`. Harmless today because the student dashboard reaches courses through `enrollment` and joins on the primary key, never scans by status. Revisit if a "browse all published courses in the school" view is added.

## card_state and review_log tables (0021)
- `card_state` + `review_log`, drizzle-kit generated, no hand edits and no seed. Owned by the (forthcoming) `srs` domain — the schema's `@spec L2-SRS-01`/`L2-SRS-02` tags forward-reference `docs/contracts/srs.md`, written in a later task in this plan; `L2-DB-45`/`L2-DB-46` are the db-side counterparts, in the meantime.
- Columns mirror the `ts-fsrs` `Card` (→ `card_state`) and review-event shapes exactly. `learningSteps` on `card_state` is included on purpose — the FSRS scheduler (a later task) needs it back verbatim on every read/write cycle; dropping it would silently corrupt the schedule the next time the row is fed into the library.
- `state` (`card_state`, `review_log`) and `rating` (`review_log`) are plain `integer` columns, not pg enums, deliberately: they hold `ts-fsrs`'s own enum values (`State`: New 0, Learning 1, Review 2, Relearning 3; `Rating`: Again 1, Hard 2, Good 3, Easy 4), and a future `ts-fsrs` version adding a value must not force a schema migration the way a pg enum extension would.
- `card_state` unique `(userId, cardId)` — a review is an `UPDATE` of the existing row, never a second insert. Index `(userId, due)` is the one index the whole study screen depends on: the due-queue query is `WHERE userId = ? AND due <= now() ORDER BY due`, and without this composite index that becomes a sequential scan as `card_state` grows with every student × every card.
- `review_log` is append-only and unbounded by design — it exists to be training data for a later per-student FSRS parameter optimisation, so it is kept to numbers and timestamps and never updated in place. Index `(userId, reviewedAt)` for a student's own review history.
- Both fks (`userId` → `user`, `cardId` → `card`) cascade on delete on both tables: deleting a user or a card takes their scheduling state and review history with them.
- Deliberate exception to that cascade discipline: `unenrolStudent` (`L2-COURSE-08`) removes only the `enrollment` row and leaves `card_state` behind — a `card_state` row is keyed on `(userId, cardId)`, not on an enrolment, so it outlives one on purpose. This is what makes re-enrolling resume a schedule instead of restarting it. The corollary: `card_state` has no `courseId`/enrolment column of its own to filter on, so any query that must respect course membership (a due-queue scoped to one course, a teacher's per-course review dashboard) has to reach `card_state` **through** `enrollment` — join on `userId`, and get the course from the card's `deckId → deck.courseId`, never trust a bare `card_state` row to imply an active enrolment.
