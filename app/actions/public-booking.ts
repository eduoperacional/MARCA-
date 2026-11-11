"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { cleanText, fail, isOverlapError, isTime, isUuid } from "@/lib/actions/result"
import { notify } from "@/lib/automations"
import { getAvailableSlots } from "@/lib/availability"
import { getBusinessBySlug } from "@/lib/business"
import { db } from "@/lib/db"
import { appointments, clients, professionals, services } from "@/lib/db/schema"
import { isValidPhone, normalizePhone } from "@/lib/phone"
import { isValidLocalDate, toInstant } from "@/lib/time"

export async function createPublicBooking(input: {
  slug: string
  serviceId: string
  professionalId: string | null
  date: string
  start: string
  name: string
  phone: string
  notes?: string | null
}) {
  const business = await getBusinessBySlug(String(input.slug))
  if (!business || !business.onlineBookingEnabled) return fail("Agendamento online indisponível.")
  if (!isUuid(input.serviceId)) return fail("Selecione um serviço.")
  if (input.professionalId && !isUuid(input.professionalId)) return fail("Profissional inválido.")
  if (!isValidLocalDate(input.date) || !isTime(input.start)) return fail("Selecione data e horário.")
  const name = cleanText(input.name, 120)
  if (!name || name.length < 2) return fail("Informe seu nome.")
  if (!isValidPhone(input.phone)) return fail("Informe um WhatsApp válido com DDD.")

  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, input.serviceId), eq(services.businessId, business.id), eq(services.active, true)))
  if (!service) return fail("Serviço indisponível.")

  const slots = await getAvailableSlots({
    business,
    serviceId: service.id,
    durationMin: service.durationMin,
    professionalId: input.professionalId,
    date: input.date,
  })
  const slot = slots.find((s) => s.time === input.start)
  if (!slot) return fail("Este horário acabou de ser ocupado. Escolha outro, por favor.")

  const phoneNormalized = normalizePhone(input.phone)
  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.businessId, business.id), eq(clients.phoneNormalized, phoneNormalized)))
  const clientId =
    existing?.id ??
    (
      await db
        .insert(clients)
        .values({ businessId: business.id, name, phone: input.phone.trim(), phoneNormalized })
        .returning({ id: clients.id })
    )[0].id

  const startsAt = toInstant(input.date, input.start)
  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000)

  for (const professionalId of slot.professionalIds) {
    try {
      const [created] = await db
        .insert(appointments)
        .values({
          businessId: business.id,
          clientId,
          serviceId: service.id,
          professionalId,
          startsAt,
          endsAt,
          priceCents: service.priceCents,
          status: "pending",
          source: "online",
          notes: cleanText(input.notes, 500),
        })
        .returning({ id: appointments.id })

      const [professional] = await db
        .select({ name: professionals.name })
        .from(professionals)
        .where(eq(professionals.id, professionalId))

      await notify({
        businessId: business.id,
        type: "online_booking",
        title: "Novo agendamento online",
        body: `${name} agendou ${service.name} com ${professional?.name ?? "profissional"} em ${input.date.split("-").reverse().join("/")} às ${input.start}`,
        appointmentId: created.id,
      })
      revalidatePath("/", "layout")
      return {
        ok: true as const,
        data: { professionalName: professional?.name ?? "", serviceName: service.name, date: input.date, start: input.start },
      }
    } catch (error) {
      if (!isOverlapError(error)) throw error
    }
  }
  return fail("Este horário acabou de ser ocupado. Escolha outro, por favor.")
}
