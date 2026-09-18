import { describe, expect, it } from "vitest"

import { interleave, startOfUtcDay, type QueueCard } from "@/app/_lib/srs/queue"

const card = (id: string, isNew: boolean): QueueCard => ({
  cardId: id,
  front: id,
  back: id,
  isNew,
})

describe("interleave", () => {
  it("leads with a due card when both lists have entries", () => {
    const out = interleave([card("d1", false)], [card("n1", true)])
    expect(out[0]!.cardId).toBe("d1")
  })

  it("keeps every card exactly once", () => {
    const out = interleave(
      [card("d1", false), card("d2", false)],
      [card("n1", true), card("n2", true)]
    )
    expect(out.map((c) => c.cardId).sort()).toEqual(["d1", "d2", "n1", "n2"])
  })

  it("alternates rather than emptying one list first", () => {
    const out = interleave(
      [card("d1", false), card("d2", false)],
      [card("n1", true), card("n2", true)]
    )
    expect(out.map((c) => c.isNew)).toEqual([false, true, false, true])
  })

  it("appends the remainder when the lists differ in length", () => {
    const out = interleave(
      [card("d1", false)],
      [card("n1", true), card("n2", true), card("n3", true)]
    )
    expect(out.map((c) => c.cardId)).toEqual(["d1", "n1", "n2", "n3"])
  })

  it("handles either list being empty", () => {
    expect(interleave([], [card("n1", true)]).map((c) => c.cardId)).toEqual([
      "n1",
    ])
    expect(interleave([card("d1", false)], []).map((c) => c.cardId)).toEqual([
      "d1",
    ])
    expect(interleave([], [])).toEqual([])
  })
})

describe("startOfUtcDay", () => {
  it("floors a time just before UTC midnight to that same day", () => {
    const now = new Date("2026-03-10T23:59:59.999Z")
    expect(startOfUtcDay(now).toISOString()).toBe("2026-03-10T00:00:00.000Z")
  })

  it("floors a time just after UTC midnight to the new day", () => {
    const now = new Date("2026-03-11T00:00:00.001Z")
    expect(startOfUtcDay(now).toISOString()).toBe("2026-03-11T00:00:00.000Z")
  })
})
