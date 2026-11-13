import { Suspense } from "react"

import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { WorkspaceProvider } from "@/components/layout/workspace-context"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { listMemberships, requireAccess } from "@/lib/business"

export default async function DashboardLayout({ children }: LayoutProps<"/painel">) {
  const access = await requireAccess()
  const memberships = await listMemberships(access.user.id)
  const workspace = {
    user: { name: access.user.name, email: access.user.email },
    business: { id: access.business.id, name: access.business.displayName || access.business.name, slug: access.business.slug },
    role: access.role,
    permissions: [...access.permissions],
    memberships: memberships
      .filter((m) => m.business.onboardingCompletedAt || m.member.role !== "owner")
      .map((m) => ({ id: m.business.id, name: m.business.displayName || m.business.name, role: m.member.role })),
  }

  return (
    <WorkspaceProvider value={workspace}>
      <SidebarProvider>
        <Suspense fallback={null}>
          <AppSidebar />
        </Suspense>
        <SidebarInset className="bg-brand-glow min-w-0">
          <Suspense
            fallback={<div aria-hidden className="sticky top-0 z-20 h-16 shrink-0 border-b bg-background/80" />}
          >
            <AppHeader />
          </Suspense>
          <main className="flex flex-1 flex-col px-4 py-6 md:px-6 lg:px-8 lg:py-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </WorkspaceProvider>
  )
}
