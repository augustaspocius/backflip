/** Quick-jump destinations — real routes + action shortcuts, rendered by the
 *  header search (the only palette entry point). */
export const JUMP_GROUPS: {
  heading: string
  items: { label: string; href: string; keywords: string }[]
}[] = [
  {
    heading: "Pages",
    items: [
      { label: "Overview", href: "/rnl-admin", keywords: "dashboard home" },
      {
        label: "Members",
        href: "/rnl-admin/users",
        keywords: "users people team",
      },
      {
        label: "School",
        href: "/rnl-admin/school",
        keywords: "learn teachers students invite courses school members",
      },
      {
        label: "Account",
        href: "/rnl-admin/account",
        keywords: "profile email password my account",
      },
      {
        label: "Docs",
        href: "/rnl-admin/docs",
        keywords: "documentation constitution contracts notes spec l1 l2 l3",
      },
      {
        label: "UI samples",
        href: "/rnl-admin/ui-samples",
        keywords: "components gallery reference shadcn design system",
      },
      {
        label: "Integrations",
        href: "/rnl-admin/settings",
        keywords:
          "settings ai providers email resend keys clickup slack webhooks n8n connectors",
      },
      {
        label: "MCP capabilities",
        href: "/rnl-admin/settings/mcp-capabilities",
        keywords: "mcp connector claude tools capabilities oauth",
      },
    ],
  },
  {
    heading: "Actions",
    items: [
      {
        label: "Add member",
        href: "/rnl-admin/users",
        keywords: "new user invite create",
      },
      {
        label: "Change password",
        href: "/rnl-admin/account",
        keywords: "security reset",
      },
    ],
  },
]
