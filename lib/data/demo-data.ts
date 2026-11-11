/**
 * Camada de dados demonstrativos.
 * Gera dados determinísticos e realistas para o dashboard. Quando o backend for
 * conectado, basta substituir as funções exportadas em `lib/data/dashboard.ts`
 * mantendo os mesmos contratos de tipos.
 */
import { addMinutes, format, isSameDay, set } from "date-fns"

import type {
  Appointment,
  AppointmentStatus,
  Professional,
  Service,
} from "@/lib/types"

export const DEMO_REFERENCE_DATE = new Date(2026, 10, 10)
export const DEMO_NOW = set(DEMO_REFERENCE_DATE, { hours: 14, minutes: 10 })

export const PROFESSIONALS: Professional[] = [
  { id: "rafael", name: "Rafael Costa", role: "Barbeiro sênior" },
  { id: "lucas", name: "Lucas Martins", role: "Barbeiro" },
  { id: "bruno", name: "Bruno Almeida", role: "Barbeiro" },
  { id: "camila", name: "Camila Souza", role: "Esteticista" },
]

const PROFESSIONAL_WEIGHTS = [0.31, 0.27, 0.24, 0.18]

export const SERVICES: (Service & { weight: number })[] = [
  { id: "corte", name: "Corte masculino", price: 55, durationMin: 40, weight: 0.3 },
  { id: "corte-barba", name: "Corte + barba", price: 85, durationMin: 60, weight: 0.24 },
  { id: "barba", name: "Barba completa", price: 40, durationMin: 30, weight: 0.14 },
  { id: "degrade", name: "Degradê navalhado", price: 60, durationMin: 45, weight: 0.12 },
  { id: "sobrancelha", name: "Design de sobrancelha", price: 25, durationMin: 15, weight: 0.08 },
  { id: "pigmentacao", name: "Pigmentação de barba", price: 70, durationMin: 45, weight: 0.06 },
  { id: "hidratacao", name: "Hidratação capilar", price: 45, durationMin: 30, weight: 0.06 },
]

const CLIENT_NAMES = [
  "Pedro Henrique", "João Vitor", "Mateus Oliveira", "Gabriel Santos",
  "Felipe Rocha", "André Lima", "Thiago Ribeiro", "Leonardo Dias",
  "Gustavo Ferreira", "Rodrigo Nunes", "Diego Carvalho", "Marcelo Pires",
  "Eduardo Teixeira", "Vinícius Gomes", "Henrique Barros", "Caio Moreira",
  "Daniel Araújo", "Igor Cardoso", "Renato Melo", "Samuel Freitas",
  "Otávio Castro", "Murilo Azevedo", "Arthur Correia", "Fernando Vieira",
  "Ricardo Monteiro", "Bernardo Lopes", "Paulo César", "Alexandre Prado",
]

/** Distribuição típica de movimento por hora (08h–19h). */
export const HOURLY_WEIGHTS: Record<number, number> = {
  9: 0.06, 10: 0.09, 11: 0.09, 12: 0.05, 13: 0.06, 14: 0.09,
  15: 0.1, 16: 0.11, 17: 0.12, 18: 0.13, 19: 0.1,
}

export const BUSINESS_HOURS = Object.keys(HOURLY_WEIGHTS).map(Number)

/** Capacidade de atendimentos por dia da semana (domingo = 0). */
const DAILY_CAPACITY = [0, 34, 36, 36, 38, 40, 42]
const DAILY_BASE_DEMAND = [0, 22, 25, 26, 29, 34, 38]

