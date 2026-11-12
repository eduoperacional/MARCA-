import { Suspense } from "react"

import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
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
        <main className="flex flex-1 flex-col px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
