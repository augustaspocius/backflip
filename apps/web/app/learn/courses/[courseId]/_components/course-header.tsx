"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState, useTransition } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

import { ActionMessage } from "@/app/learn/_components/action-message"
import {
  deleteCourse,
  setCourseStatus,
  updateCourse,
  type ActionState,
} from "../../_actions"

/**
 * Course title plus the publish toggle, an inline title/description editor,
 * and delete. Publishing is what makes enrolments take effect, so it stays
 * the primary control here, not a settings detail.
 *
 * `setCourseStatus` and `deleteCourse` take positional args, not
 * `(prevState, formData)`, so both stay on `useTransition` + local state,
 * same as before — reshaping a working server action to fit a client hook
 * isn't worth it. `updateCourse` already has the `(prevState, formData)`
 * shape, so its inline form uses `useActionState` directly and closes
 * itself (`useEffect`) once a save actually lands.
 *
 * `deleteCourse` cascades through every deck, card and enrolment with no
 * undo, so it is the one control here gated by an explicit confirmation
 * (`window.confirm`) before it fires — a plain blocking step between the
 * click and the request, deliberately not more elaborate than that. Nothing
 * else in this component asks for confirmation; that would be reflexive,
 * not warranted for a smaller, recoverable action.
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
  const router = useRouter()
  const next = status === "published" ? "draft" : "published"

  const [publishPending, startPublish] = useTransition()
  const [publishResult, setPublishResult] = useState<ActionState>(null)

  const [deletePending, startDelete] = useTransition()
  const [deleteResult, setDeleteResult] = useState<ActionState>(null)

  const [editing, setEditing] = useState(false)
  const [editState, editAction, editPending] = useActionState<
    ActionState,
    FormData
  >(updateCourse, null)

  useEffect(() => {
    if (editState?.ok) setEditing(false)
  }, [editState])

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
          <p className="text-muted-foreground text-xs capitalize">{status}</p>
          <ActionMessage state={publishResult} />
          <ActionMessage state={deleteResult} />
        </div>

        <Link
          href={`/learn/courses/${courseId}/students`}
          className="text-muted-foreground hover:text-foreground ml-auto text-sm"
        >
          Students
        </Link>

        <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
          {editing ? "Cancel" : "Edit"}
        </Button>

        <Button
          variant="outline"
          disabled={publishPending}
          onClick={() =>
            startPublish(async () => {
              setPublishResult(null)
              setPublishResult(await setCourseStatus(courseId, next))
            })
          }
        >
          {status === "published" ? "Unpublish" : "Publish"}
        </Button>

        <Button
          type="button"
          variant="destructive"
          disabled={deletePending}
          onClick={() => {
            const confirmed = window.confirm(
              `Delete "${title}"? This permanently removes every deck, card and enrolment in it. This cannot be undone.`
            )
            if (!confirmed) return

            startDelete(async () => {
              setDeleteResult(null)
              const result = await deleteCourse(courseId)
              setDeleteResult(result)
              if (result?.ok) router.push("/learn/courses")
            })
          }}
        >
          {deletePending ? "Deleting…" : "Delete"}
        </Button>
      </div>

      {editing && (
        <form action={editAction} className="max-w-md space-y-3 border-t pt-4">
          <input type="hidden" name="id" value={courseId} />
          <div className="space-y-2">
            <Label htmlFor="course-edit-title">Title</Label>
            <Input
              id="course-edit-title"
              name="title"
              required
              defaultValue={title}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="course-edit-description">Description</Label>
            <Textarea
              id="course-edit-description"
              name="description"
              rows={3}
              defaultValue={description ?? ""}
            />
          </div>
          <Button type="submit" disabled={editPending}>
            {editPending ? "Saving…" : "Save"}
          </Button>
          <ActionMessage state={editState} />
        </form>
      )}
    </div>
  )
}
