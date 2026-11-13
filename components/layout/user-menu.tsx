"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, Globe, LifeBuoy, LogOut, Settings, UserRound } from "lucide-react"
import { toast } from "sonner"

import { useCan, useWorkspace } from "@/components/layout/workspace-context"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { signOut } from "@/lib/auth-client"
import { getInitials } from "@/lib/format"
import { ROLE_LABELS } from "@/lib/permissions"

export function UserMenu() {
  const { user, role, business } = useWorkspace()
  const can = useCan()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const logout = () =>
    startTransition(async () => {
      const { error } = await signOut()
      if (error) {
        toast.error("Não foi possível sair. Tente novamente.")
        return
      }
      router.replace("/entrar")
      router.refresh()
    })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="h-10 gap-2 px-1.5 md:pr-2.5" aria-label="Abrir menu do perfil" />}
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary/20 text-xs font-semibold text-brand-light">
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden flex-col items-start leading-tight lg:flex">
          <span className="text-sm font-medium">{user.name}</span>
          <span className="text-[11px] text-muted-foreground">{ROLE_LABELS[role]}</span>
        </span>
        <ChevronDown className="hidden text-muted-foreground lg:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{user.name}</span>
            <span className="truncate text-xs font-normal">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/painel/minha-conta" />}>
            <UserRound />
            Minha conta
          </DropdownMenuItem>
          {can("booking_page.manage") && (
            <DropdownMenuItem render={<Link href="/painel/pagina-de-agendamento" />}>
              <Globe />
              Página de agendamento
            </DropdownMenuItem>
          )}
          {can("settings.manage") && (
            <DropdownMenuItem render={<Link href="/painel/configuracoes" />}>
              <Settings />
              Configurações
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<Link href="/painel/ajuda" />}>
            <LifeBuoy />
            Ajuda e suporte
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate text-[11px] font-normal">{business.name}</DropdownMenuLabel>
          <DropdownMenuItem onClick={logout} disabled={pending} variant="destructive">
            <LogOut />
            {pending ? "Saindo..." : "Sair"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
