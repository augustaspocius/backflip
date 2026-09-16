"use client"

import Link from "next/link"
import { useActionState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

import type { ActionState } from "../../_actions"
import { createDeck } from "../_actions"

export type DeckRow = { id: string; title: string; cardCount: number }

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

      {state && !state.ok && (
        <p className="text-destructive text-sm">{state.message}</p>
      )}
    </div>
  )
}
