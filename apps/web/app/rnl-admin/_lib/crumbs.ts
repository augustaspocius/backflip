/**
 * Route → breadcrumb trail for the /rnl-admin surface.
 *
 * One map, two consumers: `site-header.tsx` renders it as the on-page
 * breadcrumb, and each page turns it into the browser title via `titleFor()`.
 * Keeping both off the same source is the point — a tab reading "Settings ›
 * My account" while the header reads something else is the kind of drift
 * nobody notices until it is everywhere. Composed titles read
 * "R&L · Settings › My account": dot joins the brand, chevrons walk the path.
 *
 * Order matters: the first match wins, so a deeper route has to be listed
 * before the prefix it sits under (`/account/verify-email` before
 * `/account`).
 *
 * @spec L2-UI-52
 */

/**
 * Path separator — U+203A, a single right-pointing angle quote. Narrower than
 * "»", and unlike "/" it does not read as part of a URL, which is the whole
 * reason the tab is being retitled. Reserved for hops **within** the trail.
 */
export const CRUMB_SEPARATOR = " › "

/**
 * Brand separator — U+00B7, a middle dot. Deliberately not the chevron: the
 * brand is not a step in the path, so joining it with one would imply
 * "Repeat and Learn" is an ancestor of "Settings". A dot reads as a label boundary,
 * the chevron as descent.
 */
export const BRAND_SEPARATOR = " · "

/** Brand prefix for the tab. Short on purpose: a browser tab truncates fast,
 *  and the trail's leaf is what the reader actually needs to see. */
export const TITLE_PREFIX = "R&L"

const CRUMBS: { match: (p: string) => boolean; trail: string[] }[] = [
  { match: (p) => p === "/rnl-admin", trail: ["Overview"] },
  { match: (p) => p.startsWith("/rnl-admin/users"), trail: ["Members"] },
  { match: (p) => p.startsWith("/rnl-admin/school"), trail: ["School"] },
  {
    match: (p) => p.startsWith("/rnl-admin/docs"),
    trail: ["Platform", "Docs"],
  },
  {
    match: (p) => p.startsWith("/rnl-admin/ui-samples"),
    trail: ["Platform", "UI samples"],
  },
  {
    match: (p) => p.startsWith("/rnl-admin/account/verify-email"),
    trail: ["Settings", "My account", "Verify email"],
  },
  {
    match: (p) => p.startsWith("/rnl-admin/account"),
    trail: ["Settings", "My account"],
  },
  {
    match: (p) => p.startsWith("/rnl-admin/settings/mcp-capabilities"),
    trail: ["Workspace", "Integrations", "MCP capabilities"],
  },
  {
    match: (p) => p.startsWith("/rnl-admin/settings"),
    trail: ["Workspace", "Integrations"],
  },
  {
    match: (p) => p.startsWith("/rnl-admin/connect"),
    trail: ["Connect an app"],
  },
]

/** The trail for a pathname, falling back to the brand for an unmapped route. */
export function crumbsFor(pathname: string): string[] {
  return CRUMBS.find((c) => c.match(pathname))?.trail ?? ["Repeat and Learn"]
}

/**
 * The trail as a page title — the path part only. The `/rnl-admin` layout adds
 * the brand through Next.js's `title.template`, so a page that sets
 * `titleFor("/rnl-admin/account")` ends up as "B › Settings › My account".
 */
export function titleFor(pathname: string): string {
  return crumbsFor(pathname).join(CRUMB_SEPARATOR)
}
