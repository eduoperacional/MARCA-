import type { Metadata } from "next"
import { connection } from "next/server"

import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { getCurrentBusiness } from "@/lib/business"
import { firstParam, resolvePeriod } from "@/lib/period"
import { listAppointments } from "@/lib/queries/appointments"
import { getDashboardData } from "@/lib/queries/dashboard"
import { getFormOptions } from "@/lib/queries/options"
import { getTodayOperations } from "@/lib/queries/today"
import { todayLocal } from "@/lib/time"

export const metadata: Metadata = {
  title: "Visão geral",
}

export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams
  const business = await getCurrentBusiness()
  await connection()
  const today = todayLocal()
  const selection = resolvePeriod(
    { period: firstParam(params.period), from: firstParam(params.from), to: firstParam(params.to) },
    today
  )

  const [data, todayAppointments, options, todayOperations] = await Promise.all([
    getDashboardData(business, selection),
    listAppointments(business.id, { from: today, to: today, order: "asc" }),
    getFormOptions(business.id),
    getTodayOperations(business, today),
  ])

  return (
    <DashboardOverview
      businessName={business.name}
      bookingSlug={business.slug}
      today={today}
      selection={selection}
      data={data}
      todayAppointments={todayAppointments}
      todayOperations={todayOperations}
      options={options}
    />
  )
}
