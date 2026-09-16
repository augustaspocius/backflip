"use client"

import { useActionState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { uploadCardImage, type UploadState } from "../_upload-actions"

/**
 * Upload a card image and hand back its markdown snippet, so a teacher has a
 * concrete way to get an image URL without going near `uploadCardImage`
 * directly. Deliberately its own small form rather than folded into
 * `CardEditor`: the front/back textareas take markdown as typed text, and
 * this produces a snippet to paste into one of them — two different jobs.
 */
export function ImageUpload() {
  const [state, action, pending] = useActionState<UploadState, FormData>(
    uploadCardImage,
    null
  )

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="card-image-file">Image file</Label>
        <Input
          id="card-image-file"
          name="file"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          required
        />
      </div>

      <Button type="submit" disabled={pending} variant="secondary">
        {pending ? "Uploading…" : "Upload image"}
      </Button>

      {state?.ok && state.url && (
        <div className="space-y-2">
          <Label htmlFor="card-image-snippet">
            Paste this into the card front or back
          </Label>
          <Input
            id="card-image-snippet"
            readOnly
            value={`![](${state.url})`}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}

      {state && !state.ok && (
        <p className="text-destructive text-sm">{state.message}</p>
      )}
    </form>
  )
}
