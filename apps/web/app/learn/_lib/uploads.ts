import { join } from "node:path"

/**
 * Card image storage. Files land in the persistent `shared/` dir the deploy
 * already provisions and never in the build output, so a release does not wipe
 * them.
 *
 * The stored name is generated, never the uploaded one: that closes path
 * traversal, collisions and unicode-lookalike tricks in one move, and it means
 * `uploadPath` can never be pointed outside `UPLOAD_DIR`.
 *
 * @spec L2-COURSE-10
 */

/** Extensions we will store and serve. SVG is excluded — it can carry script. */
const ALLOWED = new Map<string, string>([
  ["png", "png"],
  ["jpg", "jpg"],
  ["jpeg", "jpg"],
  ["gif", "gif"],
  ["webp", "webp"],
])

export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? join(process.cwd(), "shared", "uploads")

/**
 * A safe stored name for an upload, or null when the type is not permitted.
 * Pure apart from the random id, so it is testable directly.
 */
export function safeUploadName(originalName: string): string | null {
  const dot = originalName.lastIndexOf(".")
  if (dot < 0) return null
  const ext = ALLOWED.get(originalName.slice(dot + 1).toLowerCase())
  if (!ext) return null
  return `${crypto.randomUUID()}.${ext}`
}

/**
 * Absolute path for a stored name. Rejects anything that is not a bare
 * filename, so a crafted route param cannot escape the directory.
 */
export function uploadPath(name: string) {
  if (name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new Error("Invalid upload name.")
  }
  return join(UPLOAD_DIR, name)
}
