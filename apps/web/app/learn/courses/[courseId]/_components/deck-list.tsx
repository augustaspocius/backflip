"use client"

import Link from "next/link"
import { useActionState, useState, useTransition } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import { ActionMessage } from "@/app/learn/_components/action-message"
import type { ActionState } from "../../_actions"
import { createDeck, deleteDeck } from "../_actions"

export type DeckRow = { id: string; title: string; cardCount: number }

/**
 * One deck's delete control. `deleteDeck` takes a positional `deckId`, not
 * `(prevState, formData)`, so this follows the same `useTransition` + local
 * state shape as `CourseHeader`'s publish toggle rather than reshaping the
 * action to fit `useActionState`. No confirmation step — smaller blast
 * radius than a course delete, and a per-control confirm on every minor
 * delete is not warranted here.
 */
function DeleteDeckButton({ deckId }: { deckId: string }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionState>(null)

  return (
    <span className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(null)
            setResult(await deleteDeck(deckId))
          })
        }
      >
        {pending ? "Deleting…" : "Delete"}
      </Button>
      <ActionMessage state={result} />
    </span>
  )
}

/** Decks in a course, with an inline add form. */
export function DeckList({
  courseId,
  decks,
}: {
  courseId: string
  decks: DeckRow[]
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    createDeck,
    null
  )

  return (
    <div className="space-y-4">
      <h2 className="font-medium">Decks</h2>

      <ul className="divide-y">
        {decks.map((d) => (
          <li key={d.id} className="flex items-center gap-3 py-2">
            <Link
              href={`/learn/courses/${courseId}/decks/${d.id}`}
              className="hover:underline"
            >
              {d.title}
            </Link>
            <span className="text-muted-foreground ml-auto text-xs">
              {d.cardCount} card{d.cardCount === 1 ? "" : "s"}
            </span>
            <DeleteDeckButton deckId={d.id} />
          </li>
        ))}
        {decks.length === 0 && (
          <li className="text-muted-foreground py-2 text-sm">No decks yet.</li>
        )}
      </ul>

      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="courseId" value={courseId} />
        <Input name="title" required placeholder="New deck title" />
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add deck"}
        </Button>
      </form>

      <ActionMessage state={state} />
    </div>
  )
}
