import { expect, test, type Page } from "@playwright/test"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"

import { courses, decks } from "@workspace/db/schema"

import { OUTSIDER, OWNER, STUDENT, TEST_DATABASE_URL } from "./env"
import { OUTSIDER_COURSE_TITLE, OUTSIDER_DECK_TITLE } from "./global-setup"

/**
 * Course authoring end to end (`/learn/courses/**`), against a seeded
 * `backflip_test` database — the first task in this plan able to drive an
 * authenticated session through the whole create-populate-enrol-publish
 * flow, and the first to exercise the cross-school isolation every course
 * action's WHERE clause has claimed since Task 2 but never actually run
 * against a database holding two schools.
 *
 * `OWNER` (teacher, default school) drives the happy path. `OUTSIDER`
 * (teacher, `RIVAL_SCHOOL`) owns a course seeded directly in
 * `global-setup.ts`, never through the UI — the point is that it exists
 * entirely outside OWNER's reach. `STUDENT` (student, default school) is a
 * fourth fixture, kept separate from `TEAMMATE`: plan 1's `learn.spec.ts`
 * deliberately leaves `TEAMMATE` with no school membership at all, as its
 * "signed-in non-member" fixture, and enrolling it here would break that.
 *
 * @spec L2-COURSE-06, L2-COURSE-07, L2-COURSE-08, L2-COURSE-09, L2-DB-44,
 *       L2-SCHOOL-06
 */

async function login(page: Page, email: string, password: string) {
  await page.goto("/backflip/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

/** Standalone connection to the seeded test database, same pattern as
 *  `global-setup.ts` — importing the app's own `@workspace/db` barrel would
 *  pull in its `db` client, which reads `DATABASE_URL` at import time and is
 *  never set in this (separate) Playwright test process. */
const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL })
const db = drizzle(pool)

let outsiderCourseId: string
let outsiderDeckId: string

test.beforeAll(async () => {
  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.title, OUTSIDER_COURSE_TITLE))
  if (!course) {
    throw new Error(
      "Outsider course fixture missing — check that global-setup.ts seeded " +
        `a course titled "${OUTSIDER_COURSE_TITLE}" for OUTSIDER.`
    )
  }
  outsiderCourseId = course.id

  const [deck] = await db
    .select({ id: decks.id })
    .from(decks)
    .where(eq(decks.title, OUTSIDER_DECK_TITLE))
  if (!deck) {
    throw new Error(
      "Outsider deck fixture missing — check that global-setup.ts seeded " +
        `a deck titled "${OUTSIDER_DECK_TITLE}" under the outsider course.`
    )
  }
  outsiderDeckId = deck.id
})

test.afterAll(async () => {
  await pool.end()
})

