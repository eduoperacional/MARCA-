"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { toast } from "sonner"

import { switchBusiness } from "@/app/actions/session"
import { useWorkspace } from "@/components/layout/workspace-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ROLE_LABELS } from "@/lib/permissions"

export function BusinessSwitcher() {
  const { business, memberships } = useWorkspace()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const select = (id: string) => {
    if (id === business.id) return
    startTransition(async () => {
      const result = await switchBusiness(id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.push("/painel")
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/60 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-60 group-data-[collapsible=icon]:hidden"
        aria-label="Trocar de estabelecimento"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] text-muted-foreground">Estabelecimento</span>
          <span className="truncate text-sm font-medium text-sidebar-accent-foreground">{business.name}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[11px] font-normal">Seus estabelecimentos</DropdownMenuLabel>
          {memberships.map((m) => (
            <DropdownMenuItem key={m.id} onClick={() => select(m.id)}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{m.name}</span>
                <span className="text-[11px] text-muted-foreground">{ROLE_LABELS[m.role]}</span>
              </span>
              {m.id === business.id && <Check className="text-brand-light" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/onboarding?novo=1" />}>
          <Plus />
          Novo estabelecimento
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
