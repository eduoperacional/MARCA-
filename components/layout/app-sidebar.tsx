"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { MarcaiMark, MarcaiWordmark } from "@/components/brand/marcai-logo"
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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { BusinessSwitcher } from "@/components/layout/business-switcher"
import { useCan, useWorkspace } from "@/components/layout/workspace-context"
import { ROLE_LABELS } from "@/lib/permissions"
import { NAV_SECTIONS, isNavItemActive } from "@/config/navigation"

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const can = useCan()
  const { role, business } = useWorkspace()
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(item.permission)),
  })).filter((section) => section.items.length > 0)

  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="gap-3 px-3 pt-4">
        <Link
          href="/painel"
          onClick={handleNavigate}
          className="flex items-center gap-2.5 rounded-lg px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:px-0"
          aria-label="MARCAÍ — ir para a visão geral"
        >
          <MarcaiMark className="group-data-[collapsible=icon]:size-8" />
          <div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
            <MarcaiWordmark className="text-base" />
            <span className="mt-1 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              Agenda e gestão
            </span>
          </div>
        </Link>

        <BusinessSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.id}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isNavItemActive(item, pathname)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.title}
                        render={
                          <Link
                            href={item.href}
                            onClick={handleNavigate}
                            aria-current={active ? "page" : undefined}
                          />
                        }
                        className="data-active:bg-primary/15 data-active:text-white data-active:[&_svg]:text-brand-light"
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 group-data-[collapsible=icon]:hidden">
        <div className="flex flex-col gap-0.5 rounded-xl border border-primary/25 bg-primary/10 p-3">
          <p className="text-xs font-medium text-sidebar-accent-foreground">{ROLE_LABELS[role]}</p>
          <p className="truncate text-[11px] text-muted-foreground">marcai.app/agendar/{business.slug}</p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
