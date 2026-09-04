import { redirect } from "next/navigation"

import { BrandIcon } from "@/app/_components/brand-icon"
import { auth } from "@/app/_lib/auth"
import {
  isCredentialsEnabled,
  isGoogleConfigured,
} from "@/app/_lib/auth/config"
import { LoginForm } from "./_components/login-form"
import type { Metadata } from "next"

export const metadata: Metadata = { title: "Sign in" }

/**
 * Scopes this login page authenticates into. `/backflip/*` is the operator
 * console, `/learn/*` the school product — both gate on a session first and
 * redirect an unauthenticated visitor here, so they share one login page.
 * Named once so the `from` allow-list and its guard below can't drift apart.
 */
const LOGIN_SCOPES = ["/backflip", "/learn"] as const

/**
 * Validates a post-login target: only `LOGIN_SCOPES` prefixes are followed.
 * A value starting `//` or `/\` (browser-normalized to protocol-relative) is
 * always rejected, even one that would otherwise match a scope, to close the
 * open-redirect hole. Anything else falls back to the console root.
 */
function resolveCallbackUrl(from: string | undefined): string {
  if (!from || from.startsWith("//") || from.startsWith("/\\")) {
    return "/backflip"
  }
  return LOGIN_SCOPES.some((scope) => from.startsWith(scope))
    ? from
    : "/backflip"
}

/**
 * /backflip/login — public login (credentials + Google) shared by the
 * `/backflip` console and the `/learn` product.
 * `from` (set by the proxy on redirect) becomes the post-login target,
 * constrained to in-scope paths to avoid open redirects.
 *
 * @spec L2-AUTH-04, L2-AUTH-47
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams
  const callbackUrl = resolveCallbackUrl(from)

  // Already signed in (validity-aware — a revoked token reads as no session)
  // → skip the login page. Kept here (node) since the edge can't check it.
  const session = await auth()
  if (session?.user) redirect(callbackUrl)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-[19.2rem] flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md border bg-card">
            <BrandIcon size={12} className="text-primary" />
          </div>
          Backflip
        </div>
        <LoginForm
          callbackUrl={callbackUrl}
          credentialsEnabled={isCredentialsEnabled()}
          googleEnabled={isGoogleConfigured()}
        />
      </div>
    </div>
  )
}
