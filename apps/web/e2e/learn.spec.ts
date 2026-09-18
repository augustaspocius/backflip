import { expect, test, type Page } from "@playwright/test"

import { OWNER, TEAMMATE } from "./env"

/**
 * `/learn` membership gate and the invite round-trip, against a seeded
 * `backflip_test` database. OWNER is seeded with a `school_member` row
 * (role `teacher`) in global setup, so it doubles as the "member" fixture;
 * TEAMMATE has no membership, so it doubles as the "signed-in non-member"
 * fixture.
 *
 * Covers L2-SCHOOL-08 (the /learn gate), L2-SCHOOL-09 (the invite
 * round-trip, including idempotency), and L2-AUTH-47 (the login page's
 * `from`/callback validation lands a /learn sign-in back on /learn).
 */

async function login(page: Page, email: string, password: string) {
  await page.goto("/backflip/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill(password)
  await page.getByRole("button", { name: "Sign in" }).click()
}

test("logged out, /learn redirects to login carrying from", async ({
  page,
}) => {
  await page.goto("/learn")

  await expect(page).toHaveURL("/backflip/login?from=%2Flearn")
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible()
})

test("a member signing in from /learn lands on /learn, not /backflip", async ({
  page,
}) => {
  await page.goto("/learn")
  await expect(page).toHaveURL("/backflip/login?from=%2Flearn")

  await page.getByLabel("Email").fill(OWNER.email)
  await page.getByLabel("Password").fill(OWNER.password)
  await page.getByRole("button", { name: "Sign in" }).click()

  await expect(page).toHaveURL("/learn")
  await expect(page.getByRole("link", { name: "Repeat & Learn" })).toBeVisible()

  // Revisiting the login page while already signed in with a /learn `from`
  // must also honor it, not just the first post-login redirect.
  await page.goto("/backflip/login?from=%2Flearn")
  await expect(page).toHaveURL("/learn")
})

test("signed-in non-member is redirected off /learn", async ({ page }) => {
  await login(page, TEAMMATE.email, TEAMMATE.password)
  await expect(page).toHaveURL("/backflip")

  await page.goto("/learn")

  await expect(page).toHaveURL("/backflip")
})

test("signed-in member sees the /learn shell", async ({ page }) => {
  await login(page, OWNER.email, OWNER.password)
  await expect(page).toHaveURL("/backflip")

  await page.goto("/learn")

  await expect(page).toHaveURL("/learn")
  await expect(page.getByRole("link", { name: "Repeat & Learn" })).toBeVisible()
  await expect(page.getByText(OWNER.email)).toBeVisible()
})

test("a teacher sees the Courses link, unclicked", async ({ page }) => {
  await login(page, OWNER.email, OWNER.password)
  await expect(page).toHaveURL("/backflip")
  await page.goto("/learn")

  // Presence only: the course list behind it is covered by authoring.spec.ts.
  await expect(page.getByRole("link", { name: "Courses" })).toBeVisible()
})

test("a non-owner cannot reach the invite page", async ({ page }) => {
  await login(page, TEAMMATE.email, TEAMMATE.password)
  await expect(page).toHaveURL("/backflip")

  await page.goto("/backflip/school")

  await expect(page).toHaveURL("/backflip")
})

test("owner invites a member, and re-inviting changes their role", async ({
  page,
}) => {
  const email = "invitee@e2e.test"

  await login(page, OWNER.email, OWNER.password)
  await expect(page).toHaveURL("/backflip")
  await page.goto("/backflip/school")

  const row = page.locator("tbody tr", { hasText: email })

  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Role").selectOption("student")
  await page.getByRole("button", { name: "Send invite" }).click()

  await expect(row).toBeVisible()
  await expect(row).toContainText("student")

  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Role").selectOption("teacher")
  await page.getByRole("button", { name: "Send invite" }).click()

  await expect(row).toContainText("teacher")
  await expect(page.locator("tbody tr", { hasText: email })).toHaveCount(1)
})
