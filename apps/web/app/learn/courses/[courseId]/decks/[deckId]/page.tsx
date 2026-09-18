import { notFound } from "next/navigation"

import { cards, courses, db, decks } from "@workspace/db"
import { and, eq } from "drizzle-orm"

import { requireTeacher } from "@/app/_lib/school"
import { Markdown } from "@/app/learn/_components/markdown"
import { CardEditor } from "./_components/card-editor"
import { CardRow } from "./_components/card-row"
import { ImageUpload } from "./_components/image-upload"

/**
 * Deck detail: the cards in it, and the form to add one. Ownership is proven
 * by the join to `course` on the teacher's school, AND the deck must belong
 * to the `courseId` segment of the URL itself — without that second check, a
 * deck id from a different course in the SAME school still passes the
 * school-scoped WHERE and would render under the wrong course's URL.
 *
 * @spec L2-COURSE-06, L2-SCHOOL-06
 */
export default async function DeckPage({
  params,
}: {
  params: Promise<{ courseId: string; deckId: string }>
}) {
  const { courseId, deckId } = await params
  const teacher = await requireTeacher()

  const [deck] = await db
    .select({ id: decks.id, title: decks.title })
    .from(decks)
    .innerJoin(courses, eq(courses.id, decks.courseId))
    .where(
      and(
        eq(decks.id, deckId),
        eq(decks.courseId, courseId),
        eq(courses.schoolId, teacher.schoolId)
      )
    )

  if (!deck) notFound()

  const rows = await db
    .select({ id: cards.id, front: cards.front, back: cards.back })
    .from(cards)
    .where(eq(cards.deckId, deck.id))
    .orderBy(cards.position, cards.createdAt)

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{deck.title}</h1>

      <ul className="divide-y">
        {rows.map((c) => (
          <CardRow key={c.id} card={c}>
            <Markdown source={c.front} />
            <div className="text-muted-foreground border-l-2 pl-3">
              <Markdown source={c.back} />
            </div>
          </CardRow>
        ))}
        {rows.length === 0 && (
          <li className="text-muted-foreground py-3 text-sm">No cards yet.</li>
        )}
      </ul>

      <CardEditor deckId={deck.id} />

      <div className="space-y-2 border-t pt-6">
        <h2 className="text-sm font-medium">Get an image URL to paste</h2>
        <ImageUpload />
      </div>
    </div>
  )
}
