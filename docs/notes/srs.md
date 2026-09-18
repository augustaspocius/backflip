# Notes (L3) — srs

> L3 = how / volatile. AI writes free. Cites L2 IDs up. Matches code as-is.

## File map
- `apps/web/app/_lib/srs/schedule.ts` — the scheduler. `Grade`, `MemoryState`, `ReviewOutcome`, `newCardState(now)`, `schedule(current, grade, now)`, `GRADES`. Wraps `ts-fsrs`'s `fsrs()`/`createEmptyCard()`/`scheduler.next()` behind a snake_case-free, app-shaped API — `toFsrsCard`/`fromFsrsCard` are the only two functions in the app that know the `Card` type's field names. One module-level `fsrs()` instance (`scheduler`), default parameters, no fuzz; stateless, so sharing it across calls is safe. Satisfies `L2-SRS-03`.
- `apps/web/app/_lib/srs/schedule.test.ts` — the unit suite (9 tests, see below). Satisfies `L2-SRS-03`.
- `packages/db/src/schema.ts` — `cardStates` / `reviewLogs`, from Task 1. See `docs/notes/db.md` ("card_state and review_log tables (0021)"). Satisfies `L2-SRS-01`, `L2-SRS-02`.
- `apps/web/package.json` — `ts-fsrs` pinned at `5.4.2` (exact, no `^`). Satisfies `L2-SRS-09`.

## Why `elapsed_days` is derived, not stored
`ts-fsrs`'s `Card` type still carries `elapsed_days` even though the library deprecated it and the scheduling algorithm doesn't read it. `MemoryState` has no field for it — `toFsrsCard` computes it from `due` − `lastReviewAt` (whole days, floor at 0, 0 when the card has never been reviewed) each time a `Card` is built for the library. Storing it would be a column that can silently drift from the fields that actually drive scheduling; deriving it means `card_state` only ever holds numbers the algorithm depends on.

## Why the field mapping is manual, not generated
`toFsrsCard`/`fromFsrsCard` hand-list every field rather than spreading. This is deliberate: a spread would silently pass through if `ts-fsrs` added a field to `Card`, and the next read/write cycle would drop it on the floor the moment it round-trips through `MemoryState` (which wouldn't have a slot for it). The explicit list means a `ts-fsrs` upgrade that changes `Card`'s shape is a type error here, not a silent data loss — consistent with why the version is pinned (`L2-SRS-09`).

## Test suite: what "four Goods" is doing
`play([3, 3, 3, 3])` — four consecutive Good answers, each one answered exactly on its `due` date — reaches `ts-fsrs` `State.Review` (2) on the default parameters, verified by the "counts a lapse" test's own assertion (`learned.state` toBe `2`) before it does anything else with the resulting state. If a future `ts-fsrs` version's defaults change how many correct reviews it takes to leave learning, that assertion is what fails first and is the signal to raise the count in `play(...)` across every affected test together — the brief calls this out explicitly. It did not come up during this task: four Goods reaches state 2 on the first attempt, and the "lengthens the interval" test's six-Good run (`play([3, 3, 3, 3, 3, 3])`) also passed unchanged.

## How to run the suite
```
corepack yarn workspace web test srs
```
Runs just `schedule.test.ts` (vitest's positional filter matches the path). Full web unit suite: `corepack yarn workspace web test`. Typecheck: `corepack yarn workspace web typecheck`.

## State
- Scheduler done: `newCardState`, `schedule`, `GRADES`, all four `MemoryState`/`ReviewOutcome`/`Grade` types. 9/9 unit tests pass, no exact-value assertions needed loosening (see above). Typecheck clean, full web suite (375 tests) green.
- Not built yet, later tasks in this plan: the due-cards queue (`L2-SRS-04`), the `answerCard` write path (`L2-SRS-06`), and the student/teacher routes (`L2-SRS-07`, `L2-SRS-08`) that will be the only callers of `schedule`/`newCardState` outside this test file.
