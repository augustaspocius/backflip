"use server"

import { mkdir, writeFile } from "node:fs/promises"

import { requireTeacher } from "@/app/_lib/school"
import { UPLOAD_DIR, safeUploadName, uploadPath } from "@/app/learn/_lib/uploads"

/**
 * Store one card image and hand back the markdown URL for it. Teacher-only.
 *
 * @spec L2-COURSE-10
 */

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

  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(uploadPath(name), Buffer.from(await file.arrayBuffer()))

  const url = `/api/learn/uploads/${name}`
  return { ok: true, message: `Uploaded. Paste ![](${url}) into a card.`, url }
}
