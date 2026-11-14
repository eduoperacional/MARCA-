import type { Metadata } from "next"
import { Suspense } from "react"

import { AdminMobileNav, AdminSidebar } from "@/components/admin/admin-sidebar"
import { requireAdmin } from "@/lib/admin/auth"
import { ADMIN_ROLE_LABEL, ADMIN_ROLE_PERMISSIONS } from "@/lib/admin/permissions"

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin MARCAÍ" },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<div aria-hidden className="min-h-svh bg-background" />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  )
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const nav = {
    permissions: ADMIN_ROLE_PERMISSIONS[admin.role],
    user: { name: admin.user.name, email: admin.user.email },
    roleLabel: ADMIN_ROLE_LABEL[admin.role],
  }
  return (
    <div className="flex min-h-svh bg-background">
      <AdminSidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileNav {...nav} />
        <main className="flex flex-1 flex-col gap-6 px-4 py-6 md:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  )
}
