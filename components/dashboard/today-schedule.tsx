"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, CalendarOff } from "lucide-react"

import { AppointmentActions } from "@/components/shared/appointment-actions"
import { StatusBadge } from "@/components/shared/status-badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { APPOINTMENT_STATUS } from "@/lib/appointment-status"
import { formatCurrency, getInitials } from "@/lib/format"
import type { FormOptions } from "@/lib/queries/options"
import type { Appointment } from "@/lib/types"
import { cn } from "@/lib/utils"

const ALL = "all"

export function TodaySchedule({
  className,
  appointments,
  options,
}: {
  className?: string
  appointments: Appointment[]
  options: FormOptions
}) {
  const [professionalId, setProfessionalId] = useState<string>(ALL)

  const items = useMemo(
    () => (professionalId === ALL ? appointments : appointments.filter((a) => a.professional.id === professionalId)),
    [appointments, professionalId]
  )

  const upcoming = items.filter((a) => a.status === "confirmed" || a.status === "pending").length

  const professionalItems = [
    { value: ALL, label: "Todos os profissionais" },
    ...options.professionals.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })),
  ]

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <CardTitle className="font-heading">Agenda de hoje</CardTitle>
        <CardDescription>
          {items.length} atendimentos · {upcoming} próximos
        </CardDescription>
        <CardAction>
          <Select items={professionalItems} value={professionalId} onValueChange={(value) => setProfessionalId(value ?? ALL)}>
            <SelectTrigger size="sm" className="w-44" aria-label="Filtrar por profissional">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {professionalItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarOff />
              </EmptyMedia>
              <EmptyTitle>Nenhum atendimento hoje</EmptyTitle>
              <EmptyDescription>Não há horários marcados para este filtro.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="h-[360px] pr-3">
            <ol className="flex flex-col gap-1.5">
              {items.map((appointment) => (
                <li
                  key={appointment.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-transparent p-2.5 transition-colors hover:border-border hover:bg-accent/50",
                    appointment.status === "in_progress" && "border-primary/30 bg-primary/10",
                    (appointment.status === "cancelled" || appointment.status === "no_show") && "opacity-60"
                  )}
                >
                  <div className="flex w-12 shrink-0 flex-col text-right tabular-nums">
                    <span className="text-sm font-medium">{appointment.start}</span>
                    <span className="text-[11px] text-muted-foreground">{appointment.end}</span>
                  </div>
                  <span
                    className={cn("h-9 w-0.5 shrink-0 rounded-full", APPOINTMENT_STATUS[appointment.status].dotClass)}
                    aria-hidden="true"
                  />
                  <Avatar className="hidden size-9 sm:flex">
                    <AvatarFallback className="bg-muted text-xs">{getInitials(appointment.clientName)}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{appointment.clientName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {appointment.service.name} · {appointment.professional.name}
                    </span>
                  </div>
                  <span className="hidden text-sm tabular-nums text-muted-foreground md:block">
                    {formatCurrency(appointment.price)}
                  </span>
                  <StatusBadge status={appointment.status} />
                  <AppointmentActions appointment={appointment} options={options} />
                </li>
              ))}
            </ol>
          </ScrollArea>
        )}
        <Button variant="ghost" className="self-start" render={<Link href="/painel/agenda" />} nativeButton={false}>
          Ver agenda completa
          <ArrowRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  )
}
