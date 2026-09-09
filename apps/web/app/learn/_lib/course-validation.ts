import { z } from "zod"

/**
 * Input schemas for authoring. Pure — no server imports — so both the actions
 * and their tests use the same rules.
 *
 * The length ceilings are guards against a paste accident filling a column,
 * not editorial limits: 200 chars is a long course title, 10k a long card.
 *
 * @spec L2-COURSE-05
 */

const requiredText = (max: number, label: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, `${label} is required.`)
    .refine((v) => v.length <= max, `${label} must be ${max} characters or fewer.`)

/** Trim → null when empty. */
const optionalText = z
  .string()
  .nullish()
  .transform((v) => {
    const t = (v ?? "").trim()
    return t.length > 0 ? t : null
  })

export const courseSchema = z.object({
  title: requiredText(200, "Title"),
  description: optionalText,
})

export const deckSchema = z.object({
  title: requiredText(200, "Title"),
})

export const cardSchema = z.object({
  front: requiredText(10_000, "Front"),
  back: requiredText(10_000, "Back"),
})
