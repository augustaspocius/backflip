import { describe, expect, it } from "vitest"

import {
  UPLOAD_DIR,
  matchesFileSignature,
  safeUploadName,
  uploadPath,
} from "@/app/learn/_lib/uploads"

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

// Proves the traversal defence at the unit level: the serving route only
// ever rejects a bad name by `uploadPath` throwing, so a name carrying "..",
// "/" or "\" must throw here. This is necessary but not sufficient proof —
// it doesn't exercise what the route actually receives from a URL, since
// Next.js decodes route params before `uploadPath` ever sees them. The
// route-level test in `apps/web/app/api/learn/uploads/[name]/route.test.ts`
// covers that: a real `GET` call with a crafted (still-encoded) `params`
// promise, asserting 404 rather than bytes — the actual property the brief's
// `curl .../..%2F..%2Fpackage.json` check was after.
describe("uploadPath", () => {
  it("rejects a decoded traversal attempt", () => {
    expect(() => uploadPath("../../etc/passwd.png")).toThrow()
    expect(() => uploadPath("../../../package.json")).toThrow()
  })

  it("rejects a name carrying a path separator, forward or backward", () => {
    expect(() => uploadPath("a/b.png")).toThrow()
    expect(() => uploadPath("a\\b.png")).toThrow()
  })

  it("rejects a string that is still URL-encoded, since the literal '..' survives either way", () => {
    // Defense in depth only: in production Next.js decodes the route param
    // before this function ever sees it (proven by the route-level test),
    // so this exercises a defensive property of `uploadPath` itself, not the
    // route's actual decoding behavior.
    expect(() => uploadPath("..%2F..%2Fpackage.json")).toThrow()
  })

  it("resolves a bare stored name under UPLOAD_DIR", () => {
    const path = uploadPath("abc123.png")
    expect(path.startsWith(UPLOAD_DIR)).toBe(true)
    expect(path.endsWith("abc123.png")).toBe(true)
  })
})

describe("matchesFileSignature", () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  const WEBP = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ])
  const SVG = new TextEncoder().encode("<svg onload=alert(1)></svg>")
  const HTML = new TextEncoder().encode("<script>alert(1)</script>")

  it("accepts real bytes for the type they claim", () => {
    expect(matchesFileSignature(PNG, "png")).toBe(true)
    expect(matchesFileSignature(JPEG, "jpg")).toBe(true)
    expect(matchesFileSignature(GIF, "gif")).toBe(true)
    expect(matchesFileSignature(WEBP, "webp")).toBe(true)
  })

  it("refuses SVG or HTML bytes wearing a .png name — the case that matters", () => {
    expect(matchesFileSignature(SVG, "png")).toBe(false)
    expect(matchesFileSignature(HTML, "png")).toBe(false)
  })

  it("refuses bytes that don't match the claimed type even when both are permitted extensions", () => {
    expect(matchesFileSignature(JPEG, "png")).toBe(false)
    expect(matchesFileSignature(PNG, "gif")).toBe(false)
  })

  it("refuses a name too short to carry any signature", () => {
    expect(matchesFileSignature(Uint8Array.from([0x89]), "png")).toBe(false)
  })

  it("refuses an extension it doesn't recognize", () => {
    expect(matchesFileSignature(PNG, "svg")).toBe(false)
  })
})
