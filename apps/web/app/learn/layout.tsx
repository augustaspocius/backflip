import type { ReactNode } from "react"

import { requireMembership } from "@/app/_lib/school"
import { LearnNav } from "./_components/learn-nav"

/**
 * Authenticated `/learn` shell. The proxy has already rejected sessionless
 * requests; this layout enforces the product-side rule the edge cannot check —
 * that the signed-in person is actually a member of the school.
 *
 * Deliberately not the `/rnl-admin` shell: students are not operators, and the
 * console's sidebar, density and vocabulary are wrong for them.
 *
 * @spec L2-SCHOOL-05
 */
export default async function LearnLayout({
  children,
}: {
  children: ReactNode
}) {
  const member = await requireMembership()

  return (
    <div className="min-h-svh bg-background">
      <LearnNav role={member.role} name={member.name} />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">{children}</main>
    </div>
  )
}
