import { isTime } from "@/lib/actions/result"
import type { DaySchedule } from "@/lib/types"

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function validateWeekSchedule(schedule: unknown): string | null {
  if (!Array.isArray(schedule) || schedule.length !== 7) return "Horários inválidos."
  const weekdays = new Set<number>()
  for (const day of schedule as DaySchedule[]) {
    if (!Number.isInteger(day?.weekday) || day.weekday < 0 || day.weekday > 6) return "Horários inválidos."
    weekdays.add(day.weekday)
    if (!day.active) continue
    if (!isTime(day.start) || !isTime(day.end) || toMinutes(day.end) <= toMinutes(day.start)) {
      return "Verifique os horários de abertura e fechamento."
    }
    if (day.breakStart || day.breakEnd) {
      if (
        !isTime(day.breakStart) ||
        !isTime(day.breakEnd) ||
        toMinutes(day.breakEnd) <= toMinutes(day.breakStart) ||
        toMinutes(day.breakStart) < toMinutes(day.start) ||
        toMinutes(day.breakEnd) > toMinutes(day.end)
      ) {
        return "Verifique os horários de intervalo."
      }
    }
  }
  if (weekdays.size !== 7) return "Horários inválidos."
  if (!(schedule as DaySchedule[]).some((d) => d.active)) return "Selecione ao menos um dia de atendimento."
  return null
}

export function normalizeWeekSchedule(schedule: DaySchedule[]): DaySchedule[] {
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
