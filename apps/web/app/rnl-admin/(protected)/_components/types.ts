import type { Role } from "@/app/_lib/auth/permissions"
import type { SchoolRole } from "@/app/_lib/school/roles"

export type SessionUser = {
  name: string
  email: string
  image: string | null
  role?: Role
  /** School membership role, null when not a member. Drives `/learn` links. */
  schoolRole: SchoolRole | null
}
