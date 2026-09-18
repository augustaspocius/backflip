import { redirect } from "next/navigation"

import { auth } from "./index"
import { can, type Capability } from "./permissions"

/**
 * Server-only route guard. Resolves the session and enforces `capability`:
 * unauthenticated → login; authenticated but lacking the capability →
 * `/rnl-admin` (dashboard, reachable by every role). Returns the session user
 * so callers can use `id`/`role` without a second `auth()` call.
 *
 * @spec L2-AUTH-20, L2-AUTH-22
 */
export async function requireCapability(capability: Capability) {
  const session = await auth()
  if (!session?.user) redirect("/rnl-admin/login")
  if (!can(session.user.role, capability)) redirect("/rnl-admin")
  return session.user
}
