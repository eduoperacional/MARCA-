import type { Metadata } from "next"

import { ProfessionalsView } from "@/components/professionals/professionals-view"
import { getCurrentBusiness } from "@/lib/business"
import { firstParam, resolvePeriod } from "@/lib/period"
import { listProfessionals, listServices } from "@/lib/queries/catalog"
import { loadStatRows } from "@/lib/queries/stats"
import { todayLocal } from "@/lib/time"

export const metadata: Metadata = { title: "Profissionais" }

export default async function ProfessionalsPage({ searchParams }: PageProps<"/profissionais">) {
  const params = await searchParams
  const business = await getCurrentBusiness()
  const month = resolvePeriod({ period: "month" }, todayLocal(), "month")
  const [professionals, services, rows] = await Promise.all([
    listProfessionals(business.id),
    listServices(business.id),
    loadStatRows(business.id, month),
  ])

  const monthStats: Record<string, { count: number; revenue: number }> = {}
  for (const row of rows) {
    if (row.status !== "completed") continue
    const s = (monthStats[row.professionalId] ??= { count: 0, revenue: 0 })
    s.count++
    s.revenue += row.priceCents / 100
  }

  return (
    <ProfessionalsView
      professionals={professionals}
      services={services}
      monthStats={monthStats}
      openCreate={firstParam(params.novo) === "1"}
    />
  )
}
