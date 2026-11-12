"use client"

import { PeriodFilter } from "@/components/dashboard/period-filter"
import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Info } from "lucide-react"
import { formatCurrency, formatPercent } from "@/lib/format"
import type { PeriodSelection } from "@/lib/period"

export interface ReportData {
  total: number
  completed: number
  cancelled: number
  noShow: number
  revenue: number
  averageTicket: number
  occupancy: number
  newClients: number
  returningClients: number
  services: { name: string; count: number; revenue: number }[]
  professionals: { name: string; count: number; revenue: number }[]
  hours: { hour: number; count: number }[]
}

export function ReportsView({ data, selection, today }: { data: ReportData; selection: PeriodSelection; today: string }) {
  const cancelRate = data.total ? data.cancelled / data.total : 0
  const noShowBase = data.total - data.cancelled
  const noShowRate = noShowBase > 0 ? data.noShow / noShowBase : 0
  const kpis = [
    {
      label: "Agendamentos",
      value: String(data.total),
      hint: `${data.completed} concluídos`,
      info: "Todos os agendamentos com início no período, em qualquer status.",
    },
    {
      label: "Faturamento",
      value: formatCurrency(data.revenue),
      hint: `Ticket médio ${formatCurrency(data.averageTicket)}`,
      info: "Soma dos atendimentos concluídos. Ticket médio = faturamento ÷ atendimentos concluídos.",
    },
    {
      label: "Taxa de ocupação",
      value: formatPercent(data.occupancy * 100),
      hint: "Tempo agendado ÷ disponível",
      info: "Minutos de atendimentos ativos ou concluídos divididos pela jornada da equipe ativa (sem intervalos). Limitada a 100%.",
    },
    {
      label: "Cancelamentos",
      value: String(data.cancelled),
      hint: `${formatPercent(cancelRate * 100)} dos agendamentos`,
      info: "Agendamentos cancelados ÷ total de agendamentos do período.",
    },
    {
      label: "Faltas",
      value: String(data.noShow),
      hint: `${formatPercent(noShowRate * 100)} dos não cancelados`,
      info: "Clientes que não compareceram ÷ agendamentos que não foram cancelados.",
    },
    {
      label: "Clientes novos · recorrentes",
      value: `${data.newClients} · ${data.returningClients}`,
      hint: "Atendidos no período",
      info: "Novo: primeira visita caiu dentro do período. Recorrente: já tinha visita anterior.",
    },
  ]
  const maxService = Math.max(1, ...data.services.map((s) => s.count))
  const maxProfessional = Math.max(1, ...data.professionals.map((p) => p.revenue))
  const maxHour = Math.max(1, ...data.hours.map((h) => h.count))

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader title="Relatórios" description="Indicadores para entender o desempenho do seu negócio." />
      <PeriodFilter selection={selection} today={today} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="gap-1 py-4">
            <CardContent className="flex flex-col gap-1 px-4">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {k.label}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button type="button" className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" />
                    }
                  >
                    <Info className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">Como é calculado: {k.label}</span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">{k.info}</TooltipContent>
                </Tooltip>
              </span>
              <span className="font-heading text-xl font-semibold tabular-nums">{k.value}</span>
              <span className="text-xs text-muted-foreground">{k.hint}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankingCard
          title="Serviços mais vendidos"
          description="Por quantidade de atendimentos concluídos"
          items={data.services.map((s) => ({
            name: s.name,
            value: s.count,
            label: `${s.count} · ${formatCurrency(s.revenue)}`,
            max: maxService,
          }))}
        />
        <RankingCard
          title="Profissionais com mais faturamento"
          description="Atendimentos concluídos no período"
          items={data.professionals.map((p) => ({
            name: p.name,
            value: p.revenue,
            label: `${formatCurrency(p.revenue)} · ${p.count} atend.`,
            max: maxProfessional,
          }))}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading">Horários mais procurados</CardTitle>
          <CardDescription>Atendimentos concluídos por hora de início</CardDescription>
        </CardHeader>
        <CardContent>
          {data.hours.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>
          ) : (
            <ul className="flex h-40 items-end gap-2" aria-label="Atendimentos por horário">
              {data.hours.map((h) => (
                <li key={h.hour} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-xs tabular-nums text-muted-foreground">{h.count}</span>
                  <div
                    className="w-full max-w-10 rounded-t-md bg-primary"
                    style={{ height: `${Math.max(4, (h.count / maxHour) * 100)}%`, opacity: 0.45 + (h.count / maxHour) * 0.55 }}
                    aria-hidden="true"
                  />
                  <span className="text-xs tabular-nums text-muted-foreground">{String(h.hour).padStart(2, "0")}h</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RankingCard({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: { name: string; value: number; label: string; max: number }[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {items.slice(0, 8).map((item, i) => (
              <li key={item.name} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}.</span>
                    {item.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{item.label}</span>
                </div>
                <Progress value={(item.value / item.max) * 100} aria-label={`${item.name}: ${item.label}`} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
