"use client"

import Link from "next/link"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { QUICK_ACTIONS } from "@/config/quick-actions"
import { useShareBookingLink } from "@/hooks/use-share-booking-link"

export function QuickActionsMenu() {
  const shareBookingLink = useShareBookingLink()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button className="gap-1.5" aria-label="Ações rápidas" />}
      >
        <Plus data-icon="inline-start" />
        <span className="hidden sm:inline">Criar</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
          {QUICK_ACTIONS.map((action) =>
            action.href ? (
              <DropdownMenuItem key={action.id} render={<Link href={action.href} />}>
                <action.icon />
                {action.label}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem key={action.id} onClick={shareBookingLink}>
                <action.icon />
                {action.label}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
