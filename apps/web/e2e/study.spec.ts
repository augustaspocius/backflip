import { expect, test, type Page } from "@playwright/test"
import { and, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"

import {
  cardStates,
  cards,
  courses,
  decks,
  enrollments,
  reviewLogs,
  schools,
  users,
} from "@workspace/db/schema"

import {
  OUTSIDER,
  OWNER,
  RIVAL_SCHOOL,
  STUDENT,
  TEST_DATABASE_URL,
} from "./env"
import { OUTSIDER_DECK_TITLE } from "./global-setup"

/**
 * The review loop end to end (`/learn`, `/learn/study/[courseId]`, the
 * teacher's progress page), plus the hostile-client cases for `answerCard`,
 * the only write path for a review.
 *
 * `OWNER` (teacher, default school) authors; `STUDENT` (student, default
 * school) studies. The hostile cases seed their courses directly through pg
 * (same standalone pool pattern as `authoring.spec.ts`): the point there is
 * the server action's guard, not the authoring UI.
 *
 * Hostile cases rewrite the real `answerCard` request a legitimate session
 * sends. A server action is a POST to the page URL carrying a `next-action`
 * header; its body is the serialized argument list (`["<cardId>",<grade>]`).
 * Each case swaps in a target the UI never offers and proves, via pg, that
 * nothing was written. Every leg of the reachability join has a case that
 * ONLY that leg rejects, so removing any one leg turns a test red.
 *
 * @spec L2-TEST-06, L2-SRS-06, L2-SRS-07, L2-SRS-08
 */

async function login(page: Page, email: string, password: string) {
  await page.goto("/rnl-admin/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL("/rnl-admin")
}

async function switchUser(page: Page, email: string, password: string) {
  await page.context().clearCookies()
  await login(page, email, password)
}

const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL })
const db = drizzle(pool)

async function userIdOf(email: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
  if (!row) throw new Error(`fixture user ${email} missing`)
  return row.id
}

async function reviewRows(userId: string, cardId: string) {
  const states = await db
    .select()
    .from(cardStates)
    .where(and(eq(cardStates.userId, userId), eq(cardStates.cardId, cardId)))
  const logs = await db
    .select()
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), eq(reviewLogs.cardId, cardId)))
  return { states, logs }
}

/** Reveal the current card. Retried: a click that lands before hydration
 *  does nothing, and the button is gone once it works. */
async function reveal(page: Page, back: string) {
  await expect(async () => {
    await page.getByRole("button", { name: "Show answer" }).click({
      timeout: 2_000,
    })
    await expect(page.getByText(back)).toBeVisible({ timeout: 2_000 })
  }).toPass()
}

test.afterAll(async () => {
  await pool.end()
})

