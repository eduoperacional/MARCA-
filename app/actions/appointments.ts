"use server"

import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"

import { cleanText, fail, isOverlapError, isTime, isUuid, toCents } from "@/lib/actions/result"
import { STATUS_TRANSITIONS, PAYMENT_METHODS } from "@/lib/appointment-status"
import { notify } from "@/lib/automations"
import { validateSlot } from "@/lib/availability"
import { getCurrentBusiness } from "@/lib/business"
import { db } from "@/lib/db"
import { appointments, clients, payments, professionalServices, professionals, services } from "@/lib/db/schema"
import { isValidPhone, normalizePhone } from "@/lib/phone"
import { isValidLocalDate, localParts, toInstant } from "@/lib/time"
import type { AppointmentStatus, PaymentMethod } from "@/lib/types"

export interface AppointmentInput {
  id?: string
  clientId?: string | null
  newClient?: { name: string; phone: string } | null
  serviceId: string
  professionalId: string
  date: string
  start: string
  notes?: string | null
  price?: number | null
  paymentMethod?: PaymentMethod | null
}

const PAYMENT_VALUES = new Set(PAYMENT_METHODS.map((m) => m.value))

async function resolveClientId(businessId: string, input: AppointmentInput) {
  if (input.clientId) {
    if (!isUuid(input.clientId)) return fail("Cliente inválido.")
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.businessId, businessId)))
    return client ? { ok: true as const, id: client.id } : fail("Cliente não encontrado.")
  }
  const name = cleanText(input.newClient?.name, 120)
  const phone = input.newClient?.phone ?? ""
  if (!name) return fail("Informe o nome do cliente.")
  if (!isValidPhone(phone)) return fail("Informe um telefone válido com DDD.")
  const normalized = normalizePhone(phone)
  const [existing] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.businessId, businessId), eq(clients.phoneNormalized, normalized)))
  if (existing) return { ok: true as const, id: existing.id }
  const [created] = await db
    .insert(clients)
    .values({ businessId, name, phone: phone.trim(), phoneNormalized: normalized })
    .returning({ id: clients.id })
  return { ok: true as const, id: created.id }
}

