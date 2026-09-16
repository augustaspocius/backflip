"use client"

import { useState, useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

import { ActionMessage } from "@/app/learn/_components/action-message"
import type { ActionState } from "../../../_actions"
import { unenrollStudent } from "../_actions"

/**
 * Remove one student from a course's roster. `unenrollStudent` takes
 * positional args, not `(prevState, formData)`, so this follows the same
 * `useTransition` + local-state shape `CourseHeader`'s publish toggle uses,
 * rather than reshaping the action to fit `useActionState`. No confirmation
 * step: unlike `deleteCourse`, this only removes one `enrollment` row —
 * `card_state` survives, so re-enrolling resumes rather than resets.
 */
export function UnenrollButton({
  courseId,
  userId,
}: {
  courseId: string
  userId: string
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionState>(null)

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(null)
            setResult(await unenrollStudent(courseId, userId))
          })
        }
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
      <ActionMessage state={result} />
    </span>
  )
}
