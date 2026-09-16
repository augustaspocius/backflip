import { expect, test, type Page } from "@playwright/test"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"

import { courses, decks, enrollments, users } from "@workspace/db/schema"

import {
  OUTSIDER,
  OWNER,
  RIVAL_STUDENT,
  STUDENT,
  TEST_DATABASE_URL,
} from "./env"
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
 * `RIVAL_STUDENT` (student, `RIVAL_SCHOOL`) exists only for the hostile-
 * enrolment test below — see that test's own comment for why `OUTSIDER`
 * cannot stand in for it.
 *
 * `enrollStudent`'s candidate `<select>` only ever offers same-school
 * students, so the ordinary UI path can never exercise its own cross-school
 * check. But that `<select>` is a plain uncontrolled element inside a
 * server-action `<form>` — nothing stops a client from posting an id the
 * dropdown never offered. One test below does exactly that (`page.evaluate`
 * to inject an `<option>`), which is the actual threat model `L2-DB-44`
 * hazard 2 exists for.
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
    // A second, independent signal that the enrolment actually landed: the
    // candidate dropdown no longer offers STUDENT specifically. (Not "the
    // dropdown is now empty" — this school may pick up other students from
    // other tests/files over time, and that assertion would then depend on
    // file/test execution order rather than on this action's own effect.)
    await expect(
      page.locator('select[name="userId"] option', { hasText: STUDENT.email })
    ).toHaveCount(0)
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

test("enrollStudent rejects a hostile client posting a foreign student id, and writes nothing", async ({
  page,
}) => {
  // `RIVAL_STUDENT` (student, RIVAL_SCHOOL), not `OUTSIDER` (teacher,
  // RIVAL_SCHOOL): `OUTSIDER`'s id would fail enrollStudent's check on BOTH
  // legs at once (wrong school AND not a student-role member), so a test
  // using it couldn't tell which leg — the school scope or the role — is
  // actually doing the rejecting. `RIVAL_STUDENT` fails only the school leg,
  // which is the one `L2-DB-44` hazard 2 names: "enrollment carries no
  // schoolId, so nothing at the database level stops enrolling a student
  // from one school into another school's course."
  const [rivalStudentRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, RIVAL_STUDENT.email))
  if (!rivalStudentRow) {
    throw new Error(
      "RIVAL_STUDENT fixture missing — check that global-setup.ts seeded " +
        `a school_member row for "${RIVAL_STUDENT.email}" in RIVAL_SCHOOL.`
    )
  }
  const foreignStudentId = rivalStudentRow.id

  await login(page, OWNER.email, OWNER.password)
  await expect(page).toHaveURL("/backflip")

  // A fresh default-school course, isolated from the happy-path test's
  // course — this test only needs *a* course OWNER's school owns, with a
  // Students page to tamper on.
  const title = `Guard Check ${Date.now()}`
  await page.goto("/learn/courses")
  await page.getByLabel("Title").fill(title)
  await page.getByRole("button", { name: "Create course" }).click()
  await page.getByRole("link", { name: title }).click()
  await expect(page).toHaveURL(/\/learn\/courses\/[^/]+$/)
  const courseId = new URL(page.url()).pathname.split("/").pop()!

  await page.goto(`/learn/courses/${courseId}/students`)
  // Let the client bundle finish loading and React hydrate before touching
  // the DOM by hand below — injecting into a not-yet-hydrated tree races
  // React's own hydration pass, which reconciles away anything it didn't
  // render itself (a real hydration-mismatch error, reproduced while writing
  // this test). `networkidle` is a real signal tied to the browser actually
  // finishing loading/executing the route's JS, not a blind sleep.
  await page.waitForLoadState("networkidle")

  // The dropdown never offers a foreign student — this simulates a client
  // that doesn't respect that and posts one anyway, exactly the way a
  // hand-crafted request or a modified DOM would. `EnrollForm`'s `<select
  // name="userId">` is a plain uncontrolled element with no client-side
  // validation, so this reaches the real server action over the real route,
  // with nothing about the request marked as synthetic.
  await page.evaluate((fakeId) => {
    const select = document.querySelector(
      'select[name="userId"]'
    ) as HTMLSelectElement
    const option = document.createElement("option")
    option.value = fakeId
    option.textContent = "Injected (not a real candidate)"
    select.appendChild(option)
  }, foreignStudentId)

  // Confirm the injected option actually survived (rather than letting a
  // hydration race fail obscurely at `selectOption` below).
  const injectedOption = page.locator(
    `select[name="userId"] option[value="${foreignStudentId}"]`
  )
  await expect(injectedOption).toHaveCount(1)

  await page.locator('select[name="userId"]').selectOption(foreignStudentId)
  await page.getByRole("button", { name: "Enrol" }).click()

  // Both signals matter: the message alone could be produced by the wrong
  // code path (e.g. a thrown error caught generically); the row count is
  // what actually proves nothing was written.
  await expect(page.getByText("Not a student in this school.")).toBeVisible()

  const rows = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.courseId, courseId),
        eq(enrollments.userId, foreignStudentId)
      )
    )
  expect(rows).toHaveLength(0)
})
