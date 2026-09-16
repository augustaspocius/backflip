"use client"

import { useActionState, useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"

import { ActionMessage } from "@/app/learn/_components/action-message"
import type { ActionState } from "../../../../_actions"
import { createCard } from "../../../_actions"

/**
 * New-card form with a live preview. Preview is plain text rather than
 * rendered markdown: `Markdown` is a server component here, and pulling a
 * renderer into the client bundle for a preview is not worth the kilobytes in
 * v1. The saved card renders as markdown on the study screen.
 *
 * Both fields are controlled and cleared on a successful add — without that,
 * the next card started pre-filled with the previous one's front.
 */
export function CardEditor({ deckId }: { deckId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createCard,
    null
  )
  const [front, setFront] = useState("")
  const [back, setBack] = useState("")

  useEffect(() => {
    if (state?.ok) {
      setFront("")
      setBack("")
    }
  }, [state])

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
          value={back}
          onChange={(e) => setBack(e.target.value)}
          placeholder="Adenosine triphosphate"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add card"}
      </Button>

      <ActionMessage state={state} />
    </form>
  )
}
