"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { cleanText, fail, isTime, isUuid, toCents } from "@/lib/actions/result"
import { authorize, NO_PERMISSION } from "@/lib/business"
import { persistProfessional, persistService } from "@/lib/catalog-links"
import { db } from "@/lib/db"
import { appointments, clients, professionals, services } from "@/lib/db/schema"
import { isValidPhone, normalizePhone } from "@/lib/phone"
import { recordSetupChange } from "@/lib/setup-state"
import { timeToMinutes } from "@/lib/time"
import type { DaySchedule } from "@/lib/types"

function done() {
  revalidatePath("/", "layout")
  return { ok: true as const }
}

/** Serviços e profissionais alteram o checklist de configuração inicial. */
async function catalogChanged(businessId: string) {
  await recordSetupChange(db, businessId)
  return done()
}

/* ---------------------------------- Clientes --------------------------------- */

export interface ClientInput {
  id?: string
  name: string
  phone: string
  email?: string | null
  birthDate?: string | null
  notes?: string | null
}

export async function saveClient(input: ClientInput) {
  const access = await authorize("clients.manage")
  if (!access) return fail(NO_PERMISSION)
  const business = access.business
  const name = cleanText(input.name, 120)
  if (!name) return fail("Informe o nome do cliente.")
  if (!isValidPhone(input.phone)) return fail("Informe um telefone válido com DDD.")
  const email = cleanText(input.email, 160)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("E-mail inválido.")
  const birthDate = input.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) ? input.birthDate : null
  const phoneNormalized = normalizePhone(input.phone)

  const [duplicate] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.businessId, business.id), eq(clients.phoneNormalized, phoneNormalized)))
  if (duplicate && duplicate.id !== input.id) return fail("Já existe um cliente com este telefone.")

  const values = { name, phone: input.phone.trim(), phoneNormalized, email, birthDate, notes: cleanText(input.notes, 2000) }
  if (input.id) {
    if (!isUuid(input.id)) return fail("Cliente inválido.")
    await db.update(clients).set(values).where(and(eq(clients.id, input.id), eq(clients.businessId, business.id)))
    return done()
  }
  const [created] = await db.insert(clients).values({ ...values, businessId: business.id }).returning({ id: clients.id })
  revalidatePath("/", "layout")
  return { ok: true as const, id: created.id }
}

export async function deleteClient(id: string) {
  if (!isUuid(id)) return fail("Cliente inválido.")
  const access = await authorize("clients.manage")
  if (!access) return fail(NO_PERMISSION)
  const business = access.business
  const [linked] = await db.select({ id: appointments.id }).from(appointments).where(eq(appointments.clientId, id)).limit(1)
  if (linked) return fail("Este cliente possui histórico de agendamentos e não pode ser excluído.")
  await db.delete(clients).where(and(eq(clients.id, id), eq(clients.businessId, business.id)))
  return done()
}

/* -------------------------------- Profissionais ------------------------------ */

function validateSchedule(schedule: DaySchedule[]) {
  if (!Array.isArray(schedule) || schedule.length !== 7) return "Jornada inválida."
  for (const day of schedule) {
    if (!day.active) continue
    if (!isTime(day.start) || !isTime(day.end) || timeToMinutes(day.end) <= timeToMinutes(day.start)) {
      return "Verifique os horários de início e fim da jornada."
    }
    if (day.breakStart || day.breakEnd) {
      if (!isTime(day.breakStart) || !isTime(day.breakEnd)) return "Preencha início e fim do intervalo."
      const bs = timeToMinutes(day.breakStart)
      const be = timeToMinutes(day.breakEnd)
      if (be <= bs || bs < timeToMinutes(day.start) || be > timeToMinutes(day.end)) {
        return "O intervalo deve estar dentro da jornada."
      }
    }
  }
  return null
}