test("a student studies a course end to end and the teacher sees it", async ({
  page,
}) => {
  const title = `Review Loop ${Date.now()}`
  const deckTitle = "Energy"
  // Markdown source: the study screen must render it, not show asterisks.
  const front = "What is **ATP**?"
  const back = "Adenosine triphosphate"
  let courseId = ""

  await login(page, OWNER.email, OWNER.password)

  await test.step("OWNER creates a course with a deck and one card", async () => {
    await page.goto("/learn/courses")
    await page.getByLabel("Title").fill(title)
    await page.getByRole("button", { name: "Create course" }).click()
    await page.getByRole("link", { name: title }).click()
    await expect(page).toHaveURL(/\/learn\/courses\/[^/]+$/)
    courseId = new URL(page.url()).pathname.split("/").pop()!

    await page.getByPlaceholder("New deck title").fill(deckTitle)
    await page.getByRole("button", { name: "Add deck" }).click()
    await page.getByRole("link", { name: deckTitle }).click()
    await expect(page).toHaveURL(/\/decks\/[^/]+$/)

    await page.getByLabel("Front (markdown)").fill(front)
    await page.getByLabel("Back (markdown)").fill(back)
    await page.getByRole("button", { name: "Add card" }).click()
    await expect(page.locator("li", { hasText: back })).toBeVisible()
  })

  await test.step("OWNER enrols STUDENT and publishes", async () => {
    await page.goto(`/learn/courses/${courseId}/students`)
    await page
      .locator('select[name="userId"]')
      .selectOption({ label: `${STUDENT.name} (${STUDENT.email})` })
    await page.getByRole("button", { name: "Enrol" }).click()
    await expect(page.locator("li", { hasText: STUDENT.email })).toBeVisible()

    await page.goto(`/learn/courses/${courseId}`)
    await page.getByRole("button", { name: "Publish" }).click()
    await expect(page.getByText("published", { exact: true })).toBeVisible()
  })

  await switchUser(page, STUDENT.email, STUDENT.password)
  const row = page.locator("li", { hasText: title })

  await test.step("STUDENT's dashboard shows 1 due", async () => {
    await page.goto("/learn")
    await expect(row).toContainText("1 due")
  })

  await test.step("STUDENT studies: reveal, rate Good, queue empties", async () => {
    await row.getByRole("link", { name: title }).click()
    await expect(page).toHaveURL(`/learn/study/${courseId}`)
    await expect(page.locator("strong", { hasText: "ATP" })).toBeVisible()
    await expect(page.getByText(front)).toHaveCount(0)

    await reveal(page, back)
    await page.getByRole("button", { name: /^Good/ }).click()

    await expect(page.getByText("Nothing left to review.")).toBeVisible()
  })

  await test.step("back on the dashboard the row reads Nothing due", async () => {
    await page.goto("/learn")
    await expect(row).toContainText("Nothing due")
  })

  await test.step("exactly one review_log and one card_state row, due in the future", async () => {
    const studentId = await userIdOf(STUDENT.email)
    const [card] = await db
      .select({ id: cards.id })
      .from(cards)
      .innerJoin(decks, eq(decks.id, cards.deckId))
      .where(eq(decks.courseId, courseId))
    expect(card).toBeDefined()

    const { states, logs } = await reviewRows(studentId, card!.id)
    expect(logs).toHaveLength(1)
    expect(logs[0]!.rating).toBe(3)
    expect(states).toHaveLength(1)
    expect(states[0]!.due.getTime()).toBeGreaterThan(Date.now())
  })

  await test.step("seed an overdue card_state for STUDENT in ANOTHER course", async () => {
    // Progress must count this course's cards only. A query that joins
    // card_state on the student alone would report 2 seen / 1 due below.
    const [defaultSchool] = await db
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.slug, "default"))
    const [other] = await db
      .insert(courses)
      .values({ schoolId: defaultSchool!.id, title: `Elsewhere ${Date.now()}` })
      .returning({ id: courses.id })
    const [otherDeck] = await db
      .insert(decks)
      .values({ courseId: other!.id, title: "Elsewhere deck" })
      .returning({ id: decks.id })
    const [otherCard] = await db
      .insert(cards)
      .values({ deckId: otherDeck!.id, front: "f", back: "b" })
      .returning({ id: cards.id })
    await db.insert(cardStates).values({
      userId: await userIdOf(STUDENT.email),
      cardId: otherCard!.id,
      due: new Date(Date.now() - 86_400_000),
      stability: 1,
      difficulty: 5,
      scheduledDays: 1,
      state: 2,
      lastReviewAt: new Date(Date.now() - 2 * 86_400_000),
    })
  })

  await test.step("OWNER's progress page shows the student's review", async () => {
    await switchUser(page, OWNER.email, OWNER.password)
    await page.goto(`/learn/courses/${courseId}`)
    await page.getByRole("link", { name: "Progress" }).click()
    await expect(page).toHaveURL(`/learn/courses/${courseId}/progress`)
    await expect(
      page.getByRole("heading", { name: `${title}: progress` })
    ).toBeVisible()

    const progressRow = page.locator("tbody tr", { hasText: STUDENT.email })
    const cells = progressRow.locator("td")
    await expect(cells.nth(1)).toHaveText("1")
    await expect(cells.nth(2)).toHaveText("0")
    await expect(cells.nth(3)).toHaveText(new Date().toISOString().slice(0, 10))
  })
})

