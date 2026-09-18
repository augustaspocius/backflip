"use server"

import { mkdir, writeFile } from "node:fs/promises"

import { requireTeacher } from "@/app/_lib/school"
import {
  UPLOAD_DIR,
  matchesFileSignature,
  safeUploadName,
  uploadPath,
} from "@/app/learn/_lib/uploads"

/**
 * Store one card image and hand back the markdown URL for it. Teacher-only.
 *
 * @spec L2-COURSE-10
 */

// The user-facing cap. `apps/web/next.config.ts` sets the framework's server
// action body limit to 3 MB, deliberately above this — that limit covers the
// whole multipart body (field names + boundaries + the file), not just the
// file, and it is a backstop, not the real check: if it converges with (or
// drops below) this number, a teacher stops seeing "Images must be 2 MB or
// smaller." and instead hits Next's own unfriendly rejection before this
// function ever runs. Keep the two apart; do not "tidy" them to match.
const MAX_BYTES = 2 * 1024 * 1024

export type UploadState =
  | { ok: boolean; message: string; url?: string }
  | null

export async function uploadCardImage(
  _prev: UploadState,
  formData: FormData
): Promise<UploadState> {
  await requireTeacher()

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a file." }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "Images must be 2 MB or smaller." }
  }

  const name = safeUploadName(file.name)
  if (!name) {
    return { ok: false, message: "Use a PNG, JPEG, GIF or WebP image." }
  }

  // The extension only says what the uploader claims the file is — nothing
  // upstream inspects the bytes. Without this, an SVG or HTML file renamed
  // to `foo.png` would be written and later served as `image/png`, and only
  // the `nosniff` header on `next.config.ts`'s SECURITY_HEADERS stops a
  // browser from executing it anyway. Check the real bytes before writing.
  const bytes = Buffer.from(await file.arrayBuffer())
  const ext = name.slice(name.lastIndexOf(".") + 1)
  if (!matchesFileSignature(bytes, ext)) {
    return {
      ok: false,
      message: "That file's contents don't match a PNG, JPEG, GIF or WebP image.",
    }
  }

  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(uploadPath(name), bytes)

  const url = `/api/learn/uploads/${name}`
  return { ok: true, message: `Uploaded. Paste ![](${url}) into a card.`, url }
}