function normalizeSchedule(schedule: DaySchedule[]): DaySchedule[] {
  return [...schedule]
    .sort((a, b) => a.weekday - b.weekday)
    .map((d) => ({
      weekday: d.weekday,
      active: Boolean(d.active),
      start: d.start,
      end: d.end,
      breakStart: d.breakStart || null,
      breakEnd: d.breakEnd || null,
    }))
}

export interface ProfessionalInput {
  id?: string
  name: string
  photoUrl?: string | null
  phone?: string | null
  email?: string | null
  specialties?: string | null
  color?: string
  workSchedule: DaySchedule[]
  active: boolean
  serviceIds: string[]
}

export async function saveProfessional(input: ProfessionalInput) {
  const access = await authorize("professionals.manage")
  if (!access) return fail(NO_PERMISSION)
  const business = access.business
  const name = cleanText(input.name, 120)
  if (!name) return fail("Informe o nome do profissional.")
  if (input.phone && !isValidPhone(input.phone)) return fail("Telefone inválido.")
  const photoUrl = cleanText(input.photoUrl, 500)
  if (photoUrl && !/^https:\/\//.test(photoUrl)) return fail("A foto deve ser um link https://.")
  const scheduleError = validateSchedule(input.workSchedule)
  if (scheduleError) return fail(scheduleError)

  const values = {
    name,
    photoUrl,
    phone: cleanText(input.phone, 30),
    email: cleanText(input.email, 160),
    specialties: cleanText(input.specialties, 200),
    color: /^#[0-9a-f]{6}$/i.test(input.color ?? "") ? input.color! : "#7B3FF2",
    workSchedule: normalizeSchedule(input.workSchedule),
    active: input.active,
  }

  const result = await persistProfessional(db, business.id, {
    id: input.id || undefined,
    values,
    serviceIds: Array.isArray(input.serviceIds) ? input.serviceIds : [],
  })
  if (!result.ok) return fail(result.error)
  return catalogChanged(business.id)
}

export async function setProfessionalActive(id: string, active: boolean) {
  if (!isUuid(id)) return fail("Profissional inválido.")
  const access = await authorize("professionals.manage")
  if (!access) return fail(NO_PERMISSION)
  const business = access.business
  await db.update(professionals).set({ active }).where(and(eq(professionals.id, id), eq(professionals.businessId, business.id)))
  return catalogChanged(business.id)
}

/* ---------------------------------- Serviços --------------------------------- */

export interface ServiceInput {
  id?: string
  name: string
  category: string
  description?: string | null
  price: number
  durationMin: number
  active: boolean
  professionalIds: string[]
}

export async function saveService(input: ServiceInput) {
  const access = await authorize("services.manage")
  if (!access) return fail(NO_PERMISSION)
  const business = access.business
  const name = cleanText(input.name, 120)
  if (!name) return fail("Informe o nome do serviço.")
  const priceCents = toCents(input.price)
  if (priceCents === null) return fail("Informe um preço válido.")
  const duration = Math.round(Number(input.durationMin))
  if (!Number.isFinite(duration) || duration < 5 || duration > 600 || duration % 5 !== 0) {
    return fail("A duração deve estar entre 5 e 600 minutos, em múltiplos de 5.")
  }

  const values = {
    name,
    category: cleanText(input.category, 60) ?? "Geral",
    description: cleanText(input.description, 500),
    priceCents,
    durationMin: duration,
    active: input.active,
  }

  const result = await persistService(db, business.id, {
    id: input.id || undefined,
    values,
    professionalIds: Array.isArray(input.professionalIds) ? input.professionalIds : [],
  })
  if (!result.ok) return fail(result.error)
  return catalogChanged(business.id)
}

export async function setServiceActive(id: string, active: boolean) {
  if (!isUuid(id)) return fail("Serviço inválido.")
  const access = await authorize("services.manage")
  if (!access) return fail(NO_PERMISSION)
  const business = access.business
  await db.update(services).set({ active }).where(and(eq(services.id, id), eq(services.businessId, business.id)))
  return catalogChanged(business.id)
}
