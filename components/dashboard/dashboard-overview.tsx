import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { KpiGrid } from "@/components/dashboard/kpi-grid"
import { PerformanceSummary } from "@/components/dashboard/performance-summary"
import { PeriodFilter } from "@/components/dashboard/period-filter"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { RevenueChart } from "@/components/dashboard/revenue-chart"
import { TodayPanel } from "@/components/dashboard/today-panel"
import { TodaySchedule } from "@/components/dashboard/today-schedule"
import { PageHeader } from "@/components/layout/page-header"
import type { PeriodSelection } from "@/lib/period"
import type { FormOptions } from "@/lib/queries/options"
import type { TodayOperations } from "@/lib/queries/today"
import { dateFromLocal } from "@/lib/time"
import type { Appointment, DashboardData, DateRange } from "@/lib/types"

function describeRange(range: DateRange) {
  const sameDay = range.from.getTime() === range.to.getTime()
  if (sameDay) return format(range.from, "d 'de' MMMM 'de' yyyy", { locale: ptBR })
  return `${format(range.from, "d MMM", { locale: ptBR })} – ${format(range.to, "d MMM yyyy", { locale: ptBR })}`
}

export function DashboardOverview({
  businessName,
  bookingSlug,
  today,
  selection,
  data,
  todayAppointments,
  todayOperations,
  options,
}: {
  todayOperations: TodayOperations
  businessName: string
  bookingSlug: string
  today: string
  selection: PeriodSelection
  data: DashboardData
  todayAppointments: Appointment[]
  options: FormOptions
}) {
  const todayLabel = format(dateFromLocal(today), "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title="Visão geral"
        description={`Resumo da ${businessName} · ${todayLabel}`}
        actions={<PeriodFilter selection={selection} today={today} />}
      />

      <p className="sr-only" aria-live="polite">
        Exibindo dados de {describeRange(data.range)}
      </p>

      <TodayPanel today={today} appointments={todayAppointments} operations={todayOperations} />

      <div className="grid gap-6 lg:grid-cols-3">
        <TodaySchedule className="lg:col-span-2" appointments={todayAppointments} options={options} />
        <PerformanceSummary summary={data.summary} />
      </div>

      <QuickActions bookingSlug={bookingSlug} />

      <section aria-labelledby="period-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="period-title" className="font-heading text-sm font-medium text-muted-foreground">
            Desempenho no período · {describeRange(data.range)}
          </h2>
          <Link href="/painel/relatorios" className="text-xs font-medium text-brand-light hover:underline">
            Ver relatórios completos
          </Link>
        </div>
        <KpiGrid kpis={data.kpis} />
        <RevenueChart
          data={data.revenueSeries}
          granularity={data.granularity}
          rangeLabel={describeRange(data.range)}
        />
      </section>
    </div>
  )
}
