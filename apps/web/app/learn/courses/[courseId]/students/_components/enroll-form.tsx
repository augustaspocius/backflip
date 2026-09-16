"use client"

import { useActionState } from "react"

import { Button } from "@workspace/ui/components/button"

import type { ActionState } from "../../../_actions"
import { enrollStudent } from "../_actions"

export type Candidate = { id: string; label: string }

/** Enrol one of the school's students who is not already on the course. */
export function EnrollForm({
  courseId,
  candidates,
}: {
  courseId: string
  candidates: Candidate[]
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    enrollStudent,
    null
  )

  if (candidates.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Every student in the school is already enrolled.
      </p>
    )
  }

  return (
    <form action={action} className="flex items-end gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <select
        name="userId"
        required
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <Button type="submit" disabled={pending}>
        {pending ? "Enrolling…" : "Enrol"}
      </Button>
      {state && !state.ok && (
        <p className="text-destructive text-sm">{state.message}</p>
      )}
    </form>
  )
}
