import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns"
import { ptBR } from "date-fns/locale"

import {
  BUSINESS_HOURS,
  DEMO_NOW,
  DEMO_REFERENCE_DATE,
  HOURLY_WEIGHTS,
  PROFESSIONALS,
  SERVICES,
  getDemoDayStats,
  getDemoTodaySchedule,
  type DayStats,
} from "@/lib/data/demo-data"
import type {
  Appointment,
  AppointmentsPoint,
  DashboardData,
  DateRange,
  KpiMetric,
  PeriodKey,
  PerformanceSummary,
  RevenuePoint,
  StatusSlice,
} from "@/lib/types"

export const MAX_CUSTOM_RANGE_DAYS = 92

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "month", label: "Este mês" },
  { value: "custom", label: "Personalizado" },
]

export function getReferenceDate() {
  return DEMO_REFERENCE_DATE
}

export function getCurrentTime() {
  return DEMO_NOW
}

export function resolvePeriodRange(period: PeriodKey, custom?: DateRange): DateRange {
  const today = getReferenceDate()
  switch (period) {
    case "today":
      return { from: today, to: today }
    case "7d":
      return { from: subDays(today, 6), to: today }
    case "30d":
      return { from: subDays(today, 29), to: today }
    case "month":
      return { from: startOfMonth(today), to: today }
    case "custom": {
      if (!custom) return { from: subDays(today, 6), to: today }
      const to = custom.to > today ? today : startOfDay(custom.to)
      const from = startOfDay(custom.from)
      const length = differenceInCalendarDays(to, from)
      return length > MAX_CUSTOM_RANGE_DAYS
        ? { from: subDays(to, MAX_CUSTOM_RANGE_DAYS), to }
        : { from, to }
    }
  }
}

function previousRange(range: DateRange): DateRange {
  const length = differenceInCalendarDays(range.to, range.from) + 1
  return { from: subDays(range.from, length), to: subDays(range.to, length) }
}

function collectStats(range: DateRange) {
  return eachDayOfInterval({ start: range.from, end: range.to }).map(getDemoDayStats)
}

function sumStats(days: DayStats[]) {
  const totals = {
    scheduled: 0,
    completed: 0,
    cancelled: 0,
    confirmed: 0,
    pending: 0,
    inProgress: 0,
    revenue: 0,
    clients: 0,
    capacity: 0,
    serviceCounts: {} as Record<string, number>,
    professionalCounts: {} as Record<string, number>,
  }
  for (const day of days) {
    totals.scheduled += day.scheduled
    totals.completed += day.completed
    totals.cancelled += day.cancelled
    totals.confirmed += day.confirmed
    totals.pending += day.pending
    totals.inProgress += day.inProgress
    totals.revenue += day.revenue
    totals.clients += day.clients
    totals.capacity += day.capacity
    for (const [id, count] of Object.entries(day.serviceCounts)) {
      totals.serviceCounts[id] = (totals.serviceCounts[id] ?? 0) + count
    }
    for (const [id, count] of Object.entries(day.professionalCounts)) {
      totals.professionalCounts[id] = (totals.professionalCounts[id] ?? 0) + count
    }
  }
  return totals
}

type Totals = ReturnType<typeof sumStats>

function occupancy(totals: Totals) {
  if (totals.capacity === 0) return 0
  return Math.min(1, (totals.scheduled - totals.cancelled) / totals.capacity)
}

function buildKpis(period: PeriodKey, current: Totals, previous: Totals): KpiMetric[] {
  const isToday = period === "today"
  return [
    {
      id: "appointments",
      label: isToday ? "Agendamentos de hoje" : "Agendamentos no período",
      value: current.scheduled,
      previous: previous.scheduled,
      format: "number",
    },
    {
      id: "completed",
      label: "Atendimentos concluídos",
      value: current.completed,
      previous: previous.completed,
      format: "number",
    },
    {
      id: "revenue",
      label: isToday ? "Faturamento de hoje" : "Faturamento do período",
      value: current.revenue,
      previous: previous.revenue,
      format: "currency",
    },
    {
      id: "clients",
      label: "Clientes atendidos",
      value: current.clients,
      previous: previous.clients,
      format: "number",
    },
    {
      id: "occupancy",
      label: "Taxa de ocupação",
      value: occupancy(current),
      previous: occupancy(previous),
      format: "percent",
    },
    {
      id: "cancellations",
      label: "Cancelamentos",
      value: current.cancelled,
      previous: previous.cancelled,
      format: "number",
      lowerIsBetter: true,
    },
  ]
}

function hourKey(hour: number) {
  return `${String(hour).padStart(2, "0")}h`
}

function appointmentHour(appointment: Appointment, field: "start" | "end") {
  return Number(appointment[field].slice(0, 2))
}

