import "server-only"

import { and, eq, gte, inArray, lt, lte, sql } from "drizzle-orm"

import { getWorkWindow, workMinutes } from "@/lib/availability"
import { db } from "@/lib/db"
import {
  appointments,
  expenses,
  payments,
  professionals,
  services,
  type BusinessRow,
} from "@/lib/db/schema"
import type { LocalRange } from "@/lib/period"
import { addDays, eachDay, localParts, timeToMinutes, toInstant } from "@/lib/time"
import type { AppointmentStatus } from "@/lib/types"

export interface StatRow {
  id: string
  clientId: string
  serviceId: string
  professionalId: string
  status: AppointmentStatus
  priceCents: number
  date: string
  hour: number
  minutes: number
}

export async function loadStatRows(businessId: string, range: LocalRange) {
  const rows = await db
    .select({
      id: appointments.id,
      clientId: appointments.clientId,
      serviceId: appointments.serviceId,
      professionalId: appointments.professionalId,
      status: appointments.status,
      priceCents: appointments.priceCents,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, businessId),
        gte(appointments.startsAt, toInstant(range.from)),
        lt(appointments.startsAt, toInstant(addDays(range.to, 1)))
      )
    )
  return rows.map<StatRow>((r) => {
    const local = localParts(r.startsAt)
    return {
      id: r.id,
      clientId: r.clientId,
      serviceId: r.serviceId,
      professionalId: r.professionalId,
      status: r.status,
      priceCents: r.priceCents,
      date: local.date,
      hour: Math.floor(timeToMinutes(local.time) / 60),
      minutes: Math.round((r.endsAt.getTime() - r.startsAt.getTime()) / 60_000),
    }
  })
}

/** Minutos de trabalho disponíveis (jornada − intervalos) somados por toda a equipe ativa. */
export async function loadCapacityMinutes(business: BusinessRow, range: LocalRange) {
  const team = await db
    .select()
    .from(professionals)
    .where(and(eq(professionals.businessId, business.id), eq(professionals.active, true)))
  let total = 0
  for (const date of eachDay(range.from, range.to)) {
    for (const professional of team) total += workMinutes(getWorkWindow(business, professional, date))
  }
  return total
}

const OCCUPYING: AppointmentStatus[] = ["pending", "confirmed", "in_progress", "completed"]

export function summarize(rows: StatRow[], capacityMinutes: number) {
  const byStatus = Object.fromEntries(
    (["pending", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const).map((s) => [s, 0])
  ) as Record<AppointmentStatus, number>
  let revenueCents = 0
  let occupiedMinutes = 0
  const clients = new Set<string>()
  const serviceCounts = new Map<string, { count: number; revenueCents: number }>()
  const professionalCounts = new Map<string, { count: number; revenueCents: number }>()
  const hourCounts = new Map<number, number>()

  for (const row of rows) {
    byStatus[row.status]++
    if (OCCUPYING.includes(row.status)) occupiedMinutes += row.minutes
    if (row.status !== "completed") continue
    revenueCents += row.priceCents
    clients.add(row.clientId)
    const s = serviceCounts.get(row.serviceId) ?? { count: 0, revenueCents: 0 }
    serviceCounts.set(row.serviceId, { count: s.count + 1, revenueCents: s.revenueCents + row.priceCents })
    const p = professionalCounts.get(row.professionalId) ?? { count: 0, revenueCents: 0 }
    professionalCounts.set(row.professionalId, { count: p.count + 1, revenueCents: p.revenueCents + row.priceCents })
    hourCounts.set(row.hour, (hourCounts.get(row.hour) ?? 0) + 1)
  }

  const total = rows.length
  return {
    total,
    byStatus,
    scheduled: total - byStatus.cancelled - byStatus.no_show,
    completed: byStatus.completed,
    cancelled: byStatus.cancelled,
    noShow: byStatus.no_show,
    revenue: revenueCents / 100,
    clients: clients.size,
    occupancy: capacityMinutes ? Math.min(1, occupiedMinutes / capacityMinutes) : 0,
    averageTicket: byStatus.completed ? revenueCents / 100 / byStatus.completed : 0,
    serviceCounts,
    professionalCounts,
    hourCounts,
  }
}

export type PeriodSummary = ReturnType<typeof summarize>

export async function getPeriodSummary(business: BusinessRow, range: LocalRange) {
  const [rows, capacity] = await Promise.all([
    loadStatRows(business.id, range),
    loadCapacityMinutes(business, range),
  ])
  return { rows, summary: summarize(rows, capacity) }
}

/** Clientes cuja primeira visita (agendamento não cancelado) caiu dentro do período. */
export async function countNewAndReturningClients(businessId: string, range: LocalRange, clientIds: string[]) {
  if (clientIds.length === 0) return { newClients: 0, returningClients: 0 }
  const firsts = await db
    .select({ clientId: appointments.clientId, first: sql<Date>`min(${appointments.startsAt})` })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, businessId),
        inArray(appointments.clientId, clientIds),
        inArray(appointments.status, OCCUPYING)
      )
    )
    .groupBy(appointments.clientId)
  const start = toInstant(range.from).getTime()
  const newClients = firsts.filter((f) => new Date(f.first).getTime() >= start).length
  return { newClients, returningClients: clientIds.length - newClients }
}

export async function loadNames(businessId: string) {
  const [serviceRows, professionalRows] = await Promise.all([
    db.select({ id: services.id, name: services.name }).from(services).where(eq(services.businessId, businessId)),
    db
      .select({ id: professionals.id, name: professionals.name, specialties: professionals.specialties })
      .from(professionals)
      .where(eq(professionals.businessId, businessId)),
  ])
  return {
    services: new Map(serviceRows.map((s) => [s.id, s.name])),
    professionals: new Map(professionalRows.map((p) => [p.id, p])),
  }
}

export async function sumPayments(businessId: string, range: LocalRange) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(
      and(
        eq(payments.businessId, businessId),
        gte(payments.paidAt, toInstant(range.from)),
        lt(payments.paidAt, toInstant(addDays(range.to, 1)))
      )
    )
  return (row?.total ?? 0) / 100
}

export async function sumExpenses(businessId: string, range: LocalRange) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${expenses.amountCents}), 0)::int` })
    .from(expenses)
    .where(and(eq(expenses.businessId, businessId), gte(expenses.date, range.from), lte(expenses.date, range.to)))
  return (row?.total ?? 0) / 100
}
