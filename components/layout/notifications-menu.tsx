"use client"

import { useState } from "react"
import { Bell, CalendarCheck2, CalendarX2, Star, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

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

interface NotificationItem {
  id: string
  title: string
  description: string
  time: string
  icon: LucideIcon
  read: boolean
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n1",
    title: "Novo agendamento online",
    description: "Gabriel Santos agendou Corte + barba às 17:30.",
    time: "há 8 min",
    icon: CalendarCheck2,
    read: false,
  },
  {
    id: "n2",
    title: "Agendamento cancelado",
    description: "Thiago Ribeiro cancelou o horário das 16:00.",
    time: "há 32 min",
    icon: CalendarX2,
    read: false,
  },
  {
    id: "n3",
    title: "Nova avaliação",
    description: "Felipe Rocha avaliou o atendimento com 5 estrelas.",
    time: "há 2 h",
    icon: Star,
    read: true,
  },
]

export function NotificationsMenu() {
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS)
  const unread = notifications.filter((n) => !n.read).length

  const markAsRead = (id: string) =>
    setNotifications((items) =>
      items.map((n) => (n.id === id ? { ...n, read: true } : n))
    )

  const markAllAsRead = () =>
    setNotifications((items) => items.map((n) => ({ ...n, read: true })))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={
              unread > 0
                ? `Notificações, ${unread} não lidas`
                : "Notificações"
            }
          />
        }
      >
        <Bell />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand-light ring-2 ring-background"
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Notificações</span>
            {unread > 0 && (
              <Button
                variant="link"
                size="xs"
                onClick={markAllAsRead}
                className="h-auto px-0"
              >
                Marcar todas como lidas
              </Button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              onClick={() => markAsRead(notification.id)}
              className="items-start gap-3 py-2.5"
            >
              <span
                className={cn(
                  "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted",
                  !notification.read && "bg-primary/15 text-brand-light"
                )}
              >
                <notification.icon />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {notification.title}
                  {!notification.read && (
                    <span className="size-1.5 rounded-full bg-brand-light" aria-label="Não lida" />
                  )}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {notification.description}
                </span>
                <span className="text-[11px] text-muted-foreground/80">
                  {notification.time}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