function buildHourlySeries(schedule: Appointment[], yesterday: DayStats) {
  const nowHour = getCurrentTime().getHours()

  const revenueSeries: RevenuePoint[] = BUSINESS_HOURS.map((hour) => {
    const realized = schedule
      .filter((a) => a.status === "completed" && appointmentHour(a, "end") === hour)
      .reduce((sum, a) => sum + a.service.price, 0)
    return {
      key: hourKey(hour),
      label: hourKey(hour),
      fullLabel: `${hourKey(hour)} – ${hourKey(hour + 1)}`,
      current: hour <= nowHour ? realized : null,
      previous: Math.round(yesterday.revenue * HOURLY_WEIGHTS[hour]),
    }
  })

  const appointmentsSeries: AppointmentsPoint[] = BUSINESS_HOURS.map((hour) => {
    const inHour = schedule.filter((a) => appointmentHour(a, "start") === hour)
    return {
      key: hourKey(hour),
      label: hourKey(hour),
      fullLabel: `${hourKey(hour)} – ${hourKey(hour + 1)}`,
      scheduled: inHour.filter((a) => a.status !== "cancelled").length,
      completed: inHour.filter((a) => a.status === "completed").length,
    }
  })

  return { revenueSeries, appointmentsSeries }
}

function buildDailySeries(days: DayStats[], previousDays: DayStats[]) {
  const shortFormat = days.length <= 7 ? "EEE dd" : "dd/MM"

  const revenueSeries: RevenuePoint[] = days.map((day, index) => ({
    key: format(day.date, "yyyy-MM-dd"),
    label: format(day.date, shortFormat, { locale: ptBR }),
    fullLabel: format(day.date, "EEEE, d 'de' MMMM", { locale: ptBR }),
    current: day.revenue,
    previous: previousDays[index]?.revenue ?? 0,
  }))

  const appointmentsSeries: AppointmentsPoint[] = days.map((day) => ({
    key: format(day.date, "yyyy-MM-dd"),
    label: format(day.date, shortFormat, { locale: ptBR }),
    fullLabel: format(day.date, "EEEE, d 'de' MMMM", { locale: ptBR }),
    scheduled: day.scheduled - day.cancelled,
    completed: day.completed,
  }))

  return { revenueSeries, appointmentsSeries }
}

function buildStatusDistribution(totals: Totals): StatusSlice[] {
  return [
    { status: "completed" as const, count: totals.completed },
    { status: "confirmed" as const, count: totals.confirmed },
    { status: "in_progress" as const, count: totals.inProgress },
    { status: "pending" as const, count: totals.pending },
    { status: "cancelled" as const, count: totals.cancelled },
  ].filter((slice) => slice.count > 0)
}

function buildSummary(current: Totals, previous: Totals): PerformanceSummary {
  const [topServiceId, topServiceCount] = Object.entries(current.serviceCounts).sort(
    (a, b) => b[1] - a[1]
  )[0] ?? [SERVICES[0].id, 0]
  const topService = SERVICES.find((s) => s.id === topServiceId) ?? SERVICES[0]

  const [topProfessionalId, topProfessionalCount] = Object.entries(
    current.professionalCounts
  ).sort((a, b) => b[1] - a[1])[0] ?? [PROFESSIONALS[0].id, 0]
  const topProfessional =
    PROFESSIONALS.find((p) => p.id === topProfessionalId) ?? PROFESSIONALS[0]

  const [peakHour, peakWeight] = Object.entries(HOURLY_WEIGHTS).sort(
    (a, b) => b[1] - a[1]
  )[0]
  const totalWeight = Object.values(HOURLY_WEIGHTS).reduce((sum, w) => sum + w, 0)

  return {
    topService: {
      name: topService.name,
      count: topServiceCount,
      revenue: topServiceCount * topService.price,
    },
    topProfessional: {
      name: topProfessional.name,
      role: topProfessional.role,
      count: topProfessionalCount,
      share: current.completed ? topProfessionalCount / current.completed : 0,
    },
    peakHour: {
      label: `${hourKey(Number(peakHour))} – ${hourKey(Number(peakHour) + 1)}`,
      share: peakWeight / totalWeight,
    },
    averageTicket: {
      value: current.completed ? current.revenue / current.completed : 0,
      previous: previous.completed ? previous.revenue / previous.completed : 0,
    },
  }
}

/**
 * Ponto único de acesso aos dados do dashboard.
 * Substitua a implementação por uma chamada à API quando o backend estiver disponível.
 */
export function getDashboardData(period: PeriodKey, custom?: DateRange): DashboardData {
  const range = resolvePeriodRange(period, custom)
  const prevRange = previousRange(range)

  const days = collectStats(range)
  const previousDays = collectStats(prevRange)
  const current = sumStats(days)
  const previous = sumStats(previousDays)

  const isSingleToday =
    days.length === 1 &&
    format(range.from, "yyyy-MM-dd") === format(getReferenceDate(), "yyyy-MM-dd")

  const series = isSingleToday
    ? buildHourlySeries(getDemoTodaySchedule(), previousDays[0])
    : buildDailySeries(days, previousDays)

  return {
    range,
    granularity: isSingleToday ? "hour" : "day",
    kpis: buildKpis(period, current, previous),
    revenueSeries: series.revenueSeries,
    appointmentsSeries: series.appointmentsSeries,
    statusDistribution: buildStatusDistribution(current),
    summary: buildSummary(current, previous),
  }
}

export function getTodaySchedule() {
  return getDemoTodaySchedule()
}

export function getProfessionals() {
  return PROFESSIONALS
}
