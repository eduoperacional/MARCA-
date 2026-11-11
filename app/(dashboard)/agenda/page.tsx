import type { Metadata } from "next"

import { AgendaView, type AgendaViewMode } from "@/components/agenda/agenda-view"
import { getCurrentBusiness } from "@/lib/business"
import { firstParam } from "@/lib/period"
import { listAppointments } from "@/lib/queries/appointments"
import { listTimeBlocks } from "@/lib/queries/catalog"
import { getFormOptions } from "@/lib/queries/options"
import { addDays, endOfMonth, isValidLocalDate, startOfMonth, startOfWeek, todayLocal } from "@/lib/time"

export const metadata: Metadata = { title: "Agenda" }

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const params = await searchParams
  const business = await getCurrentBusiness()
  const today = todayLocal()

  const viewParam = firstParam(params.view)
  const view: AgendaViewMode = viewParam === "week" || viewParam === "month" ? viewParam : "day"
  const dateParam = firstParam(params.date)
  const date = isValidLocalDate(dateParam) ? dateParam : today
  const professionalId = firstParam(params.professional) || undefined
  const serviceId = firstParam(params.service) || undefined

  let from = date
  let to = date
  if (view === "week") {
    from = startOfWeek(date)
    to = addDays(from, 6)
  } else if (view === "month") {
    from = startOfWeek(startOfMonth(date))
    to = addDays(startOfWeek(endOfMonth(date)), 6)
  }

  const options = await getFormOptions(business.id)
  const visibleProfessionals = options.professionals.filter(
    (p) => p.active && (!professionalId || p.id === professionalId)
  )

  const [appointments, blocks] = await Promise.all([
    listAppointments(business.id, {
      from,
      to,
      professionalId,
      serviceId,
      statuses: ["pending", "confirmed", "in_progress", "completed", "no_show"],
      order: "asc",
      limit: 2000,
    }),
    listTimeBlocks(business.id, from, to, professionalId ? [professionalId] : undefined),
  ])

  return (
    <AgendaView
      view={view}
      date={date}
      today={today}
      from={from}
      to={to}
      professionalId={professionalId ?? ""}
      serviceId={serviceId ?? ""}
      professionals={visibleProfessionals}
      appointments={appointments}
      blocks={blocks}
      openingHours={business.openingHours}
      slotInterval={business.slotIntervalMin}
      options={options}
    />
  )
}
