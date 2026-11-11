"use client"

import { usePathname } from "next/navigation"

import { GlobalSearch } from "@/components/layout/global-search"
import { NotificationsMenu } from "@/components/layout/notifications-menu"
import { QuickActionsMenu } from "@/components/layout/quick-actions-menu"
import { UserMenu } from "@/components/layout/user-menu"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { currentBusiness } from "@/config/business"
import { getNavItem } from "@/config/navigation"

export function AppHeader() {
  const pathname = usePathname()
  const title = getNavItem(pathname)?.title ?? "MARCAÍ"

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-xl md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5 self-center" />
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-heading text-sm font-medium">{title}</span>
        <Badge variant="outline" className="hidden text-muted-foreground xl:inline-flex">
          {currentBusiness.name}
        </Badge>
      </div>

      <div className="ml-auto flex flex-1 items-center justify-end gap-1.5 md:gap-2">
        <GlobalSearch />
        <QuickActionsMenu />
        <NotificationsMenu />
        <Separator orientation="vertical" className="mx-1 hidden h-6 self-center md:block" />
        <UserMenu />
      </div>
    </header>
  )
}
