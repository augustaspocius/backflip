"use client"

import { useActionState, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

import type { ActionState } from "../../../../_actions"
import { createCard } from "../../../_actions"

/**
 * New-card form with a live preview. Preview is plain text rather than
 * rendered markdown: `Markdown` is a server component here, and pulling a
 * renderer into the client bundle for a preview is not worth the kilobytes in
 * v1. The saved card renders as markdown on the study screen.
 */
export function CardEditor({ deckId }: { deckId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createCard,
    null
  )
  const [front, setFront] = useState("")

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="deckId" value={deckId} />

      <div className="space-y-2">
        <Label htmlFor="card-front">Front (markdown)</Label>
        <Textarea
          id="card-front"
          name="front"
          required
          rows={4}
          value={front}
          onChange={(e) => setFront(e.target.value)}
          placeholder="What does ATP stand for?"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="card-back">Back (markdown)</Label>
        <Textarea
          id="card-back"
          name="back"
          required
          rows={4}
          placeholder="Adenosine triphosphate"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add card"}
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
