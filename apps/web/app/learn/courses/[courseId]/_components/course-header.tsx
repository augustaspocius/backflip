"use client"

import { useState, useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

import { setCourseStatus, type ActionState } from "../../_actions"

/**
 * Course title plus the publish toggle. Publishing is what makes enrolments
 * take effect, so it is the primary control here, not a settings detail.
 *
 * `setCourseStatus` takes positional args, not `(prevState, formData)`, so
 * this stays on `useTransition` + local state rather than `useActionState`
 * — reshaping a working server action to fit a client hook isn't worth it.
 * Success needs no message (the status text and `revalidatePath` already
 * cover it); only a failure — e.g. the course was deleted elsewhere and the
 * scoped WHERE now matches zero rows — needs surfacing.
 */
export function CourseHeader({
  courseId,
  title,
  description,
  status,
}: {
  courseId: string
  title: string
  description: string | null
  status: "draft" | "published"
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionState>(null)
  const next = status === "published" ? "draft" : "published"

  return (
    <div className="flex items-start gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
        <p className="text-muted-foreground text-xs capitalize">{status}</p>
        {result && !result.ok && (
          <p className="text-destructive text-sm">{result.message}</p>
        )}
      </div>

      <Button
        variant="outline"
        className="ml-auto"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(null)
            setResult(await setCourseStatus(courseId, next))
          })
        }
      >
        {status === "published" ? "Unpublish" : "Publish"}
      </Button>
    </div>
  )
}
