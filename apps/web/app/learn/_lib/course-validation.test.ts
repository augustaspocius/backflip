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
