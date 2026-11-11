"use client"

import Link from "next/link"
import { ChevronDown, Globe, LifeBuoy, Settings, UserRound } from "lucide-react"

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
import { currentBusiness, currentUser } from "@/config/business"
import { getInitials } from "@/lib/format"

export function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-10 gap-2 px-1.5 md:pr-2.5"
            aria-label="Abrir menu do perfil"
          />
        }
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary/20 text-xs font-semibold text-brand-light">
            {getInitials(currentUser.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden flex-col items-start leading-tight lg:flex">
          <span className="text-sm font-medium">{currentUser.name}</span>
          <span className="text-[11px] text-muted-foreground">
            {currentUser.role}
          </span>
        </span>
        <ChevronDown className="hidden text-muted-foreground lg:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {currentUser.name}
            </span>
            <span className="truncate text-xs font-normal">
              {currentUser.email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/configuracoes" />}>
            <UserRound />
            Meu perfil
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/pagina-de-agendamento" />}>
            <Globe />
            Página de agendamento
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/configuracoes" />}>
            <Settings />
            Configurações
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/ajuda" />}>
            <LifeBuoy />
            Ajuda e suporte
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[11px] font-normal">
            {currentBusiness.name} · Plano {currentBusiness.plan.name}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