function hashString(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createRandom(seed: string) {
  let state = hashString(seed)
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted<T extends { weight: number }>(items: T[], random: () => number) {
  const roll = random()
  let acc = 0
  for (const item of items) {
    acc += item.weight
    if (roll <= acc) return item
  }
  return items[items.length - 1]
}

export interface DayStats {
  date: Date
  scheduled: number
  completed: number
  cancelled: number
  confirmed: number
  pending: number
  inProgress: number
  revenue: number
  clients: number
  capacity: number
  serviceCounts: Record<string, number>
  professionalCounts: Record<string, number>
}

let todayScheduleCache: Appointment[] | null = null

export function getDemoTodaySchedule(): Appointment[] {
  if (todayScheduleCache) return todayScheduleCache

  const random = createRandom("marcai-today-2026-11-10")
  const appointments: Appointment[] = []
  let clientIndex = 0

  PROFESSIONALS.forEach((professional, professionalIndex) => {
    let cursor = set(DEMO_REFERENCE_DATE, {
      hours: 9,
      minutes: professionalIndex % 2 === 0 ? 0 : 30,
    })
    const closing = set(DEMO_REFERENCE_DATE, { hours: 19, minutes: 30 })

    while (cursor < closing) {
      if (cursor.getHours() === 12) {
        cursor = set(cursor, { hours: 13, minutes: 0 })
        continue
      }

      if (random() < 0.42) {
        cursor = addMinutes(cursor, random() < 0.5 ? 30 : 45)
        continue
      }

      const service = pickWeighted(SERVICES, random)
      const end = addMinutes(cursor, service.durationMin)
      if (end > closing) break

      let status: AppointmentStatus
      if (end <= DEMO_NOW) {
        status = random() < 0.07 ? "cancelled" : "completed"
      } else if (cursor <= DEMO_NOW) {
        status = "in_progress"
      } else {
        const roll = random()
        status = roll < 0.66 ? "confirmed" : roll < 0.94 ? "pending" : "cancelled"
      }

      appointments.push({
        id: `apt-${professional.id}-${format(cursor, "HHmm")}`,
        start: format(cursor, "HH:mm"),
        end: format(end, "HH:mm"),
        clientName: CLIENT_NAMES[clientIndex % CLIENT_NAMES.length],
        service: {
          id: service.id,
          name: service.name,
          price: service.price,
          durationMin: service.durationMin,
        },
        professional: { id: professional.id, name: professional.name },
        status,
      })

      clientIndex += 3
      cursor = addMinutes(end, random() < 0.5 ? 0 : 15)
    }
  })

  todayScheduleCache = appointments.sort((a, b) => a.start.localeCompare(b.start))
  return todayScheduleCache
}

function statsFromSchedule(date: Date, schedule: Appointment[]): DayStats {
  const count = (status: AppointmentStatus) =>
    schedule.filter((appointment) => appointment.status === status).length

  const completedAppointments = schedule.filter((a) => a.status === "completed")
  const serviceCounts: Record<string, number> = {}
  const professionalCounts: Record<string, number> = {}

  for (const appointment of completedAppointments) {
    serviceCounts[appointment.service.id] = (serviceCounts[appointment.service.id] ?? 0) + 1
    professionalCounts[appointment.professional.id] =
      (professionalCounts[appointment.professional.id] ?? 0) + 1
  }

  return {
    date,
    scheduled: schedule.length,
    completed: completedAppointments.length,
    cancelled: count("cancelled"),
    confirmed: count("confirmed"),
    pending: count("pending"),
    inProgress: count("in_progress"),
    revenue: completedAppointments.reduce((sum, a) => sum + a.service.price, 0),
    clients: new Set(completedAppointments.map((a) => a.clientName)).size,
    capacity: DAILY_CAPACITY[date.getDay()],
    serviceCounts,
    professionalCounts,
  }
}

export function getDemoDayStats(date: Date): DayStats {
  if (isSameDay(date, DEMO_REFERENCE_DATE)) {
    return statsFromSchedule(date, getDemoTodaySchedule())
  }

  const weekday = date.getDay()
  const random = createRandom(`marcai-day-${format(date, "yyyy-MM-dd")}`)
  const daysFromReference =
    (date.getTime() - DEMO_REFERENCE_DATE.getTime()) / 86_400_000
  const growth = 1 + daysFromReference * 0.0025

  const scheduled = Math.max(
    0,
    Math.round(DAILY_BASE_DEMAND[weekday] * growth * (0.86 + random() * 0.26))
  )
  const cancelled = Math.round(scheduled * (0.03 + random() * 0.06))
  const completed = scheduled - cancelled

  const serviceCounts: Record<string, number> = {}
  let revenue = 0
  for (let i = 0; i < completed; i++) {
    const service = pickWeighted(SERVICES, random)
    serviceCounts[service.id] = (serviceCounts[service.id] ?? 0) + 1
    revenue += service.price
  }

  const professionalCounts: Record<string, number> = {}
  let remaining = completed
  PROFESSIONALS.forEach((professional, index) => {
    const isLast = index === PROFESSIONALS.length - 1
    const share = isLast
      ? remaining
      : Math.min(
          remaining,
          Math.round(completed * PROFESSIONAL_WEIGHTS[index] * (0.9 + random() * 0.2))
        )
    professionalCounts[professional.id] = share
    remaining -= share
  })

  return {
    date,
    scheduled,
    completed,
    cancelled,
    confirmed: 0,
    pending: 0,
    inProgress: 0,
    revenue,
    clients: Math.round(completed * (0.88 + random() * 0.08)),
    capacity: DAILY_CAPACITY[weekday],
    serviceCounts,
    professionalCounts,
  }
}
