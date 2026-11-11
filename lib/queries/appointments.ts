import "server-only"

import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm"

import { db } from "@/lib/db"
import { appointments, clients, professionals, services } from "@/lib/db/schema"
import { addDays, localParts, toInstant } from "@/lib/time"
import type { Appointment, AppointmentStatus } from "@/lib/types"

const paidCents = sql<number>`coalesce((select sum(p.amount_cents) from payments p where p.appointment_id = ${appointments.id}), 0)::int`

const appointmentSelection = {
  appointment: appointments,
  clientName: clients.name,
  clientPhone: clients.phone,
  serviceName: services.name,
  serviceDuration: services.durationMin,
  professionalName: professionals.name,
  professionalColor: professionals.color,
  paidCents,
}

type AppointmentSelection = {
  appointment: typeof appointments.$inferSelect
  clientName: string
  clientPhone: string
  serviceName: string
  serviceDuration: number
  professionalName: string
  professionalColor: string
  paidCents: number
}

export function toAppointment(row: AppointmentSelection): Appointment {
  const a = row.appointment
  const start = localParts(a.startsAt)
  const end = localParts(a.endsAt)
  return {
    id: a.id,
    date: start.date,
    start: start.time,
    end: end.time,
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    clientId: a.clientId,
    clientName: row.clientName,
    clientPhone: row.clientPhone,
    service: {
      id: a.serviceId,
      name: row.serviceName,
      price: a.priceCents / 100,
      durationMin: Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000),
    },
    professional: { id: a.professionalId, name: row.professionalName, color: row.professionalColor },
    status: a.status,
    price: a.priceCents / 100,
    paidAmount: row.paidCents / 100,
    paymentMethod: a.paymentMethod,
    notes: a.notes,
    source: a.source,
  }
}

export interface AppointmentFilters {
  from?: string
  to?: string
  professionalId?: string
  serviceId?: string
  clientId?: string
  statuses?: AppointmentStatus[]
  query?: string
  order?: "asc" | "desc"
  limit?: number
}

export async function listAppointments(businessId: string, filters: AppointmentFilters = {}) {
  const conditions: (SQL | undefined)[] = [eq(appointments.businessId, businessId)]
  if (filters.from) conditions.push(gte(appointments.startsAt, toInstant(filters.from)))
  if (filters.to) conditions.push(lt(appointments.startsAt, toInstant(addDays(filters.to, 1))))
  if (filters.professionalId) conditions.push(eq(appointments.professionalId, filters.professionalId))
  if (filters.serviceId) conditions.push(eq(appointments.serviceId, filters.serviceId))
  if (filters.clientId) conditions.push(eq(appointments.clientId, filters.clientId))
  if (filters.statuses?.length) conditions.push(inArray(appointments.status, filters.statuses))
  if (filters.query) {
    const term = `%${filters.query}%`
    const digits = filters.query.replace(/\D/g, "")
    conditions.push(
      or(ilike(clients.name, term), digits.length >= 3 ? ilike(clients.phoneNormalized, `%${digits}%`) : undefined)
    )
  }

  const rows = await db
    .select(appointmentSelection)
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(and(...conditions))
    .orderBy(filters.order === "desc" ? desc(appointments.startsAt) : asc(appointments.startsAt))
    .limit(filters.limit ?? 500)

  return rows.map(toAppointment)
}

export async function getAppointment(businessId: string, id: string) {
  const [row] = await db
    .select(appointmentSelection)
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(and(eq(appointments.businessId, businessId), eq(appointments.id, id)))
    .limit(1)
  return row ? toAppointment(row) : null
}
