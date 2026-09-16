"use client"

import { useActionState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

import { createCourse, type ActionState } from "../_actions"

/** New-course form. The action re-checks the teacher role server-side. */
export function CourseForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createCourse,
    null
  )

  return (
    <form action={action} className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="course-title">Title</Label>
        <Input id="course-title" name="title" required placeholder="Biology 101" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="course-description">Description</Label>
        <Textarea
          id="course-description"
          name="description"
          rows={3}
          placeholder="What this course covers."
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create course"}
      </Button>

      {state && (
        <p
          className={
            state.ok ? "text-sm text-green-600" : "text-destructive text-sm"
          }
        >
          {state.message}
        </p>
      )}
    </form>
  )
}