test("a teacher authors a course, populates it, enrols a student, and publishes it", async ({
  page,
}) => {
  await login(page, OWNER.email, OWNER.password)
  await expect(page).toHaveURL("/backflip")

  const title = `Cellular Biology ${Date.now()}`

  await test.step("create the course from /learn/courses", async () => {
    await page.goto("/learn/courses")

    await page.getByLabel("Title").fill(title)
    await page.getByLabel("Description").fill("Intro to how cells work.")
    await page.getByRole("button", { name: "Create course" }).click()

    await expect(page.getByRole("link", { name: title })).toBeVisible()
  })

  let courseId = ""

  await test.step("open it — detail page shows the title and draft status", async () => {
    await page.getByRole("link", { name: title }).click()

    await expect(page).toHaveURL(/\/learn\/courses\/[^/]+$/)
    courseId = new URL(page.url()).pathname.split("/").pop()!

    await expect(page.getByRole("heading", { name: title })).toBeVisible()
    await expect(page.getByText("draft", { exact: true })).toBeVisible()
  })

  const deckTitle = "Cell Structure"

  await test.step("add a deck — appears with a card count of 0", async () => {
    await page.getByPlaceholder("New deck title").fill(deckTitle)
    await page.getByRole("button", { name: "Add deck" }).click()

    const deckRow = page.locator("li", { hasText: deckTitle })
    await expect(deckRow).toBeVisible()
    await expect(deckRow).toContainText("0 cards")
  })

  await test.step("open the deck, add a card — markdown is RENDERED, not literal", async () => {
    await page.getByRole("link", { name: deckTitle }).click()

    await expect(page).toHaveURL(/\/decks\/[^/]+$/)

    await page
      .getByLabel("Front (markdown)")
      .fill("The powerhouse of the cell is the **mitochondria**.")
    await page.getByLabel("Back (markdown)").fill("Mitochondria")
    await page.getByRole("button", { name: "Add card" }).click()

    const cardItem = page.locator("li", { hasText: "Mitochondria" })
    await expect(cardItem).toBeVisible()
    // The whole point of this assertion: `**mitochondria**` must come through
    // as a real <strong> element, not literal asterisks in the text — this is
    // what would catch the markdown renderer or the typography plugin
    // silently failing.
    await expect(cardItem.locator("strong")).toHaveText("mitochondria")
  })

  await test.step("back on the course page, the deck now shows 1 card", async () => {
    await page.goto(`/learn/courses/${courseId}`)
    const deckRow = page.locator("li", { hasText: deckTitle })
    await expect(deckRow).toContainText("1 card")
  })

  await test.step("enrol STUDENT from the course's Students page", async () => {
    await page.goto(`/learn/courses/${courseId}/students`)

    await page
      .locator('select[name="userId"]')
      .selectOption({ label: `${STUDENT.name} (${STUDENT.email})` })
    await page.getByRole("button", { name: "Enrol" }).click()

    const roster = page.locator("li", { hasText: STUDENT.email })
    await expect(roster).toBeVisible()
    // STUDENT was the only candidate in the school, so the candidate list is
    // now empty — a second signal that the enrolment actually landed.
    await expect(
      page.getByText("Every student in the school is already enrolled.")
    ).toBeVisible()
  })

  await test.step("publish the course — status flips to published", async () => {
    await page.goto(`/learn/courses/${courseId}`)
    await expect(page.getByText("draft", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Publish" }).click()

    await expect(page.getByText("published", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible()
  })
})

test.describe("cross-school isolation", () => {
  test("OWNER (default school) cannot see or reach OUTSIDER's course", async ({
    page,
  }) => {
    await login(page, OWNER.email, OWNER.password)
    await expect(page).toHaveURL("/backflip")

    await test.step("absent from the course list", async () => {
      await page.goto("/learn/courses")
      await expect(
        page.getByRole("link", { name: OUTSIDER_COURSE_TITLE })
      ).toHaveCount(0)
    })

    await test.step("its detail page 404s — not a redirect, not a rendered page", async () => {
      const response = await page.goto(`/learn/courses/${outsiderCourseId}`)

      expect(response?.status()).toBe(404)
      await expect(page).toHaveURL(`/learn/courses/${outsiderCourseId}`)
      await expect(
        page.getByRole("heading", { name: OUTSIDER_COURSE_TITLE })
      ).toHaveCount(0)
    })

    await test.step("its deck page 404s too", async () => {
      const response = await page.goto(
        `/learn/courses/${outsiderCourseId}/decks/${outsiderDeckId}`
      )

      expect(response?.status()).toBe(404)
      await expect(page).toHaveURL(
        `/learn/courses/${outsiderCourseId}/decks/${outsiderDeckId}`
      )
    })
  })

  test("OUTSIDER (rival school) sees and can open their own course — proves the 404s above are real, not a broken route", async ({
    page,
  }) => {
    await login(page, OUTSIDER.email, OUTSIDER.password)
    await expect(page).toHaveURL("/backflip")

    await page.goto("/learn/courses")
    const courseLink = page.getByRole("link", { name: OUTSIDER_COURSE_TITLE })
    await expect(courseLink).toBeVisible()

    const response = await page.goto(`/learn/courses/${outsiderCourseId}`)
    expect(response?.status()).toBe(200)
    await expect(
      page.getByRole("heading", { name: OUTSIDER_COURSE_TITLE })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: OUTSIDER_DECK_TITLE })
    ).toBeVisible()
  })
})