test("a student cannot reach the teacher's course list", async ({ page }) => {
  await login(page, STUDENT.email, STUDENT.password)
  await page.goto("/learn/courses")
  await expect(page).toHaveURL("/learn")
})

test("the daily new-card cap holds back unseen cards until UTC midnight", async ({
  page,
}) => {
  // One unseen card, plus 20 cards STUDENT was introduced to today (a
  // `review_log` row with pre-answer state New). Their `card_state` rows are
  // due in the future, so nothing reviewed is due: whatever the badge and
  // queue show comes from the unseen card and the cap alone.
  const title = `Daily Cap ${Date.now()}`
  const studentId = await userIdOf(STUDENT.email)
  const ownerId = await userIdOf(OWNER.email)
  const [defaultSchool] = await db
    .select({ id: schools.id })
    .from(schools)
    .where(eq(schools.slug, "default"))
  const [course] = await db
    .insert(courses)
    .values({
      schoolId: defaultSchool!.id,
      ownerId,
      title,
      status: "published",
    })
    .returning({ id: courses.id })
  const [deck] = await db
    .insert(decks)
    .values({ courseId: course!.id, title: "Cap deck" })
    .returning({ id: decks.id })
  await db
    .insert(enrollments)
    .values({ courseId: course!.id, userId: studentId })
  await db
    .insert(cards)
    .values({ deckId: deck!.id, front: "Unseen front", back: "Unseen back" })

  const now = new Date()
  const introducedIds: string[] = []
  for (let i = 0; i < 20; i++) {
    const [card] = await db
      .insert(cards)
      .values({
        deckId: deck!.id,
        front: `Seen front ${i}`,
        back: `Seen back ${i}`,
        position: i + 1,
      })
      .returning({ id: cards.id })
    introducedIds.push(card!.id)
    await db.insert(cardStates).values({
      userId: studentId,
      cardId: card!.id,
      due: new Date(now.getTime() + 3 * 86_400_000),
      stability: 3,
      difficulty: 5,
      scheduledDays: 3,
      reps: 1,
      state: 2,
      lastReviewAt: now,
    })
    await db.insert(reviewLogs).values({
      userId: studentId,
      cardId: card!.id,
      rating: 3,
      state: 0,
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      reviewedAt: now,
    })
  }

  await login(page, STUDENT.email, STUDENT.password)
  const row = page.locator("li", { hasText: title })

  await test.step("with 20 introduced today, the unseen card is held back", async () => {
    await page.goto("/learn")
    await expect(row).toContainText("Nothing due")

    await page.goto(`/learn/study/${course!.id}`)
    await expect(page.getByText("Nothing left to review.")).toBeVisible()
    await expect(page.getByText("Unseen front")).toHaveCount(0)
  })

  await test.step("once those introductions are before UTC midnight, it is due", async () => {
    const midnight = new Date(now)
    midnight.setUTCHours(0, 0, 0, 0)
    await db
      .update(reviewLogs)
      .set({ reviewedAt: new Date(midnight.getTime() - 60 * 60 * 1000) })
      .where(
        and(
          eq(reviewLogs.userId, studentId),
          inArray(reviewLogs.cardId, introducedIds)
        )
      )

    await page.goto("/learn")
    await expect(row).toContainText("1 due")
  })
})

