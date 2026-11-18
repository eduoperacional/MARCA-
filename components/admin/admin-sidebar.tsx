"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  Activity,
  BadgePercent,
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  Package,
  ScrollText,
  UserRound,
  Users,
  Wallet,
} from "lucide-react"

import { MarcaiMark } from "@/components/brand/marcai-logo"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { AdminPermission } from "@/lib/admin/permissions"
import { cn } from "@/lib/utils"

type NavItem = { href: string; label: string; icon: typeof Activity; permission: AdminPermission }

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Visão geral",
    items: [{ href: "/admin", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" }],
  },
  {
    title: "Clientes",
    items: [
      { href: "/admin/estabelecimentos", label: "Estabelecimentos", icon: Building2, permission: "businesses.view" },
      { href: "/admin/usuarios", label: "Usuários", icon: Users, permission: "users.view" },
      { href: "/admin/profissionais", label: "Profissionais", icon: UserRound, permission: "businesses.view" },
    ],
  },
  {
    title: "Comercial",
    items: [
      { href: "/admin/assinaturas", label: "Assinaturas", icon: CreditCard, permission: "subscriptions.view" },
      { href: "/admin/promocao", label: "Promoção", icon: BadgePercent, permission: "subscriptions.view" },
      { href: "/admin/planos", label: "Planos", icon: Package, permission: "plans.manage" },
      { href: "/admin/financeiro", label: "Financeiro", icon: Wallet, permission: "finance.view" },
      { href: "/admin/metricas", label: "Métricas", icon: BarChart3, permission: "finance.view" },
    ],
  },
  {
    title: "Operação",
    items: [
      { href: "/admin/suporte", label: "Suporte e atividade", icon: LifeBuoy, permission: "support.view" },
      { href: "/admin/auditoria", label: "Auditoria", icon: ScrollText, permission: "audit.view" },
    ],
  },
]

type Props = {
  permissions: AdminPermission[]
  user: { name: string; email: string }
  roleLabel: string
}

function NavList({ permissions, onNavigate }: { permissions: AdminPermission[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Menu administrativo" className="flex flex-col gap-6">
      {NAV.map((group) => {
        const items = group.items.filter((item) => permissions.includes(item.permission))
        if (!items.length) return null
        return (
          <div key={group.title} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {group.title}
            </p>
            {items.map((item) => {
              const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    active && "bg-primary/15 text-foreground"
                  )}
                >
                  <item.icon className={cn("size-4", active && "text-brand-light")} aria-hidden />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

function Brand({ roleLabel }: { roleLabel: string }) {
  return (
    <div className="flex items-center gap-3">
      <MarcaiMark className="size-8" />
      <div className="flex flex-col leading-tight">
        <span className="font-heading text-sm font-semibold tracking-[0.08em]">MARCAÍ</span>
        <span className="text-xs text-brand-light">{roleLabel}</span>
      </div>
    </div>
  )
}

function UserFooter({ user }: { user: Props["user"] }) {
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="flex flex-col px-1">
        <span className="truncate text-sm font-medium">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </div>
      <Link href="/painel" className="px-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        Ir para o painel do estabelecimento
      </Link>
    </div>
  )
}

export function AdminSidebar(props: Props) {
  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-8 border-r bg-card/40 p-4 lg:flex">
      <Brand roleLabel={props.roleLabel} />
      <div className="flex-1 overflow-y-auto">
        <NavList permissions={props.permissions} />
      </div>
      <UserFooter user={props.user} />
    </aside>
  )
}

export function AdminMobileNav(props: Props) {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur lg:hidden">
      <Brand roleLabel={props.roleLabel} />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Abrir menu" />}>
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="left" className="flex w-72 flex-col gap-8 p-4">
          <SheetTitle className="sr-only">Menu administrativo</SheetTitle>
          <Brand roleLabel={props.roleLabel} />
          <div className="flex-1 overflow-y-auto">
            <NavList permissions={props.permissions} onNavigate={() => setOpen(false)} />
          </div>
          <UserFooter user={props.user} />
        </SheetContent>
      </Sheet>
    </header>
  )
}
