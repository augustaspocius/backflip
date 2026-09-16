import { readFile } from "node:fs/promises"

import { auth } from "@/app/_lib/auth"
import { uploadPath } from "@/app/learn/_lib/uploads"

/**
 * Serve an uploaded card image. A route handler rather than a server action
 * because there is no other way to return bytes; this is a binary endpoint,
 * not a data layer, so `L1-ARCH-03` is satisfied.
 *
 * Gated on a session only, not on membership: images are embedded in card
 * markdown and requested by the browser as sub-resources, and a per-image
 * enrolment check would cost one query per image on every study screen. The
 * names are unguessable UUIDs, so a session is the meaningful boundary here.
 *
 * @spec L2-COURSE-10
 */

export const runtime = "nodejs"

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth()
  if (!session?.user) return new Response("Unauthorized", { status: 401 })

  const { name } = await params

  let path: string
  try {
    path = uploadPath(name)
  } catch {
    return new Response("Not found", { status: 404 })
  }

  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase()
  const type = TYPES[ext]
  if (!type) return new Response("Not found", { status: 404 })

  try {
    const bytes = await readFile(path)
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        // Names are content-addressed by randomness, so a stored file never
        // changes under its name.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
