import { describe, expect, it } from "vitest"

import {
  newCardState,
  schedule,
  type Grade,
  type MemoryState,
} from "@/app/_lib/srs/schedule"

const NOW = new Date("2026-01-01T12:00:00.000Z")

/** Drive a card through a sequence of grades, returning the final state. */
function play(grades: Grade[], start: MemoryState = newCardState(NOW)) {
  let state = start
  let at = NOW
  for (const grade of grades) {
    state = schedule(state, grade, at).next
    // Answer each subsequent review exactly when it falls due.
    at = state.due
  }
  return state
}

describe("newCardState", () => {
  it("is due immediately and unreviewed", () => {
    const state = newCardState(NOW)
    expect(state.due.getTime()).toBe(NOW.getTime())
    expect(state.reps).toBe(0)
    expect(state.lapses).toBe(0)
    expect(state.state).toBe(0) // ts-fsrs State.New
    expect(state.lastReviewAt).toBeNull()
  })
})

describe("schedule", () => {
  it("moves a new card out of the New state and counts the rep", () => {
    const { next } = schedule(newCardState(NOW), 3, NOW)
    expect(next.state).not.toBe(0)
    expect(next.reps).toBe(1)
    expect(next.lastReviewAt?.getTime()).toBe(NOW.getTime())
  })

  it("schedules every grade into the future", () => {
    for (const grade of [1, 2, 3, 4] as Grade[]) {
      const { next } = schedule(newCardState(NOW), grade, NOW)
      expect(next.due.getTime()).toBeGreaterThan(NOW.getTime())
    }
  })

  it("gives Easy a later due date than Again", () => {
    const again = schedule(newCardState(NOW), 1, NOW).next
    const easy = schedule(newCardState(NOW), 4, NOW).next
    expect(easy.due.getTime()).toBeGreaterThan(again.due.getTime())
  })

  it("counts a lapse when a learned card is failed", () => {
    // Four Goods is enough to reach the Review state (2).
    const learned = play([3, 3, 3, 3])
    expect(learned.state).toBe(2)
    expect(learned.lapses).toBe(0)

    const lapsed = schedule(learned, 1, learned.due).next
    expect(lapsed.lapses).toBe(1)
  })

  it("shortens the interval after a lapse", () => {
    const learned = play([3, 3, 3, 3])
    const kept = schedule(learned, 3, learned.due).next
    const lapsed = schedule(learned, 1, learned.due).next
    expect(lapsed.scheduledDays).toBeLessThan(kept.scheduledDays)
  })

  it("lengthens the interval as a card keeps being recalled", () => {
    const early = play([3, 3, 3, 3])
    const later = play([3, 3, 3, 3, 3, 3])
    expect(later.scheduledDays).toBeGreaterThan(early.scheduledDays)
  })

  it("logs the state as it was before the answer", () => {
    const learned = play([3, 3, 3, 3])
    const { logged } = schedule(learned, 1, learned.due)
    expect(logged.rating).toBe(1)
    expect(logged.state).toBe(learned.state)
    expect(logged.stability).toBe(learned.stability)
    expect(logged.difficulty).toBe(learned.difficulty)
  })

  it("is pure — the same inputs give the same output, and the input is untouched", () => {
    const state = newCardState(NOW)
    const a = schedule(state, 3, NOW).next
    const b = schedule(state, 3, NOW).next
    expect(a.due.getTime()).toBe(b.due.getTime())
    expect(a.stability).toBe(b.stability)
    expect(state.reps).toBe(0)
  })
})
