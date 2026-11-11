"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles } from "lucide-react"

import { MarcaiMark, MarcaiWordmark } from "@/components/brand/marcai-logo"
import { Badge } from "@/components/ui/badge"
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
import { currentBusiness } from "@/config/business"
import { NAV_SECTIONS, isNavItemActive } from "@/config/navigation"

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()

  const handleNavigate = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="gap-3 px-3 pt-4">
        <Link
          href="/"
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

        <div className="flex items-center justify-between gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/60 px-3 py-2.5 group-data-[collapsible=icon]:hidden">
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] text-muted-foreground">Estabelecimento</span>
            <span className="truncate text-sm font-medium text-sidebar-accent-foreground">
              {currentBusiness.name}
            </span>
          </div>
          <Badge className="shrink-0">
            <Sparkles data-icon="inline-start" />
            {currentBusiness.plan.name}
          </Badge>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV_SECTIONS.map((section) => (
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
        <div className="rounded-xl border border-primary/25 bg-primary/10 p-3">
          <p className="text-xs font-medium text-sidebar-accent-foreground">
            Plano {currentBusiness.plan.name}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Renova em {currentBusiness.plan.renewsAt}
          </p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
