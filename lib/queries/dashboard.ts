import "server-only"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import type { BusinessRow } from "@/lib/db/schema"
import { previousRange, type PeriodSelection } from "@/lib/period"
import { getPeriodSummary, loadNames, type PeriodSummary, type StatRow } from "@/lib/queries/stats"
import { dateFromLocal, eachDay, localParts, timeToMinutes, todayLocal, weekdayOf } from "@/lib/time"
import type {
  AppointmentsPoint,
  DashboardData,
  KpiMetric,
  PerformanceSummary,
  RevenuePoint,
  StatusSlice,
} from "@/lib/types"

const hourKey = (hour: number) => `${String(hour).padStart(2, "0")}h`

function buildKpis(isToday: boolean, current: PeriodSummary, previous: PeriodSummary): KpiMetric[] {
  return [
    { id: "appointments", label: isToday ? "Agendamentos de hoje" : "Agendamentos no período", value: current.scheduled, previous: previous.scheduled, format: "number" },
    { id: "completed", label: "Atendimentos concluídos", value: current.completed, previous: previous.completed, format: "number" },
    { id: "revenue", label: isToday ? "Faturamento de hoje" : "Faturamento do período", value: current.revenue, previous: previous.revenue, format: "currency" },
    { id: "clients", label: "Clientes atendidos", value: current.clients, previous: previous.clients, format: "number" },
    { id: "occupancy", label: "Taxa de ocupação", value: current.occupancy, previous: previous.occupancy, format: "percent" },
    { id: "cancellations", label: "Cancelamentos", value: current.cancelled + current.noShow, previous: previous.cancelled + previous.noShow, format: "number", lowerIsBetter: true },
  ]
}

function revenueBy<K>(rows: StatRow[], key: (row: StatRow) => K) {
  const map = new Map<K, number>()
  for (const row of rows) {
    if (row.status !== "completed") continue
    map.set(key(row), (map.get(key(row)) ?? 0) + row.priceCents / 100)
  }
  return map
}

function buildHourlySeries(business: BusinessRow, date: string, rows: StatRow[], previousRows: StatRow[]) {
  const opening = business.openingHours.find((d) => d.weekday === weekdayOf(date))
  const startHour = opening?.active ? Math.floor(timeToMinutes(opening.start) / 60) : 8
  const endHour = opening?.active ? Math.ceil(timeToMinutes(opening.end) / 60) : 20
  const nowHour = Math.floor(timeToMinutes(localParts(new Date()).time) / 60)
  const current = revenueBy(rows, (r) => r.hour)
  const previous = revenueBy(previousRows, (r) => r.hour)

  const revenueSeries: RevenuePoint[] = []
  const appointmentsSeries: AppointmentsPoint[] = []
  for (let hour = startHour; hour < endHour; hour++) {
    const base = { key: hourKey(hour), label: hourKey(hour), fullLabel: `${hourKey(hour)} – ${hourKey(hour + 1)}` }
    revenueSeries.push({ ...base, current: hour <= nowHour ? (current.get(hour) ?? 0) : null, previous: previous.get(hour) ?? 0 })
    const inHour = rows.filter((r) => r.hour === hour)
    appointmentsSeries.push({
      ...base,
      scheduled: inHour.filter((r) => r.status !== "cancelled" && r.status !== "no_show").length,
      completed: inHour.filter((r) => r.status === "completed").length,
    })
  }
  return { revenueSeries, appointmentsSeries }
}

function buildDailySeries(days: string[], previousDays: string[], rows: StatRow[], previousRows: StatRow[]) {
  const shortFormat = days.length <= 7 ? "EEE dd" : "dd/MM"
  const current = revenueBy(rows, (r) => r.date)
  const previous = revenueBy(previousRows, (r) => r.date)
  const today = todayLocal()

  const revenueSeries: RevenuePoint[] = []
  const appointmentsSeries: AppointmentsPoint[] = []
  days.forEach((day, index) => {
    const date = dateFromLocal(day)
    const base = {
      key: day,
      label: format(date, shortFormat, { locale: ptBR }),
      fullLabel: format(date, "EEEE, d 'de' MMMM", { locale: ptBR }),
    }
    revenueSeries.push({
      ...base,
      current: day > today ? null : (current.get(day) ?? 0),
      previous: previous.get(previousDays[index]) ?? 0,
    })
    const inDay = rows.filter((r) => r.date === day)
    appointmentsSeries.push({
      ...base,
      scheduled: inDay.filter((r) => r.status !== "cancelled" && r.status !== "no_show").length,
      completed: inDay.filter((r) => r.status === "completed").length,
    })
  })
  return { revenueSeries, appointmentsSeries }
}

function buildStatusDistribution(summary: PeriodSummary): StatusSlice[] {
  return (["completed", "confirmed", "in_progress", "pending", "cancelled", "no_show"] as const)
    .map((status) => ({ status, count: summary.byStatus[status] }))
    .filter((slice) => slice.count > 0)
}

function top<K>(map: Map<K, { count: number; revenueCents: number }>) {
  return [...map.entries()].sort((a, b) => b[1].count - a[1].count)[0]
}

function buildSummary(
  current: PeriodSummary,
  previous: PeriodSummary,
  names: Awaited<ReturnType<typeof loadNames>>
): PerformanceSummary {
  const topService = top(current.serviceCounts)
  const topProfessional = top(current.professionalCounts)
  const peak = [...current.hourCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  const totalHours = [...current.hourCounts.values()].reduce((sum, v) => sum + v, 0)
  const professional = topProfessional ? names.professionals.get(topProfessional[0]) : undefined

  return {
    topService: topService
      ? { name: names.services.get(topService[0]) ?? "Serviço", count: topService[1].count, revenue: topService[1].revenueCents / 100 }
      : null,
    topProfessional:
      topProfessional && professional
        ? {
            name: professional.name,
            role: professional.specialties?.split("·")[0]?.trim() || "Profissional",
            count: topProfessional[1].count,
            share: current.completed ? topProfessional[1].count / current.completed : 0,
          }
        : null,
    peakHour: peak
      ? { label: `${hourKey(peak[0])} – ${hourKey(peak[0] + 1)}`, share: totalHours ? peak[1] / totalHours : 0 }
      : null,
    averageTicket: { value: current.averageTicket, previous: previous.averageTicket },
  }
}

export async function getDashboardData(business: BusinessRow, selection: PeriodSelection): Promise<DashboardData> {
  const prev = previousRange(selection)
  const [current, previous, names] = await Promise.all([
    getPeriodSummary(business, selection),
    getPeriodSummary(business, prev),
    loadNames(business.id),
  ])

  const isSingleDay = selection.from === selection.to
  const series = isSingleDay
    ? buildHourlySeries(business, selection.from, current.rows, previous.rows)
    : buildDailySeries(eachDay(selection.from, selection.to), eachDay(prev.from, prev.to), current.rows, previous.rows)

  return {
    range: { from: dateFromLocal(selection.from), to: dateFromLocal(selection.to) },
    granularity: isSingleDay ? "hour" : "day",
    kpis: buildKpis(selection.period === "today", current.summary, previous.summary),
    revenueSeries: series.revenueSeries,
    appointmentsSeries: series.appointmentsSeries,
    statusDistribution: buildStatusDistribution(current.summary),
    summary: buildSummary(current.summary, previous.summary, names),
  }
}
