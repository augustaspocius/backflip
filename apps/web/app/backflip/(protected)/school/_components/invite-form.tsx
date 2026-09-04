"use client"

import { useActionState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { SCHOOL_ROLES } from "@/app/_lib/school/roles"

import { inviteMember, type InviteState } from "../_actions"

/** Invite form. The action re-checks the capability server-side. */
export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(
    inviteMember,
    null
  )

  return (
    <form action={action} className="max-w-sm space-y-4">
      <div className="space-y-2">
        <Label htmlFor="invite-name">Name</Label>
        <Input id="invite-name" name="name" placeholder="Ada Lovelace" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="ada@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue="student"
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
        >
          {SCHOOL_ROLES.map((role) => (
            <option key={role} value={role}>
              {role[0]!.toUpperCase() + role.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Send invite"}
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
