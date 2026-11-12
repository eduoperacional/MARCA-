import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { isDemoMode } from "@/lib/db"

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-brand-glow min-w-0">
        <AppHeader />
        {isDemoMode && (
          <p role="status" className="border-b bg-primary/10 px-4 py-2 text-center text-xs text-muted-foreground md:px-6">
            Modo demonstração: dados fictícios em um banco local temporário. Conecte um banco Postgres
            (DATABASE_URL) para salvar dados reais.
          </p>
        )}
        <main className="flex flex-1 flex-col px-4 py-6 md:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
