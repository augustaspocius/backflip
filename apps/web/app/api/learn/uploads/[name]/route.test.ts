import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Route-level proof that `GET` actually 404s a bad name rather than serving
 * bytes — the property the brief's `curl -i '.../..%2F..%2Fpackage.json'`
 * check was after. `uploads.test.ts` proves `uploadPath` throws on a
 * traversal string, but that alone doesn't prove the route wires the throw
 * up correctly, and its "..%2F..%2F" case never reaches this route the way
 * it's written in production anyway (Next.js decodes route params first).
 * This file calls `GET` directly with a crafted `params` promise, the same
 * shape Next hands the handler, so it exercises the real decoding boundary.
 *
 * `auth` is mocked directly (not the whole `@/app/_lib/auth` config chain)
 * so this test needs no database/NextAuth setup — same pattern as
 * `apps/web/app/rnl-admin/(protected)/connect/_actions.test.ts`.
 */

const h = vi.hoisted(() => ({ signedIn: true }))

vi.mock("@/app/_lib/auth", () => ({
  auth: async () => (h.signedIn ? { user: { id: "user-1" } } : null),
}))

import { GET } from "./route"

function params(name: string) {
  return { params: Promise.resolve({ name }) }
}

beforeEach(() => {
  h.signedIn = true
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/learn/uploads/[name]", () => {
  it("401s when there is no session, before looking at the name at all", async () => {
    h.signedIn = false
    const res = await GET(new Request("http://x"), params("../../package.json"))
    expect(res.status).toBe(401)
  })

  it("404s a traversal name rather than serving a file", async () => {
    const res = await GET(new Request("http://x"), params("../../package.json"))
    expect(res.status).toBe(404)
  })

  it("404s a name carrying a path separator", async () => {
    const res = await GET(new Request("http://x"), params("a/b.png"))
    expect(res.status).toBe(404)
  })

  it("404s an unrecognized extension before ever touching the filesystem", async () => {
    const res = await GET(new Request("http://x"), params("a.txt"))
    expect(res.status).toBe(404)
  })

  it("404s a name carrying a null byte rather than throwing", async () => {
    // Passes `uploadPath`'s own checks (no "/", "\" or ".."), so this proves
    // the outer try/catch around `readFile` — not `uploadPath` — is what
    // stops it: Node refuses a path containing a null byte.
    const res = await GET(new Request("http://x"), params("a\0.png"))
    expect(res.status).toBe(404)
  })

  it("404s a well-formed name that simply doesn't exist on disk", async () => {
    const res = await GET(
      new Request("http://x"),
      params("00000000-0000-0000-0000-000000000000.png")
    )
    expect(res.status).toBe(404)
  })
})
