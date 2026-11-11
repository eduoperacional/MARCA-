import { NextResponse, type NextRequest } from "next/server"
import { and, eq } from "drizzle-orm"

import { isUuid } from "@/lib/actions/result"
import { getAvailableSlots } from "@/lib/availability"
import { getBusinessBySlug, getCurrentBusiness } from "@/lib/business"
import { db } from "@/lib/db"
import { services } from "@/lib/db/schema"
import { isValidLocalDate } from "@/lib/time"

/**
 * Horários livres para um serviço/profissional em uma data.
 * Com `slug`, responde à página pública (respeita antecedência mínima e agendamento online ativo).
 * Sem `slug`, responde ao painel (permite encaixes no mesmo dia).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const slug = params.get("slug")
  const serviceId = params.get("serviceId")
  const professionalId = params.get("professionalId") || null
  const date = params.get("date")
  const exclude = params.get("exclude") || undefined

  if (!isUuid(serviceId) || !isValidLocalDate(date) || (professionalId && !isUuid(professionalId))) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 })
  }

  const business = slug ? await getBusinessBySlug(slug) : await getCurrentBusiness()
  if (!business || (slug && !business.onlineBookingEnabled)) {
    return NextResponse.json({ error: "Estabelecimento indisponível." }, { status: 404 })
  }

  const [service] = await db
    .select({ id: services.id, durationMin: services.durationMin })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.businessId, business.id)))
  if (!service) return NextResponse.json({ error: "Serviço não encontrado." }, { status: 404 })

  const slots = await getAvailableSlots({
    business,
    serviceId: service.id,
    durationMin: service.durationMin,
    professionalId,
    date,
    excludeAppointmentId: !slug && isUuid(exclude) ? exclude : undefined,
    respectAdvance: Boolean(slug),
  })

  return NextResponse.json({ slots: slots.map((s) => s.time) }, { headers: { "Cache-Control": "no-store" } })
}
