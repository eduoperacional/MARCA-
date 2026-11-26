import type { Metadata } from "next"
import { and, count, eq, gte } from "drizzle-orm"

import { BookingPageAdmin } from "@/components/booking/booking-page-admin"
import { HelpHint } from "@/components/help/help-hint"
import { getAccess, getCurrentBusiness } from "@/lib/business"
import { getSiteUrl } from "@/lib/site-url-server"
import { db } from "@/lib/db"
import { appointments } from "@/lib/db/schema"
import { listAppointments } from "@/lib/queries/appointments"
import { addDays, todayLocal, toInstant } from "@/lib/time"

export const metadata: Metadata = { title: "Página de agendamento" }

export default async function BookingPageAdminPage() {
  const business = await getCurrentBusiness()
  const access = await getAccess()
  const today = todayLocal()
  const since = toInstant(addDays(today, -29))

  const [[stats], recent, siteUrl] = await Promise.all([
    db
      .select({ total: count() })
      .from(appointments)
      .where(and(eq(appointments.businessId, business.id), eq(appointments.source, "online"), gte(appointments.createdAt, since))),
    listAppointments(business.id, { from: addDays(today, -29), to: addDays(today, 60), order: "desc", limit: 300 }),
    getSiteUrl(),
  ])

  const onlineRecent = recent.filter((a) => a.source === "online").slice(0, 8)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <HelpHint topic="page" />
      </div>
      <BookingPageAdmin
      slug={business.slug}
      siteUrl={siteUrl}
      canEdit={access?.role === "owner"}
      businessName={business.displayName || business.name}
      settings={{
        onlineBookingEnabled: business.onlineBookingEnabled,
        minAdvanceMin: business.minAdvanceMin,
        slotIntervalMin: business.slotIntervalMin,
      }}
      onlineLast30={stats?.total ?? 0}
      recent={onlineRecent}
      />
    </div>
  )
}
