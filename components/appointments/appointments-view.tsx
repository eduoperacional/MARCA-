"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarPlus, CalendarSearch, Globe, Search, X } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { AppointmentActions } from "@/components/shared/appointment-actions"
import { AppointmentDialog } from "@/components/shared/appointment-dialog"
import { StatusBadge } from "@/components/shared/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useUrlParams } from "@/hooks/use-url-params"
import { APPOINTMENT_STATUS } from "@/lib/appointment-status"
import { formatCurrency } from "@/lib/format"
import type { FormOptions } from "@/lib/queries/options"
import { dateFromLocal } from "@/lib/time"
import type { Appointment, AppointmentStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

type Tab = "today" | "upcoming" | "past" | "cancelled" | "no_show"
const ALL = "all"

const TAB_ITEMS: { value: Tab; label: string; empty: string }[] = [
  { value: "today", label: "Hoje", empty: "Nenhum atendimento marcado para hoje." },
  { value: "upcoming", label: "Próximos", empty: "Nenhum atendimento futuro encontrado." },
  { value: "past", label: "Histórico", empty: "Nenhum atendimento anterior encontrado." },
  { value: "cancelled", label: "Cancelados", empty: "Nenhum cancelamento encontrado." },
  { value: "no_show", label: "Faltas", empty: "Nenhum cliente faltou no período." },
]

interface Filters {
  q: string
  status: string
  professional: string
  from: string
  to: string
}

export function AppointmentsView({
  appointments,
  options,
  tab,
  filters,
  openCreate,
}: {
  appointments: Appointment[]
  options: FormOptions
  tab: Tab
  filters: Filters
  openCreate: boolean
}) {
  const [createOpen, setCreateOpen] = useState(openCreate)
  const [search, setSearch] = useState(filters.q)
  const { pending, setParams } = useUrlParams()

  const statusItems = [
    { value: ALL, label: "Todos os status" },
    ...(Object.keys(APPOINTMENT_STATUS) as AppointmentStatus[]).map((s) => ({ value: s, label: APPOINTMENT_STATUS[s].label })),
  ]
  const professionalItems = [
    { value: ALL, label: "Todos os profissionais" },
    ...options.professionals.map((p) => ({ value: p.id, label: p.name })),
  ]
  const hasFilters = Boolean(filters.q || filters.status || filters.professional || filters.from || filters.to)

  function handleCreateChange(open: boolean) {
    setCreateOpen(open)
    if (!open && openCreate) setParams({ novo: null }, { replace: true })
  }

  const groups = groupByDate(appointments)

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Agendamentos"
        description="Consulte, filtre e gerencie todos os atendimentos."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <CalendarPlus data-icon="inline-start" />
            Novo agendamento
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setParams({ tab: value === "upcoming" ? null : String(value), from: null, to: null, status: null })
          }
        >
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList>
              {TAB_ITEMS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <form
            className="relative flex-1"
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              setParams({ q: search.trim() || null })
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Buscar por cliente ou telefone"
              placeholder="Buscar por cliente ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => search.trim() !== filters.q && setParams({ q: search.trim() || null })}
              className="pl-8"
            />
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {tab !== "today" && (
              <>
                <Input
                  type="date"
                  aria-label="Data inicial"
                  className="w-38"
                  value={filters.from}
                  onChange={(e) => setParams({ from: e.target.value || null })}
                />
                <span className="text-sm text-muted-foreground">até</span>
                <Input
                  type="date"
                  aria-label="Data final"
                  className="w-38"
                  value={filters.to}
                  onChange={(e) => setParams({ to: e.target.value || null })}
                />
              </>
            )}
            <Select items={professionalItems} value={filters.professional || ALL} onValueChange={(v) => setParams({ professional: v === ALL ? null : v })}>
              <SelectTrigger className="w-48" aria-label="Profissional">
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
            {tab !== "cancelled" && tab !== "no_show" && (
              <Select items={statusItems} value={filters.status || ALL} onValueChange={(v) => setParams({ status: v === ALL ? null : v })}>
                <SelectTrigger className="w-44" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {statusItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("")
                  setParams({ q: null, status: null, professional: null, from: null, to: null })
                }}
              >
                <X data-icon="inline-start" />
                Limpar
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className={cn("py-0 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        <CardContent className="px-0">
          {appointments.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarSearch />
                </EmptyMedia>
                <EmptyTitle>Nenhum agendamento encontrado</EmptyTitle>
                <EmptyDescription>
                  {hasFilters
                    ? "Nenhum resultado para os filtros aplicados. Ajuste ou limpe os filtros."
                    : TAB_ITEMS.find((t) => t.value === tab)?.empty}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Horário</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Serviço</TableHead>
                  <TableHead className="hidden lg:table-cell">Profissional</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 pr-4">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map(([date, items]) => (
                  <DateGroup key={date} date={date} items={items} options={options} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {appointments.length >= 300 && (
        <p className="text-center text-xs text-muted-foreground">Exibindo os 300 primeiros resultados. Refine os filtros para ver mais.</p>
      )}

      <AppointmentDialog open={createOpen} onOpenChange={handleCreateChange} options={options} />
    </div>
  )
}

function DateGroup({ date, items, options }: { date: string; items: Appointment[]; options: FormOptions }) {
  const label = format(dateFromLocal(date), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={7} className="py-1.5 pl-4 text-xs font-medium text-muted-foreground capitalize">
          {label} · {items.length}
        </TableCell>
      </TableRow>
      {items.map((a) => (
        <TableRow key={a.id} className={cn((a.status === "cancelled" || a.status === "no_show") && "opacity-60")}>
          <TableCell className="pl-4 tabular-nums">
            <span className="font-medium">{a.start}</span>
            <span className="text-muted-foreground"> – {a.end}</span>
          </TableCell>
          <TableCell>
            <div className="flex flex-col">
              <span className="flex items-center gap-1.5 font-medium">
                {a.clientName}
                {a.source === "online" && (
                  <Badge variant="secondary" className="gap-1 px-1.5 text-[10px]">
                    <Globe className="size-3" aria-hidden="true" />
                    Online
                  </Badge>
                )}
              </span>
              <span className="text-xs text-muted-foreground md:hidden">{a.service.name}</span>
            </div>
          </TableCell>
          <TableCell className="hidden md:table-cell">{a.service.name}</TableCell>
          <TableCell className="hidden lg:table-cell">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: a.professional.color }} aria-hidden="true" />
              {a.professional.name}
            </span>
          </TableCell>
          <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatCurrency(a.price, true)}</TableCell>
          <TableCell>
            <StatusBadge status={a.status} />
          </TableCell>
          <TableCell className="pr-4 text-right">
            <AppointmentActions appointment={a} options={options} />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

function groupByDate(appointments: Appointment[]) {
  const map = new Map<string, Appointment[]>()
  for (const a of appointments) {
    const list = map.get(a.date) ?? []
    list.push(a)
    map.set(a.date, list)
  }
  return [...map.entries()]
}
