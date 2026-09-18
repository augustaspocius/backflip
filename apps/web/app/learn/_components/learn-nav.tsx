import Link from "next/link"

import type { SchoolRole } from "@/app/_lib/school/roles"

/**
 * Top bar for `/learn`. The teacher link is cosmetic gating only — the routes
 * behind it call `requireTeacher()` themselves (`L2-SCHOOL-05`).
 */
export function LearnNav({
  role,
  name,
}: {
  role: SchoolRole
  name: string | null
}) {
  return (
    <header className="border-b">
      <nav className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-3">
        <Link href="/learn" className="font-semibold">
          Repeat &amp; Learn
        </Link>
        {role === "teacher" && (
          <Link
            href="/learn/courses"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Courses
          </Link>
        )}
        <span className="text-muted-foreground ml-auto text-sm">
          {name ?? "Signed in"}
        </span>
      </nav>
    </header>
  )
}
