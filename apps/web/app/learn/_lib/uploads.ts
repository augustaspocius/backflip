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

// `?.trim() ||`, not `??`: dotenv sets an empty `UPLOAD_DIR=` line (as ships
// in `.env.example`/`devops/env/production.env.example`, both intentionally
// commented out now) to `""`, not `undefined`, so `??` would never fall back
// and every write would target `join("", name)` — a cwd-relative path, wrong
// on a fresh clone and broken again on the droplet. Same pattern as
// `telemetrySalt()` in `apps/web/app/_lib/telemetry/config.ts`.
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR?.trim() || join(process.cwd(), "shared", "uploads")

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

/**
 * Leading bytes ("magic numbers") for each type we accept, checked against
 * the actual file content rather than trusting the claimed extension. An
 * extension is just a string the uploader chose; nothing upstream of this
 * reads the bytes, so without it an SVG or HTML file renamed to `foo.png`
 * would be written and later served as `image/png` — stored XSS unless the
 * browser happens to respect `X-Content-Type-Options: nosniff` (it is set
 * repo-wide in `apps/web/next.config.ts`, and is load-bearing for exactly
 * this reason, not decorative — see `L2-COURSE-10`). This check removes the
 * dependency on that header rather than only relying on it.
 */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  png: (b) =>
    b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) =>
    b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  webp: (b) =>
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50,
}

/**
 * True when `bytes` actually starts with the magic number for `ext` (one of
 * the stored extensions `safeUploadName` produces: `png`/`jpg`/`gif`/`webp`).
 * An unrecognized `ext` is always false — this function never allows a type
 * `safeUploadName` didn't already approve, it only distrusts the claim.
 */
export function matchesFileSignature(bytes: Uint8Array, ext: string): boolean {
  const check = SIGNATURES[ext]
  return check ? check(bytes) : false
}
