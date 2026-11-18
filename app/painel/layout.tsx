import { Suspense } from "react"

import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { WorkspaceProvider } from "@/components/layout/workspace-context"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import Link from "next/link"

import { BillingBanner } from "@/components/billing/billing-banner"
import { PushBridge } from "@/components/push/push-bridge"
import { getVapidPublicKey, isPushConfigured } from "@/lib/push/service"
import { buttonVariants } from "@/components/ui/button"
import { computeBillingAccess, isBillingEnforced } from "@/lib/billing/access"
import { getCurrentSubscription, getSuspension } from "@/lib/billing/subscriptions"
import { listMemberships, requireAccess } from "@/lib/business"
import { db } from "@/lib/db"

export default function DashboardLayout({ children }: LayoutProps<"/painel">) {
  return (
    <Suspense fallback={<div aria-hidden className="min-h-svh bg-background" />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  )
}

async function DashboardShell({ children }: { children: React.ReactNode }) {
  const access = await requireAccess()
  const memberships = await listMemberships(access.user.id)
  const workspace = {
    user: { name: access.user.name, email: access.user.email },
    business: { id: access.business.id, name: access.business.displayName || access.business.name, slug: access.business.slug },
    role: access.role,
    permissions: [...access.permissions],
    memberships: memberships.map((m) => ({ id: m.business.id, name: m.business.displayName || m.business.name, role: m.member.role })),
  }

  const suspension = await getSuspension(db, access.business.id).catch(() => null)
  if (suspension) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4">
        <div className="flex max-w-md flex-col gap-3 rounded-xl border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold text-balance text-foreground">Acesso temporariamente bloqueado</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            O painel de {workspace.business.name} foi bloqueado pela equipe da MARCAÍ. Entre em contato com o suporte para
            regularizar o acesso.
          </p>
        </div>
      </main>
    )
  }

  const sub = await getCurrentSubscription(db, access.business.id).catch(() => null)
  const billing = computeBillingAccess(access.business, sub)
  if (!billing.allowed && isBillingEnforced()) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold text-balance text-foreground">Assinatura necessária</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {billing.notice}{" "}
            {access.role === "owner"
              ? "Escolha um plano ou pague a cobrança pendente para voltar a usar o painel."
              : "Peça ao proprietário do estabelecimento para regularizar a assinatura."}
          </p>
          <Link href="/assinatura" className={buttonVariants()}>Ver assinatura</Link>
        </div>
      </main>
    )
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
          <BillingBanner billing={billing} isOwner={access.role === "owner"} enforced={isBillingEnforced()} />
          <main className="flex flex-1 flex-col px-4 py-6 md:px-6 lg:px-8 lg:py-8">{children}</main>
        </SidebarInset>
        <PushBridge publicKey={isPushConfigured() ? getVapidPublicKey() : null} />
      </SidebarProvider>
    </WorkspaceProvider>
  )
}
