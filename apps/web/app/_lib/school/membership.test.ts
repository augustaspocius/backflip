import { describe, expect, it } from "vitest"

import { isTeacher } from "@/app/_lib/school/roles"

describe("isTeacher", () => {
  it("is true only for the teacher role", () => {
    expect(isTeacher("teacher")).toBe(true)
    expect(isTeacher("student")).toBe(false)
  })

  it("is false for absent membership", () => {
    expect(isTeacher(null)).toBe(false)
    expect(isTeacher(undefined)).toBe(false)
  })
})
