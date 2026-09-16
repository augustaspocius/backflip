import { describe, expect, it } from "vitest"

import { UPLOAD_DIR, safeUploadName, uploadPath } from "@/app/learn/_lib/uploads"

describe("safeUploadName", () => {
  it("keeps a permitted extension and discards the original name", () => {
    const name = safeUploadName("Holiday Photo.PNG")
    expect(name).not.toBeNull()
    expect(name!.endsWith(".png")).toBe(true)
    expect(name!.toLowerCase()).not.toContain("holiday")
  })

  it("accepts the image types we render", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "webp"]) {
      expect(safeUploadName(`a.${ext}`)).not.toBeNull()
    }
  })

  it("refuses anything else", () => {
    expect(safeUploadName("payload.svg")).toBeNull()
    expect(safeUploadName("payload.html")).toBeNull()
    expect(safeUploadName("payload.js")).toBeNull()
    expect(safeUploadName("noextension")).toBeNull()
  })

  it("cannot be talked into a path", () => {
    const name = safeUploadName("../../etc/passwd.png")
    expect(name).not.toBeNull()
    expect(name!).not.toContain("/")
    expect(name!).not.toContain("..")
  })

  it("gives every upload a distinct name", () => {
    expect(safeUploadName("a.png")).not.toBe(safeUploadName("a.png"))
  })
})

// Proves the traversal defence directly (no dev server in this environment
// to exercise `curl .../..%2F..%2Fpackage.json` against): the serving route
// only ever rejects on `uploadPath` throwing, so a decoded route param that
// still carries "..", "/" or "\" must throw here for the route's 404 to be
// real rather than accidental.
describe("uploadPath", () => {
  it("rejects a decoded traversal attempt", () => {
    expect(() => uploadPath("../../etc/passwd.png")).toThrow()
    expect(() => uploadPath("../../../package.json")).toThrow()
  })

  it("rejects a name carrying a path separator, forward or backward", () => {
    expect(() => uploadPath("a/b.png")).toThrow()
    expect(() => uploadPath("a\\b.png")).toThrow()
  })

  it("rejects the still-encoded curl-style traversal string", () => {
    // Next.js decodes route params, but the literal ".." substring survives
    // either way, so this is caught regardless of decoding behavior.
    expect(() => uploadPath("..%2F..%2Fpackage.json")).toThrow()
  })

  it("resolves a bare stored name under UPLOAD_DIR", () => {
    const path = uploadPath("abc123.png")
    expect(path.startsWith(UPLOAD_DIR)).toBe(true)
    expect(path.endsWith("abc123.png")).toBe(true)
  })
})
