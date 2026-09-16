"use client"

import type { ReactNode } from "react"
import { useActionState, useEffect, useState, useTransition } from "react"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

import { ActionMessage } from "@/app/learn/_components/action-message"
import type { ActionState } from "../../../../_actions"
import { deleteCard, updateCard } from "../../../_actions"

/**
 * One card's edit/delete controls. The rendered front/back markdown is
 * passed in as `children` from the (server) page rather than rendered here,
 * so `Markdown`/`react-markdown` never enters this client bundle — same
 * reasoning `CardEditor` already documents for skipping a live preview.
 *
 * `updateCard` already has the `(prevState, formData)` shape, so editing
 * uses `useActionState` directly and reuses `cardSchema`'s validation
 * exactly as the create form does — same action, same schema, just an `id`
 * added. `deleteCard` takes a positional id, so deletion uses
 * `useTransition` + local state, the same shape the deck list's per-deck
 * delete and `UnenrollButton` use. No confirmation on delete — smaller blast
 * radius than a course delete.
 */
export function CardRow({
  card,
  children,
}: {
  card: { id: string; front: string; back: string }
  children: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [editState, editAction, editPending] = useActionState<
    ActionState,
    FormData
  >(updateCard, null)

  useEffect(() => {
    if (editState?.ok) setEditing(false)
  }, [editState])

  const [deletePending, startDelete] = useTransition()
  const [deleteResult, setDeleteResult] = useState<ActionState>(null)

  if (editing) {
    return (
      <li className="py-4">
        <form action={editAction} className="space-y-3">
          <input type="hidden" name="id" value={card.id} />
          <Textarea
            name="front"
            required
            rows={3}
            defaultValue={card.front}
            aria-label="Front (markdown)"
          />
          <Textarea
            name="back"
            required
            rows={3}
            defaultValue={card.back}
            aria-label="Back (markdown)"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={editPending}>
              {editPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
          <ActionMessage state={editState} />
        </form>
      </li>
    )
  }

  return (
    <li className="space-y-2 py-4">
      {children}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={deletePending}
          onClick={() =>
            startDelete(async () => {
              setDeleteResult(null)
              setDeleteResult(await deleteCard(card.id))
            })
          }
        >
          {deletePending ? "Deleting…" : "Delete"}
        </Button>
        <ActionMessage state={deleteResult} />
      </div>
    </li>
  )
}
