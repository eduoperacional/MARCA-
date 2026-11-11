"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull } from "drizzle-orm"

import { cleanText, fail, isTime, isUuid, toCents } from "@/lib/actions/result"
import { getCurrentBusiness } from "@/lib/business"
import { db } from "@/lib/db"
import { businesses, expenses, notifications, professionals, timeBlocks } from "@/lib/db/schema"
import { isValidLocalDate, timeToMinutes, toInstant } from "@/lib/time"
import type { DaySchedule } from "@/lib/types"

function done() {
  revalidatePath("/", "layout")
  return { ok: true as const }
}

/* --------------------------------- Bloqueios --------------------------------- */

export async function createTimeBlock(input: {
  professionalId: string | null
  date: string
  start: string
  end: string
  reason?: string | null
}) {
  const business = await getCurrentBusiness()
  if (!isValidLocalDate(input.date)) return fail("Data inválida.")
  if (!isTime(input.start) || !isTime(input.end) || timeToMinutes(input.end) <= timeToMinutes(input.start)) {
    return fail("O horário final deve ser depois do inicial.")
  }
  if (input.professionalId) {
    if (!isUuid(input.professionalId)) return fail("Profissional inválido.")
    const [owned] = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(and(eq(professionals.id, input.professionalId), eq(professionals.businessId, business.id)))
    if (!owned) return fail("Profissional não encontrado.")
  }
  await db.insert(timeBlocks).values({
    businessId: business.id,
    professionalId: input.professionalId,
    startsAt: toInstant(input.date, input.start),
    endsAt: toInstant(input.date, input.end),
    reason: cleanText(input.reason, 200),
  })
  return done()
}

export async function deleteTimeBlock(id: string) {
  if (!isUuid(id)) return fail("Bloqueio inválido.")
  const business = await getCurrentBusiness()
  await db.delete(timeBlocks).where(and(eq(timeBlocks.id, id), eq(timeBlocks.businessId, business.id)))
  return done()
}

/* --------------------------------- Despesas ---------------------------------- */

export async function createExpense(input: { description: string; category: string; amount: number; date: string }) {
  const business = await getCurrentBusiness()
  const description = cleanText(input.description, 200)
  if (!description) return fail("Informe a descrição da despesa.")
  const amountCents = toCents(input.amount)
  if (!amountCents) return fail("Informe um valor válido.")
  if (!isValidLocalDate(input.date)) return fail("Data inválida.")
  await db.insert(expenses).values({
    businessId: business.id,
    description,
    category: cleanText(input.category, 60) ?? "Outros",
    amountCents,
    date: input.date,
  })
  return done()
}

export async function deleteExpense(id: string) {
  if (!isUuid(id)) return fail("Despesa inválida.")
  const business = await getCurrentBusiness()
  await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.businessId, business.id)))
  return done()
}

/* ------------------------------- Configurações ------------------------------- */

export async function updateBusinessSettings(input: {
  name: string
  phone?: string | null
  address?: string | null
  openingHours: DaySchedule[]
  slotIntervalMin: number
  minAdvanceMin: number
  onlineBookingEnabled: boolean
}) {
  const business = await getCurrentBusiness()
  const name = cleanText(input.name, 120)
  if (!name) return fail("Informe o nome do estabelecimento.")
  if (!Array.isArray(input.openingHours) || input.openingHours.length !== 7) return fail("Horários inválidos.")
  for (const day of input.openingHours) {
    if (!day.active) continue
    if (!isTime(day.start) || !isTime(day.end) || timeToMinutes(day.end) <= timeToMinutes(day.start)) {
      return fail("Verifique os horários de abertura e fechamento.")
    }
    if (day.breakStart || day.breakEnd) {
      if (!isTime(day.breakStart) || !isTime(day.breakEnd) || timeToMinutes(day.breakEnd) <= timeToMinutes(day.breakStart)) {
        return fail("Verifique os horários de intervalo.")
      }
    }
  }
  if (![10, 15, 20, 30, 60].includes(input.slotIntervalMin)) return fail("Intervalo de horários inválido.")
  if (!Number.isInteger(input.minAdvanceMin) || input.minAdvanceMin < 0 || input.minAdvanceMin > 7 * 24 * 60) {
    return fail("Antecedência mínima inválida.")
  }

  await db
    .update(businesses)
    .set({
      name,
      phone: cleanText(input.phone, 30),
      address: cleanText(input.address, 200),
      openingHours: [...input.openingHours]
        .sort((a, b) => a.weekday - b.weekday)
        .map((d) => ({ ...d, breakStart: d.breakStart || null, breakEnd: d.breakEnd || null })),
      slotIntervalMin: input.slotIntervalMin,
      minAdvanceMin: input.minAdvanceMin,
      onlineBookingEnabled: input.onlineBookingEnabled,
    })
    .where(eq(businesses.id, business.id))
  return done()
}

/* -------------------------------- Notificações ------------------------------- */

export async function markNotificationRead(id: string) {
  if (!isUuid(id)) return fail("Notificação inválida.")
  const business = await getCurrentBusiness()
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.businessId, business.id), isNull(notifications.readAt)))
  return { ok: true as const }
}

export async function markAllNotificationsRead() {
  const business = await getCurrentBusiness()
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.businessId, business.id), isNull(notifications.readAt)))
  return done()
}