test.describe("seeded study fixtures", () => {
  /** A published default-school course STUDENT is enrolled in, two cards:
   *  the legitimate session every hostile case starts from. */
  let legit: { courseId: string; title: string; cardIds: string[] }
  /** Draft default-school course STUDENT IS enrolled in. Only the
   *  published leg rejects it. */
  let draft: { courseId: string; title: string; cardId: string }
  /** Published default-school course STUDENT is NOT enrolled in (OWNER is).
   *  Only the enrolment leg rejects it. */
  let unenrolled: { cardId: string }
  /** A card in OUTSIDER's seeded rival-school course (draft, not enrolled). */
  let outsiderCardId: string
  /** Published rival-school course with STUDENT enrolled anyway: the
   *  cross-school data mixup `L2-DB-44` warns about. Only the schoolId leg
   *  rejects it. */
  let crossSchool: { cardId: string }
  let studentId: string

  test.beforeAll(async () => {
    const stamp = Date.now()
    studentId = await userIdOf(STUDENT.email)
    const ownerId = await userIdOf(OWNER.email)
    const outsiderId = await userIdOf(OUTSIDER.email)
    const [defaultSchool] = await db
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.slug, "default"))
    const [rivalSchool] = await db
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.slug, RIVAL_SCHOOL.slug))
    if (!defaultSchool || !rivalSchool) throw new Error("schools missing")

    async function seedCourse(opts: {
      schoolId: string
      ownerId: string
      title: string
      status: "draft" | "published"
      cardCount: number
      enrol: boolean
    }) {
      const [course] = await db
        .insert(courses)
        .values({
          schoolId: opts.schoolId,
          ownerId: opts.ownerId,
          title: opts.title,
          status: opts.status,
        })
        .returning({ id: courses.id })
      const [deck] = await db
        .insert(decks)
        .values({ courseId: course!.id, title: "Seeded deck" })
        .returning({ id: decks.id })
      const cardIds: string[] = []
      for (let i = 0; i < opts.cardCount; i++) {
        const [card] = await db
          .insert(cards)
          .values({
            deckId: deck!.id,
            front: `${opts.title} front ${i + 1}`,
            back: `${opts.title} back ${i + 1}`,
            position: i,
          })
          .returning({ id: cards.id })
        cardIds.push(card!.id)
      }
      if (opts.enrol) {
        await db
          .insert(enrollments)
          .values({ courseId: course!.id, userId: studentId })
      }
      return { courseId: course!.id, title: opts.title, cardIds }
    }

    const legitSeed = await seedCourse({
      schoolId: defaultSchool.id,
      ownerId,
      title: `Legit Session ${stamp}`,
      status: "published",
      cardCount: 2,
      enrol: true,
    })
    legit = legitSeed

    const draftSeed = await seedCourse({
      schoolId: defaultSchool.id,
      ownerId,
      title: `Draft Only ${stamp}`,
      status: "draft",
      cardCount: 1,
      enrol: true,
    })
    draft = { ...draftSeed, cardId: draftSeed.cardIds[0]! }

    const unenrolledSeed = await seedCourse({
      schoolId: defaultSchool.id,
      ownerId,
      title: `Not Enrolled ${stamp}`,
      status: "published",
      cardCount: 1,
      enrol: false,
    })
    unenrolled = { cardId: unenrolledSeed.cardIds[0]! }
    // Someone else IS enrolled, so a guard that only checks "any enrolment
    // exists" (dropping the `userId` condition) still lets this through.
    await db
      .insert(enrollments)
      .values({ courseId: unenrolledSeed.courseId, userId: ownerId })

    const crossSeed = await seedCourse({
      schoolId: rivalSchool.id,
      ownerId: outsiderId,
      title: `Rival Published ${stamp}`,
      status: "published",
      cardCount: 1,
      enrol: true,
    })
    crossSchool = { cardId: crossSeed.cardIds[0]! }

    const [outsiderDeck] = await db
      .select({ id: decks.id })
      .from(decks)
      .where(eq(decks.title, OUTSIDER_DECK_TITLE))
    if (!outsiderDeck) throw new Error("outsider deck fixture missing")
    const [outsiderCard] = await db
      .insert(cards)
      .values({
        deckId: outsiderDeck.id,
        front: "Rival front",
        back: "Rival back",
      })
      .returning({ id: cards.id })
    outsiderCardId = outsiderCard!.id
  })

  test("a draft course STUDENT is enrolled in is absent from /learn and its study route redirects there", async ({
    page,
  }) => {
    await login(page, STUDENT.email, STUDENT.password)
    await page.goto("/learn")

    // Sanity: the published sibling seeded the same way IS listed, so the
    // absence below is the draft filter, not a broken dashboard.
    await expect(
      page.getByRole("link", { name: legit.title, exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: draft.title, exact: true })
    ).toHaveCount(0)

    await page.goto(`/learn/study/${draft.courseId}`)
    await expect(page).toHaveURL("/learn")
    await expect(page.getByText(`${draft.title} front 1`)).toHaveCount(0)
  })

  test.describe("answerCard rejects a hostile client and writes nothing", () => {
    /**
     * Open the legitimate session, rewrite the first rating's request with
     * `rewrite`, and return what the browser originally sent. Asserts the
     * interception fired exactly once: a test whose rewrite never happened
     * proves nothing.
     */
    async function answerRewritten(
      page: Page,
      rewrite: (args: [string, number]) => unknown[]
    ) {
      let fired = 0
      let original: unknown = null
      await page.route(
        (url) => url.pathname === `/learn/study/${legit.courseId}`,
        async (route) => {
          const request = route.request()
          if (
            request.method() !== "POST" ||
            !request.headers()["next-action"]
          ) {
            return route.continue()
          }
          const args = JSON.parse(request.postData() ?? "null") as [
            string,
            number,
          ]
          original = args
          fired++
          await route.continue({ postData: JSON.stringify(rewrite(args)) })
        }
      )

      await login(page, STUDENT.email, STUDENT.password)
      await page.goto(`/learn/study/${legit.courseId}`)
      await expect(page.getByText("1 of 2")).toBeVisible()
      await reveal(page, `${legit.title} back 1`)
      await page.getByRole("button", { name: /^Good/ }).click()

      // Still advances past the failed answer.
      await expect(page.getByText("2 of 2")).toBeVisible()
      await expect(page.getByText(`${legit.title} front 2`)).toBeVisible()

      expect(fired).toBe(1)
      expect(original).toEqual([legit.cardIds[0], 3])
    }

    const cardCases: {
      name: string
      target: () => string
    }[] = [
      {
        name: "a card in OUTSIDER's rival-school course",
        target: () => outsiderCardId,
      },
      {
        name: "a card in a published rival-school course STUDENT is enrolled in (schoolId leg)",
        target: () => crossSchool.cardId,
      },
      {
        name: "a card in a published default-school course STUDENT is not enrolled in (enrolment leg)",
        target: () => unenrolled.cardId,
      },
      {
        name: "a card in a draft course STUDENT is enrolled in (published leg)",
        target: () => draft.cardId,
      },
    ]

    for (const c of cardCases) {
      test(c.name, async ({ page }) => {
        const target = c.target()
        await answerRewritten(page, ([, grade]) => [target, grade])

        await expect(page.getByText("Card not available.")).toBeVisible()
        const { states, logs } = await reviewRows(studentId, target)
        expect(states).toHaveLength(0)
        expect(logs).toHaveLength(0)
      })
    }

    const gradeCases: { name: string; grade: unknown }[] = [
      { name: 'a grade sent as the string "3"', grade: "3" },
      { name: "a non-integer grade 2.5", grade: 2.5 },
    ]

    for (const c of gradeCases) {
      test(c.name, async ({ page }) => {
        await answerRewritten(page, ([cardId]) => [cardId, c.grade])

        await expect(page.getByText("Unknown rating.")).toBeVisible()
        const { states, logs } = await reviewRows(studentId, legit.cardIds[0]!)
        expect(states).toHaveLength(0)
        expect(logs).toHaveLength(0)
      })
    }
  })
})
