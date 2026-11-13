import type { Metadata } from "next"

import { ReportsView, type ReportData } from "@/components/reports/reports-view"
import { getCurrentBusiness } from "@/lib/business"
import { firstParam, resolvePeriod } from "@/lib/period"
import { countNewAndReturningClients, getPeriodSummary, loadNames } from "@/lib/queries/stats"
import { todayLocal } from "@/lib/time"

export const metadata: Metadata = { title: "Relatórios" }

export default async function ReportsPage({ searchParams }: PageProps<"/painel/relatorios">) {
  const params = await searchParams
  const business = await getCurrentBusiness()
  const today = todayLocal()
  const selection = resolvePeriod(
    { period: firstParam(params.period), from: firstParam(params.from), to: firstParam(params.to) },
    today,
    "30d"
  )

  const [{ rows, summary }, names] = await Promise.all([getPeriodSummary(business, selection), loadNames(business.id)])
  const servedClientIds = [...new Set(rows.filter((r) => r.status !== "cancelled" && r.status !== "no_show").map((r) => r.clientId))]
  const { newClients, returningClients } = await countNewAndReturningClients(business.id, selection, servedClientIds)

  const data: ReportData = {
    total: summary.total,
    completed: summary.completed,
    cancelled: summary.cancelled,
    noShow: summary.noShow,
    revenue: summary.revenue,
    averageTicket: summary.averageTicket,
    occupancy: summary.occupancy,
    newClients,
    returningClients,
    services: [...summary.serviceCounts.entries()]
      .map(([id, s]) => ({ name: names.services.get(id) ?? "Serviço removido", count: s.count, revenue: s.revenueCents / 100 }))
      .sort((a, b) => b.count - a.count),
    professionals: [...summary.professionalCounts.entries()]
      .map(([id, p]) => ({ name: names.professionals.get(id)?.name ?? "—", count: p.count, revenue: p.revenueCents / 100 }))
      .sort((a, b) => b.revenue - a.revenue),
    hours: [...summary.hourCounts.entries()].map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour - b.hour),
  }

  return <ReportsView data={data} selection={selection} today={today} />
}
