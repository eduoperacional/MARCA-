"use client"

import useSWR from "swr"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Bell, CalendarCheck2, CalendarClock, CalendarX2, Globe, Info, type LucideIcon } from "lucide-react"

import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/operations"
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
import type { NotificationItem } from "@/lib/queries/notifications"
import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
  online_booking: Globe,
  appointment_created: CalendarCheck2,
  appointment_cancelled: CalendarX2,
  appointment_rescheduled: CalendarClock,
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Falha ao carregar notificações")
    return r.json() as Promise<{ notifications: NotificationItem[] }>
  })

export function NotificationsMenu() {
  const { data, mutate } = useSWR("/api/notifications", fetcher, { refreshInterval: 30_000 })
  const notifications = data?.notifications ?? []
  const unread = notifications.filter((n) => !n.read).length

  async function markAsRead(id: string) {
    mutate({ notifications: notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) }, { revalidate: false })
    await markNotificationRead(id)
  }

  async function markAll() {
    mutate({ notifications: notifications.map((n) => ({ ...n, read: true })) }, { revalidate: false })
    await markAllNotificationsRead()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={unread > 0 ? `Notificações, ${unread} não lidas` : "Notificações"}
          />
        }
      >
        <Bell />
        {unread > 0 && (
          <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand-light ring-2 ring-background" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Notificações</span>
            {unread > 0 && (
              <Button variant="link" size="xs" onClick={markAll} className="h-auto px-0">
                Marcar todas como lidas
              </Button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação por enquanto.</p>
          ) : (
            notifications.map((n) => {
              const Icon = ICONS[n.type] ?? Info
              return (
                <DropdownMenuItem key={n.id} onClick={() => !n.read && markAsRead(n.id)} className="items-start gap-3 py-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted",
                      !n.read && "bg-primary/15 text-brand-light"
                    )}
                  >
                    <Icon />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {n.title}
                      {!n.read && <span className="size-1.5 rounded-full bg-brand-light" aria-label="Não lida" />}
                    </span>
                    {n.body && <span className="text-xs leading-relaxed text-muted-foreground">{n.body}</span>}
                    <span className="text-[11px] text-muted-foreground/80">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ptBR })}
                    </span>
                  </span>
                </DropdownMenuItem>
              )
            })
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
