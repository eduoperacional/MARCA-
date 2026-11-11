import "server-only"

import { and, asc, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm"

import { db } from "@/lib/db"
import { professionalServices, professionals, services, timeBlocks } from "@/lib/db/schema"
import { addDays, localParts, toInstant } from "@/lib/time"
import type { DaySchedule } from "@/lib/types"

export interface ProfessionalItem {
  id: string
  name: string
  photoUrl: string | null
  phone: string | null
  email: string | null
  specialties: string | null
  color: string
  workSchedule: DaySchedule[]
  active: boolean
  serviceIds: string[]
}

export interface ServiceItem {
  id: string
  name: string
  category: string
  description: string | null
  price: number
  durationMin: number
  active: boolean
  professionalIds: string[]
}

async function loadLinks(businessId: string) {
  return db
    .select({ professionalId: professionalServices.professionalId, serviceId: professionalServices.serviceId })
    .from(professionalServices)
    .innerJoin(services, eq(services.id, professionalServices.serviceId))
    .where(eq(services.businessId, businessId))
}

export async function listProfessionals(businessId: string, { onlyActive = false } = {}) {
  const [rows, links] = await Promise.all([
    db
      .select()
      .from(professionals)
      .where(and(eq(professionals.businessId, businessId), onlyActive ? eq(professionals.active, true) : undefined))
      .orderBy(desc(professionals.active), asc(professionals.name)),
    loadLinks(businessId),
  ])
  return rows.map<ProfessionalItem>((p) => ({
    id: p.id,
    name: p.name,
    photoUrl: p.photoUrl,
    phone: p.phone,
    email: p.email,
    specialties: p.specialties,
    color: p.color,
    workSchedule: p.workSchedule,
    active: p.active,
    serviceIds: links.filter((l) => l.professionalId === p.id).map((l) => l.serviceId),
  }))
}

export async function listServices(businessId: string, { onlyActive = false } = {}) {
  const [rows, links] = await Promise.all([
    db
      .select()
      .from(services)
      .where(and(eq(services.businessId, businessId), onlyActive ? eq(services.active, true) : undefined))
      .orderBy(asc(services.category), asc(services.name)),
    loadLinks(businessId),
  ])
  return rows.map<ServiceItem>((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    price: s.priceCents / 100,
    durationMin: s.durationMin,
    active: s.active,
    professionalIds: links.filter((l) => l.serviceId === s.id).map((l) => l.professionalId),
  }))
}

export interface TimeBlockItem {
  id: string
  professionalId: string | null
  date: string
  start: string
  end: string
  endDate: string
  reason: string | null
}

export async function listTimeBlocks(businessId: string, from: string, to: string, professionalIds?: string[]) {
  const rows = await db
    .select()
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.businessId, businessId),
        lt(timeBlocks.startsAt, toInstant(addDays(to, 1))),
        gte(timeBlocks.endsAt, toInstant(from)),
        professionalIds?.length
          ? or(isNull(timeBlocks.professionalId), inArray(timeBlocks.professionalId, professionalIds))
          : undefined
      )
    )
    .orderBy(asc(timeBlocks.startsAt))
  return rows.map<TimeBlockItem>((b) => {
    const start = localParts(b.startsAt)
    const end = localParts(b.endsAt)
    return {
      id: b.id,
      professionalId: b.professionalId,
      date: start.date,
      start: start.time,
      end: end.date > start.date ? "23:59" : end.time,
      endDate: end.date,
      reason: b.reason,
    }
  })
}
