"use client"

/**
 * The one rendering of a server action's `{ ok, message } | null` result used
 * across every authoring form in `/learn`. Renders nothing when `state` is
 * `null` (the action hasn't run yet), the message in `text-green-600` when
 * `ok`, `text-destructive` otherwise — always the message, on both outcomes,
 * never silently discarded.
 *
 * @spec L2-COURSE-11
 */
export function ActionMessage({
  state,
}: {
  state: { ok: boolean; message: string } | null | undefined
}) {
  if (!state) return null
  return (
    <p className={state.ok ? "text-sm text-green-600" : "text-destructive text-sm"}>
      {state.message}
    </p>
  )
}