export async function saveAppointment(input: AppointmentInput) {
  const business = await getCurrentBusiness()

  if (input.id && !isUuid(input.id)) return fail("Agendamento inválido.")
  if (!isUuid(input.serviceId)) return fail("Selecione um serviço.")
  if (!isUuid(input.professionalId)) return fail("Selecione um profissional.")
  if (!isValidLocalDate(input.date)) return fail("Selecione uma data válida.")
  if (!isTime(input.start)) return fail("Selecione um horário válido.")
  if (input.paymentMethod && !PAYMENT_VALUES.has(input.paymentMethod)) return fail("Forma de pagamento inválida.")

  const [[service], [professional]] = await Promise.all([
    db.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.businessId, business.id))),
    db.select().from(professionals).where(and(eq(professionals.id, input.professionalId), eq(professionals.businessId, business.id))),
  ])
  if (!service) return fail("Serviço não encontrado.")
  if (!professional) return fail("Profissional não encontrado.")

  const [enabled] = await db
    .select()
    .from(professionalServices)
    .where(and(eq(professionalServices.professionalId, professional.id), eq(professionalServices.serviceId, service.id)))
  if (!enabled) return fail(`${professional.name} não está habilitado(a) para ${service.name}.`)

  let existing: typeof appointments.$inferSelect | undefined
  if (input.id) {
    ;[existing] = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.id, input.id), eq(appointments.businessId, business.id)))
    if (!existing) return fail("Agendamento não encontrado.")
    if (existing.status === "completed" || existing.status === "cancelled" || existing.status === "no_show") {
      return fail("Agendamentos finalizados ou cancelados não podem ser editados.")
    }
  }

  const slotError = await validateSlot({
    business,
    professional,
    date: input.date,
    start: input.start,
    durationMin: service.durationMin,
    excludeAppointmentId: existing?.id,
  })
  if (slotError) return fail(slotError)

  const client = await resolveClientId(business.id, input)
  if (!client.ok) return client

  const startsAt = toInstant(input.date, input.start)
  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60_000)
  const priceCents = input.price === null || input.price === undefined ? service.priceCents : toCents(input.price)
  if (priceCents === null) return fail("Valor inválido.")

  const values = {
    clientId: client.id,
    serviceId: service.id,
    professionalId: professional.id,
    startsAt,
    endsAt,
    priceCents,
    paymentMethod: input.paymentMethod ?? null,
    notes: cleanText(input.notes, 1000),
  }

  try {
    if (existing) {
      await db
        .update(appointments)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(appointments.id, existing.id), eq(appointments.businessId, business.id)))
      if (existing.startsAt.getTime() !== startsAt.getTime() || existing.professionalId !== professional.id) {
        await notify({
          businessId: business.id,
          type: "appointment_rescheduled",
          title: "Agendamento reagendado",
          body: `${service.name} com ${professional.name} em ${input.date.split("-").reverse().join("/")} às ${input.start}`,
          appointmentId: existing.id,
        })
      }
    } else {
      const [created] = await db
        .insert(appointments)
        .values({ ...values, businessId: business.id, status: "confirmed", source: "admin" })
        .returning({ id: appointments.id })
      await notify({
        businessId: business.id,
        type: "appointment_created",
        title: "Novo agendamento",
        body: `${service.name} com ${professional.name} em ${input.date.split("-").reverse().join("/")} às ${input.start}`,
        appointmentId: created.id,
      })
    }
  } catch (error) {
    if (isOverlapError(error)) return fail(`${professional.name} já possui um agendamento neste horário.`)
    throw error
  }

  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function updateAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  payment?: { method: PaymentMethod; amount: number } | null
) {
  if (!isUuid(id)) return fail("Agendamento inválido.")
  const business = await getCurrentBusiness()
  const [appointment] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), eq(appointments.businessId, business.id)))
  if (!appointment) return fail("Agendamento não encontrado.")
  if (!STATUS_TRANSITIONS[appointment.status].includes(status)) {
    return fail("Esta mudança de status não é permitida.")
  }

  if (status === "pending") {
    const local = localParts(appointment.startsAt)
    const [professional] = await db.select().from(professionals).where(eq(professionals.id, appointment.professionalId))
    const slotError = professional
      ? await validateSlot({
          business,
          professional,
          date: local.date,
          start: local.time,
          durationMin: Math.round((appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000),
          excludeAppointmentId: appointment.id,
        })
      : "Profissional não encontrado."
    if (slotError) return fail(`Não é possível reabrir: ${slotError}`)
  }

  let paymentCents: number | null = null
  if (payment) {
    if (status !== "completed") return fail("Pagamentos só podem ser registrados ao concluir.")
    if (!PAYMENT_VALUES.has(payment.method)) return fail("Forma de pagamento inválida.")
    paymentCents = toCents(payment.amount)
    if (!paymentCents) return fail("Informe um valor de pagamento válido.")
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(appointments)
        .set({ status, updatedAt: new Date(), ...(payment ? { paymentMethod: payment.method } : {}) })
        .where(and(eq(appointments.id, id), eq(appointments.businessId, business.id)))
      if (payment && paymentCents) {
        await tx.insert(payments).values({
          businessId: business.id,
          appointmentId: id,
          amountCents: paymentCents,
          method: payment.method,
        })
      }
    })
  } catch (error) {
    if (isOverlapError(error)) return fail("O horário já foi ocupado por outro agendamento.")
    throw error
  }

  if (status === "cancelled") {
    await notify({
      businessId: business.id,
      type: "appointment_cancelled",
      title: "Agendamento cancelado",
      body: `Horário de ${localParts(appointment.startsAt).time} em ${localParts(appointment.startsAt).date.split("-").reverse().join("/")} foi liberado.`,
      appointmentId: id,
    })
  }

  revalidatePath("/", "layout")
  return { ok: true as const }
}

export async function registerPayment(appointmentId: string, method: PaymentMethod, amount: number) {
  if (!isUuid(appointmentId)) return fail("Agendamento inválido.")
  if (!PAYMENT_VALUES.has(method)) return fail("Forma de pagamento inválida.")
  const amountCents = toCents(amount)
  if (!amountCents) return fail("Informe um valor válido.")

  const business = await getCurrentBusiness()
  const [appointment] = await db
    .select({
      id: appointments.id,
      status: appointments.status,
      priceCents: appointments.priceCents,
      paid: sql<number>`coalesce((select sum(p.amount_cents) from payments p where p.appointment_id = ${appointments.id}), 0)::int`,
    })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.businessId, business.id)))
  if (!appointment) return fail("Agendamento não encontrado.")
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    return fail("Não é possível registrar pagamento para agendamentos cancelados.")
  }
  if (appointment.paid + amountCents > appointment.priceCents) {
    return fail("O valor excede o saldo pendente deste atendimento.")
  }

  await db.transaction(async (tx) => {
    await tx.insert(payments).values({ businessId: business.id, appointmentId, amountCents, method })
    await tx.update(appointments).set({ paymentMethod: method, updatedAt: new Date() }).where(eq(appointments.id, appointmentId))
  })

  revalidatePath("/", "layout")
  return { ok: true as const }
}
