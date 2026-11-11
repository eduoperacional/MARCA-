"use client"

import { useMemo, useState } from "react"
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
import { currentBusiness, currentUser } from "@/config/business"
import { getDashboardData, getReferenceDate } from "@/lib/data/dashboard"
import type { DateRange, PeriodKey } from "@/lib/types"

function describeRange(range: DateRange) {
  const sameDay = range.from.getTime() === range.to.getTime()
  if (sameDay) return format(range.from, "d 'de' MMMM 'de' yyyy", { locale: ptBR })
  return `${format(range.from, "d MMM", { locale: ptBR })} – ${format(range.to, "d MMM yyyy", { locale: ptBR })}`
}

export function DashboardOverview() {
  const [period, setPeriod] = useState<PeriodKey>("today")
  const [customRange, setCustomRange] = useState<DateRange | undefined>()

  const data = useMemo(
    () => getDashboardData(period, customRange),
    [period, customRange]
  )

  const today = format(getReferenceDate(), "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title={`Olá, ${currentUser.firstName}`}
        description={`Aqui está o resumo da ${currentBusiness.name} · ${today}`}
        actions={
          <PeriodFilter
            period={period}
            customRange={customRange}
            onPeriodChange={setPeriod}
            onCustomRangeChange={setCustomRange}
          />
        }
      />

      <p className="sr-only" aria-live="polite">
        Exibindo dados de {describeRange(data.range)}
      </p>

      <KpiGrid kpis={data.kpis} />

      <QuickActions />

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
        <TodaySchedule className="lg:col-span-2" />
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
