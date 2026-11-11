import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { AppointmentsChart } from "@/components/dashboard/appointments-chart"
import { KpiGrid } from "@/components/dashboard/kpi-grid"
import { PerformanceSummary } from "@/components/dashboard/performance-summary"
import { PeriodFilter } from "@/components/dashboard/period-filter"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { RevenueChart } from "@/components/dashboard/revenue-chart"
import { StatusChart } from "@/components/dashboard/status-chart"
import { TodaySchedule } from "@/components/dashboard/today-schedule"
import { PageHeader } from "@/components/layout/page-header"
import type { PeriodSelection } from "@/lib/period"
import type { FormOptions } from "@/lib/queries/options"
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
  options,
}: {
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

      <KpiGrid kpis={data.kpis} />

      <QuickActions bookingSlug={bookingSlug} />

      <div className="grid gap-6 lg:grid-cols-3">
        <RevenueChart
          className="lg:col-span-2"
          data={data.revenueSeries}
          granularity={data.granularity}
          rangeLabel={describeRange(data.range)}
        />
        <StatusChart data={data.statusDistribution} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <TodaySchedule className="lg:col-span-2" appointments={todayAppointments} options={options} />
        <PerformanceSummary summary={data.summary} />
      </div>

      <AppointmentsChart
        data={data.appointmentsSeries}
        granularity={data.granularity}
        rangeLabel={describeRange(data.range)}
      />
    </div>
  )
}
