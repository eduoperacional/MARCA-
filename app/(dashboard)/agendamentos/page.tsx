import type { Metadata } from "next"

import { AppointmentsView } from "@/components/appointments/appointments-view"
import { getCurrentBusiness } from "@/lib/business"
import { firstParam } from "@/lib/period"
import { listAppointments, type AppointmentFilters } from "@/lib/queries/appointments"
import { getFormOptions } from "@/lib/queries/options"
import { addDays, isValidLocalDate, todayLocal } from "@/lib/time"
import type { AppointmentStatus } from "@/lib/types"

export const metadata: Metadata = { title: "Agendamentos" }

const STATUSES: AppointmentStatus[] = ["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"]
export type AppointmentsTab = "upcoming" | "past" | "all"

export default async function AppointmentsPage({ searchParams }: PageProps<"/agendamentos">) {
  const params = await searchParams
  const business = await getCurrentBusiness()
  const today = todayLocal()

  const tabParam = firstParam(params.tab)
  const tab: AppointmentsTab = tabParam === "past" || tabParam === "all" ? tabParam : "upcoming"
  const statusParam = firstParam(params.status) as AppointmentStatus | undefined
  const status = statusParam && STATUSES.includes(statusParam) ? statusParam : undefined
  const query = firstParam(params.q)?.trim().slice(0, 80) || undefined
  const professionalId = firstParam(params.professional) || undefined
  const fromParam = firstParam(params.from)
  const toParam = firstParam(params.to)

  const filters: AppointmentFilters = {
    query,
    professionalId,
    statuses: status ? [status] : undefined,
    limit: 300,
  }
  if (isValidLocalDate(fromParam)) filters.from = fromParam
  if (isValidLocalDate(toParam)) filters.to = toParam
  if (!filters.from && !filters.to) {
    if (tab === "upcoming") filters.from = today
    if (tab === "past") filters.to = addDays(today, -1)
  }
  filters.order = tab === "upcoming" ? "asc" : "desc"

  const [appointments, options] = await Promise.all([listAppointments(business.id, filters), getFormOptions(business.id)])

  return (
    <AppointmentsView
      appointments={appointments}
      options={options}
      tab={tab}
      filters={{ q: query ?? "", status: status ?? "", professional: professionalId ?? "", from: fromParam ?? "", to: toParam ?? "" }}
      openCreate={firstParam(params.novo) === "1"}
    />
  )
}
