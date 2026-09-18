import { describe, expect, it } from "vitest"

import { inviteMemberSchema } from "@/app/_lib/validation"

describe("inviteMemberSchema", () => {
  it("normalizes the email and keeps the role", () => {
    const parsed = inviteMemberSchema.safeParse({
      name: "  Ada  ",
      email: "  Ada@Example.COM ",
      role: "teacher",
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.email).toBe("ada@example.com")
    expect(parsed.data.name).toBe("Ada")
    expect(parsed.data.role).toBe("teacher")
  })

  it("rejects an unknown school role", () => {
    const parsed = inviteMemberSchema.safeParse({
      email: "ada@example.com",
      role: "owner",
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a malformed email", () => {
    const parsed = inviteMemberSchema.safeParse({
      email: "not-an-email",
      role: "student",
    })
    expect(parsed.success).toBe(false)
  })

  it("treats a blank name as absent", () => {
    const parsed = inviteMemberSchema.safeParse({
      name: "   ",
      email: "ada@example.com",
      role: "student",
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.name).toBeNull()
  })
})
