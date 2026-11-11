"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarPlus, ChevronLeft, ChevronRight, Lock, Settings2 } from "lucide-react"

import { AgendaGrid } from "@/components/agenda/agenda-grid"
import { BlockDialog } from "@/components/agenda/block-dialog"
import { MonthGrid } from "@/components/agenda/month-grid"
import { PageHeader } from "@/components/layout/page-header"
import { AppointmentDialog, type AppointmentDefaults } from "@/components/shared/appointment-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useUrlParams } from "@/hooks/use-url-params"
import type { ProfessionalItem, TimeBlockItem } from "@/lib/queries/catalog"
import type { FormOptions } from "@/lib/queries/options"
import { addDays, dateFromLocal, eachDay } from "@/lib/time"
import type { Appointment, DaySchedule } from "@/lib/types"
import { cn } from "@/lib/utils"

export type AgendaViewMode = "day" | "week" | "month"
const ALL = "all"

export interface AgendaViewProps {
  view: AgendaViewMode
  date: string
  today: string
  from: string
  to: string
  professionalId: string
  serviceId: string
  professionals: ProfessionalItem[]
  appointments: Appointment[]
  blocks: TimeBlockItem[]
  openingHours: DaySchedule[]
  slotInterval: number
  options: FormOptions
}

export function AgendaView(props: AgendaViewProps) {
  const { view, date, today, from, to, professionalId, serviceId, professionals, appointments, blocks, options } = props
  const { pending, setParams } = useUrlParams()
  const [createDefaults, setCreateDefaults] = useState<AppointmentDefaults | null>(null)
  const [blockOpen, setBlockOpen] = useState(false)

  function shift(direction: -1 | 1) {
    const d = dateFromLocal(date)
    if (view === "month") {
      const next = new Date(d.getFullYear(), d.getMonth() + direction, 1, 12)
      return setParams({ date: format(next, "yyyy-MM-dd") })
    }
    setParams({ date: addDays(date, direction * (view === "week" ? 7 : 1)) })
  }

  const title =
    view === "day"
      ? format(dateFromLocal(date), "EEEE, d 'de' MMMM", { locale: ptBR })
      : view === "week"
        ? `${format(dateFromLocal(from), "d MMM", { locale: ptBR })} – ${format(dateFromLocal(to), "d MMM yyyy", { locale: ptBR })}`
        : format(dateFromLocal(date), "MMMM 'de' yyyy", { locale: ptBR })

  const professionalItems = [
    { value: ALL, label: "Toda a equipe" },
    ...options.professionals.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })),
  ]
  const serviceItems = [
    { value: ALL, label: "Todos os serviços" },
    ...options.services.map((s) => ({ value: s.id, label: s.name })),
  ]

  const activeCount = appointments.filter((a) => a.status !== "no_show").length

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
      <PageHeader
        title="Agenda"
        description="Visualize e organize os horários da equipe."
        actions={
          <>
            <Button variant="ghost" render={<Link href="/configuracoes" />} nativeButton={false}>
              <Settings2 data-icon="inline-start" />
              Funcionamento
            </Button>
            <Button variant="outline" onClick={() => setBlockOpen(true)}>
              <Lock data-icon="inline-start" />
              Bloquear horário
            </Button>
            <Button onClick={() => setCreateDefaults({ date: view === "day" ? date : today, professionalId: professionalId || undefined })}>
              <CalendarPlus data-icon="inline-start" />
              Novo agendamento
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Período anterior">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Próximo período">
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setParams({ date: null })} disabled={date === today}>
            Hoje
          </Button>
          <h2 className="font-heading text-lg font-semibold capitalize" aria-live="polite">
            {title}
          </h2>
          <span className="hidden text-sm text-muted-foreground sm:inline">· {activeCount} atendimentos</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select items={professionalItems} value={professionalId || ALL} onValueChange={(v) => setParams({ professional: v === ALL ? null : v })}>
            <SelectTrigger className="w-44" aria-label="Profissional">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {professionalItems.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select items={serviceItems} value={serviceId || ALL} onValueChange={(v) => setParams({ service: v === ALL ? null : v })}>
            <SelectTrigger className="w-44" aria-label="Serviço">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {serviceItems.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Tabs value={view} onValueChange={(v) => setParams({ view: v === "day" ? null : String(v) })}>
            <TabsList>
              <TabsTrigger value="day">Dia</TabsTrigger>
              <TabsTrigger value="week">Semana</TabsTrigger>
              <TabsTrigger value="month">Mês</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <Card className={cn("gap-0 overflow-hidden py-0 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        {view === "month" ? (
          <MonthGrid
            days={eachDay(from, to)}
            month={date.slice(0, 7)}
            today={today}
            appointments={appointments}
            onSelectDay={(d) => setParams({ view: null, date: d })}
          />
        ) : professionals.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Nenhum profissional ativo. Cadastre a equipe em <Link href="/profissionais" className="underline">Profissionais</Link>.
          </p>
        ) : (
          <AgendaGrid
            columns={
              view === "day"
                ? professionals.map((p) => ({ key: p.id, date, professional: p, label: p.name }))
                : eachDay(from, to).map((d) => ({
                    key: d,
                    date: d,
                    professional: professionals.length === 1 ? professionals[0] : null,
                    label: format(dateFromLocal(d), "EEE d", { locale: ptBR }),
                  }))
            }
            professionals={professionals}
            today={today}
            appointments={appointments}
            blocks={blocks}
            openingHours={props.openingHours}
            slotInterval={props.slotInterval}
            options={options}
            onCreate={(defaults) => setCreateDefaults(defaults)}
          />
        )}
      </Card>

      <AppointmentDialog
        open={createDefaults !== null}
        onOpenChange={(open) => !open && setCreateDefaults(null)}
        options={options}
        defaults={createDefaults ?? undefined}
      />
      <BlockDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        professionals={options.professionals.filter((p) => p.active)}
        defaultDate={view === "day" ? date : today}
        defaultProfessionalId={professionalId}
      />
    </div>
  )
}
