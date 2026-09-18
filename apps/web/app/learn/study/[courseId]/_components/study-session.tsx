"use client"

import { useEffect, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

// NOT from the `@/app/_lib/srs` barrel: that re-exports `queue.ts`, which
// imports `server-only` and would fail this client build. `schedule` is pure.
import { GRADES, type Grade } from "@/app/_lib/srs/schedule"
import { ActionMessage } from "@/app/learn/_components/action-message"
import type { ActionState } from "@/app/learn/courses/_actions"
import { answerCard } from "../_actions"

/**
 * The study screen: front, reveal, rate, next. Keyboard-driven — space or
 * enter reveals, 1-4 rate — because a session is dozens of repetitions and
 * reaching for a mouse each time is the difference between a habit and a
 * chore.
 *
 * The last answer's result is kept in state and shown with `ActionMessage`
 * (`L2-COURSE-11`), but only when it failed — a "Saved." after every card
 * would be noise in a session that is dozens of repetitions long. The
 * session advances to the next card either way, including when `answerCard`
 * itself throws (a dropped connection costs one answer, not the session).
 */
/** One queued card, sides already rendered server-side (markdown → nodes). */
export type StudyCard = {
  cardId: string
  isNew: boolean
  front: ReactNode
  back: ReactNode
}

export function StudySession({ queue }: { queue: StudyCard[] }) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [result, setResult] = useState<ActionState>(null)
  const [pending, start] = useTransition()

  const card = queue[index]

  function rate(grade: Grade) {
    if (!card) return
    const cardId = card.cardId
    setResult(null)
    start(async () => {
      try {
        const res = await answerCard(cardId, grade)
        if (res && !res.ok) setResult(res)
      } catch {
        setResult({ ok: false, message: "Could not save that answer." })
      }
      setRevealed(false)
      setIndex((i) => i + 1)
    })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!card || pending) return
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault()
        setRevealed(true)
        return
      }
      if (!revealed) return
      // Once revealed, only 1-4 (or a click) rates. Without this, Space or
      // Enter would activate whichever rating button happens to have focus.
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault()
        return
      }
      if (["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault()
        rate(Number(e.key) as Grade)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (!card) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg">Nothing left to review.</p>
        {/* A failure on the last card must still show once the queue ends. */}
        <ActionMessage state={result} />
        <Link href="/learn" className="text-sm underline">
          Back to your courses
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-xs">
        {index + 1} of {queue.length}
        {card.isNew && " · new"}
      </p>

      <div className="min-h-32 rounded-lg border p-6 text-lg">
        {card.front}
      </div>

      {revealed ? (
        <>
          <div className="min-h-32 rounded-lg border p-6">
            {card.back}
          </div>
          <div className="flex flex-wrap gap-2">
            {GRADES.map((g) => (
              <Button
                key={g.value}
                variant={g.value === 1 ? "destructive" : "outline"}
                disabled={pending}
                onClick={() => rate(g.value)}
              >
                {g.label}
                <span className="text-muted-foreground ml-2 text-xs">
                  {g.value}
                </span>
              </Button>
            ))}
          </div>
        </>
      ) : (
        <Button onClick={() => setRevealed(true)}>Show answer</Button>
      )}

      <ActionMessage state={result} />
    </div>
  )
}
