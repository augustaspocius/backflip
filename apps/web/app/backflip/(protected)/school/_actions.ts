"use server"

import { revalidatePath } from "next/cache"

import { db, schoolMembers, users } from "@workspace/db"
import { eq } from "drizzle-orm"

import { auth } from "@/app/_lib/auth"
import { canEditUsers } from "@/app/_lib/auth/permissions"
import { sendWelcomeEmail } from "@/app/_lib/email/send"
import { getCurrentSchoolId } from "@/app/_lib/school"
import { firstError, inviteMemberSchema } from "@/app/_lib/validation"

/**
 * Invite someone into the school.
 *
 * There is no invite token and no accept page, and that is the point: Google
 * sign-in already refuses any email without a `user` row (`L2-AUTH-10`) and
 * requires a verified address (`L2-AUTH-41`). Creating the row IS the invite.
 * The email is a courtesy pointing at the login page.
 *
 * Idempotent by design — inviting an existing user adds or updates their
 * membership rather than failing on the unique email.
 *
 * @spec L2-SCHOOL-09, L2-SCHOOL-10
 */

export type InviteState = { ok: boolean; message: string } | null

export async function inviteMember(
  _prev: InviteState,
  formData: FormData
): Promise<InviteState> {
  const session = await auth()
  if (!session?.user || !canEditUsers(session.user.role)) {
    return { ok: false, message: "Unauthorized" }
  }

  const parsed = inviteMemberSchema.safeParse({
    name: formData.get("name") == null ? undefined : String(formData.get("name")),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
  })
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) }
  const { name, email, role } = parsed.data

  const schoolId = await getCurrentSchoolId()

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))

    // No password: this account signs in with Google (`L2-DB-06`, null hash).
    const id =
      existing?.id ??
      (
        await tx
          .insert(users)
          .values({ name, email, role: "teammate" })
          .returning({ id: users.id })
      )[0]!.id

    await tx
      .insert(schoolMembers)
      .values({ schoolId, userId: id, role })
      .onConflictDoUpdate({
        target: [schoolMembers.schoolId, schoolMembers.userId],
        set: { role },
      })
  })

  // Best-effort, exactly like user creation (`L2-EMAIL-11`): an unconfigured
  // email provider must not undo an invite that already landed in the db.
  await sendWelcomeEmail({ to: email, name }).catch(() => undefined)

  revalidatePath("/backflip/school")
  return {
    ok: true,
    message: `${email} can now sign in as a ${role}.`,
  }
}
