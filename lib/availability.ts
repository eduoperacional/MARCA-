import "server-only"

import { and, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm"

import { ACTIVE_STATUSES } from "@/lib/appointment-status"
import { db } from "@/lib/db"
import {
  appointments,
  professionalServices,
  professionals,
  timeBlocks,
  type BusinessRow,
  type ProfessionalRow,
} from "@/lib/db/schema"
import {
  addDays,
  localParts,
  minutesToTime,
  timeToMinutes,
  toInstant,
  weekdayOf,
} from "@/lib/time"
import type { DaySchedule } from "@/lib/types"

export interface Interval {
  start: number
  end: number
}

export interface WorkWindow extends Interval {
  breaks: Interval[]
}

function scheduleFor(list: DaySchedule[], weekday: number) {
  return list.find((day) => day.weekday === weekday)
}

/** Interseção entre o horário de funcionamento e a jornada do profissional no dia. */
export function getWorkWindow(
  business: Pick<BusinessRow, "openingHours">,
  professional: Pick<ProfessionalRow, "workSchedule" | "active">,
  date: string
): WorkWindow | null {
  if (!professional.active) return null
  const weekday = weekdayOf(date)
  const opening = scheduleFor(business.openingHours, weekday)
  const work = scheduleFor(professional.workSchedule, weekday)
  if (!opening?.active || !work?.active) return null

  const start = Math.max(timeToMinutes(opening.start), timeToMinutes(work.start))
  const end = Math.min(timeToMinutes(opening.end), timeToMinutes(work.end))
  if (end <= start) return null

  const breaks: Interval[] = []
  for (const day of [opening, work]) {
    if (day.breakStart && day.breakEnd) {
      breaks.push({ start: timeToMinutes(day.breakStart), end: timeToMinutes(day.breakEnd) })
    }
  }
  return { start, end, breaks }
}

export function workMinutes(window: WorkWindow | null) {
  if (!window) return 0
  const breakTotal = window.breaks.reduce(
    (sum, b) => sum + Math.max(0, Math.min(b.end, window.end) - Math.max(b.start, window.start)),
    0
  )
  return window.end - window.start - breakTotal
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

export function fitsWindow(window: WorkWindow | null, slot: Interval) {
  if (!window) return false
  if (slot.start < window.start || slot.end > window.end) return false
  return !window.breaks.some((b) => overlaps(b, slot))
}

export function computeSlots({
  window,
  busy,
  duration,
  interval,
  notBefore = 0,
}: {
  window: WorkWindow | null
  busy: Interval[]
  duration: number
  interval: number
  notBefore?: number
}) {
  if (!window) return []
  const slots: string[] = []
  for (let start = window.start; start + duration <= window.end; start += interval) {
    if (start < notBefore) continue
    const slot = { start, end: start + duration }
    if (!fitsWindow(window, slot)) continue
    if (busy.some((b) => overlaps(b, slot))) continue
    slots.push(minutesToTime(start))
  }
  return slots
}

function toLocalInterval(date: string, startsAt: Date, endsAt: Date): Interval {
  const start = localParts(startsAt)
  const end = localParts(endsAt)
  return {
    start: start.date < date ? 0 : timeToMinutes(start.time),
    end: end.date > date ? 24 * 60 : timeToMinutes(end.time),
  }
}

/** Ocupação (agendamentos ativos + bloqueios) por profissional em um dia. */
export async function loadBusy(businessId: string, professionalIds: string[], date: string, excludeAppointmentId?: string) {
  const dayStart = toInstant(date)
  const dayEnd = toInstant(addDays(date, 1))

  const [appts, blocks] = await Promise.all([
    db
      .select({
        professionalId: appointments.professionalId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, businessId),
          inArray(appointments.professionalId, professionalIds),
          inArray(appointments.status, ACTIVE_STATUSES),
          lt(appointments.startsAt, dayEnd),
          gt(appointments.endsAt, dayStart),
          excludeAppointmentId ? ne(appointments.id, excludeAppointmentId) : undefined
        )
      ),
    db
      .select()
      .from(timeBlocks)
      .where(
        and(
          eq(timeBlocks.businessId, businessId),
          or(isNull(timeBlocks.professionalId), inArray(timeBlocks.professionalId, professionalIds)),
          lt(timeBlocks.startsAt, dayEnd),
          gt(timeBlocks.endsAt, dayStart)
        )
      ),
  ])

  const busy = new Map<string, Interval[]>(professionalIds.map((id) => [id, []]))
  for (const a of appts) busy.get(a.professionalId)?.push(toLocalInterval(date, a.startsAt, a.endsAt))
  for (const block of blocks) {
    const interval = toLocalInterval(date, block.startsAt, block.endsAt)
    const targets = block.professionalId ? [block.professionalId] : professionalIds
    for (const id of targets) busy.get(id)?.push(interval)
  }
  return busy
}

function earliestStart(business: BusinessRow, date: string, respectAdvance: boolean) {
  const now = localParts(new Date())
  if (date < now.date) return Infinity
  if (date > now.date) return 0
  const advance = respectAdvance ? business.minAdvanceMin : 0
  return timeToMinutes(now.time) + advance
}

/** Horários livres para um serviço, em um profissional específico ou em qualquer um habilitado. */
export async function getAvailableSlots({
  business,
  serviceId,
  durationMin,
  professionalId,
  date,
  excludeAppointmentId,
  respectAdvance = true,
}: {
  business: BusinessRow
  serviceId: string
  durationMin: number
  professionalId: string | null
  date: string
  excludeAppointmentId?: string
  respectAdvance?: boolean
}) {
  const eligible = await db
    .select({ professional: professionals })
    .from(professionals)
    .innerJoin(professionalServices, eq(professionalServices.professionalId, professionals.id))
    .where(
      and(
        eq(professionals.businessId, business.id),
        eq(professionals.active, true),
        eq(professionalServices.serviceId, serviceId),
        professionalId ? eq(professionals.id, professionalId) : undefined
      )
    )

  if (eligible.length === 0) return []
  const ids = eligible.map((e) => e.professional.id)
  const busy = await loadBusy(business.id, ids, date, excludeAppointmentId)
  const notBefore = earliestStart(business, date, respectAdvance)

  const byTime = new Map<string, string[]>()
  for (const { professional } of eligible) {
    const slots = computeSlots({
      window: getWorkWindow(business, professional, date),
      busy: busy.get(professional.id) ?? [],
      duration: durationMin,
      interval: business.slotIntervalMin,
      notBefore,
    })
    for (const time of slots) byTime.set(time, [...(byTime.get(time) ?? []), professional.id])
  }

  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, professionalIds]) => ({ time, professionalIds }))
}

/** Valida se um horário cabe na jornada e não conflita com agenda/bloqueios. Retorna a mensagem de erro, se houver. */
export async function validateSlot({
  business,
  professional,
  date,
  start,
  durationMin,
  excludeAppointmentId,
}: {
  business: BusinessRow
  professional: ProfessionalRow
  date: string
  start: string
  durationMin: number
  excludeAppointmentId?: string
}) {
  const slot = { start: timeToMinutes(start), end: timeToMinutes(start) + durationMin }
  const window = getWorkWindow(business, professional, date)
  if (!window) return `${professional.name} não atende neste dia.`
  if (!fitsWindow(window, slot)) {
    return `Horário fora da jornada de ${professional.name} (${minutesToTime(window.start)}–${minutesToTime(window.end)}, respeitando intervalos).`
  }
  const busy = await loadBusy(business.id, [professional.id], date, excludeAppointmentId)
  if ((busy.get(professional.id) ?? []).some((b) => overlaps(b, slot))) {
    return `${professional.name} já possui um agendamento ou bloqueio neste horário.`
  }
  return null
}
