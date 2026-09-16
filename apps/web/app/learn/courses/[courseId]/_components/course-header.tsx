"use client"

import { useTransition } from "react"

import { Button } from "@workspace/ui/components/button"

import { setCourseStatus } from "../../_actions"

/**
 * Course title plus the publish toggle. Publishing is what makes enrolments
 * take effect, so it is the primary control here, not a settings detail.
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
  const next = status === "published" ? "draft" : "published"

  return (
    <div className="flex items-start gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
        <p className="text-muted-foreground text-xs capitalize">{status}</p>
      </div>

      <Button
        variant="outline"
        className="ml-auto"
        disabled={pending}
        onClick={() => start(() => void setCourseStatus(courseId, next))}
      >
        {status === "published" ? "Unpublish" : "Publish"}
      </Button>
    </div>
  )
}
