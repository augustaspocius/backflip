"use client"

import type { ComponentProps, ComponentType } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import {
  RiBookOpenLine,
  RiDashboardLine,
  RiFileTextLine,
  RiGroupLine,
  RiLinksLine,
  RiPaletteLine,
  RiPlugLine,
  RiSchoolLine,
  RiStackLine,
} from "@remixicon/react"

import { BrandIcon } from "@/app/_components/brand-icon"
import { can, type Capability } from "@/app/_lib/auth/permissions"
import { NavUser } from "./nav-user"
import type { SessionUser } from "./types"

type NavItem = {
  title: string
  url: string
  icon: ComponentType<{ className?: string }>
  capability: Capability
  /** `/learn` links also need a school membership, and `teacher` needs that
   *  membership to be a teacher's. Cosmetic: the routes guard themselves. */
  school?: "member" | "teacher"
}

/** Nav grouped into design's labeled sections; each item declares its
 *  capability. Platform lists every page a person can open, including the
 *  `/learn` pages that live outside this shell. The Settings group is pinned
 *  to the bottom (above the user).
 *
 *  @spec L2-UI-42 */
const NAV_GROUPS: { label: string; pinBottom?: boolean; items: NavItem[] }[] = [
  {
    label: "Platform",
    items: [
      {
        title: "Overview",
        url: "/rnl-admin",
        icon: RiDashboardLine,
        capability: "dashboard",
      },
      {
        title: "Learn",
        url: "/learn",
        icon: RiBookOpenLine,
        capability: "dashboard",
        school: "member",
      },
      {
        title: "Courses",
        url: "/learn/courses",
        icon: RiStackLine,
        capability: "dashboard",
        school: "teacher",
      },
      {
        title: "School",
        url: "/rnl-admin/school",
        icon: RiSchoolLine,
        capability: "users.edit",
      },
      {
        title: "Members",
        url: "/rnl-admin/users",
        icon: RiGroupLine,
        capability: "users.view",
      },
      {
        title: "Docs",
        url: "/rnl-admin/docs",
        icon: RiFileTextLine,
        capability: "dashboard",
      },
      {
        title: "UI samples",
        url: "/rnl-admin/ui-samples",
        icon: RiPaletteLine,
        capability: "dashboard",
      },
    ],
  },
  {
    label: "Settings",
    pinBottom: true,
    items: [
      {
        title: "Integrations",
        url: "/rnl-admin/settings",
        icon: RiLinksLine,
        capability: "settings",
      },
      {
        title: "MCP capabilities",
        url: "/rnl-admin/settings/mcp-capabilities",
        icon: RiPlugLine,
        capability: "settings",
      },
    ],
  },
]

function isActive(pathname: string, url: string) {
  return url === "/rnl-admin" || url === "/learn"
    ? pathname === url
    : pathname.startsWith(url)
}

function visible(item: NavItem, user: SessionUser) {
  if (!can(user.role, item.capability)) return false
  if (item.school === "member") return user.schoolRole != null
  if (item.school === "teacher") return user.schoolRole === "teacher"
  return true
}

export function AppSidebar({
  user,
  ...props
}: ComponentProps<typeof Sidebar> & { user: SessionUser }) {
  const pathname = usePathname()

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => visible(i, user)),
  })).filter((g) => g.items.length > 0)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/rnl-admin" />}
              className="gap-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
            >
              {/* Same brand tile as the public wordmark (bordered card tile +
                  arc glyph), not an icon-on-primary block. */}
              <div className="flex aspect-square size-7 flex-none items-center justify-center rounded-md border bg-card">
                <BrandIcon size={14} className="text-primary" />
              </div>
              {/* Collapsed rail = icon only: the label block leaves the flow
                  entirely, otherwise `flex-1` keeps its intrinsic width and
                  shoves the tile out of the 32px button (overflow-hidden). */}
              <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-semibold">Repeat and Learn</span>
                <span className="text-xs text-muted-foreground">
                  Admin console
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup
            key={group.label}
            className={group.pinBottom ? "mt-auto" : undefined}
          >
            <SidebarGroupLabel className="text-[11px] tracking-wide uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={isActive(pathname, item.url)}
                      render={<Link href={item.url} />}
                      className="gap-2.5 text-[13px] data-active:font-semibold"
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
