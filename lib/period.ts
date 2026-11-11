import { addDays, diffDays, isValidLocalDate, startOfMonth } from "@/lib/time"
import type { PeriodKey } from "@/lib/types"

export const MAX_CUSTOM_RANGE_DAYS = 92

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "month", label: "Este mês" },
  { value: "custom", label: "Personalizado" },
]

export interface LocalRange {
  from: string
  to: string
}

export interface PeriodSelection extends LocalRange {
  period: PeriodKey
}

const PERIOD_KEYS = new Set<PeriodKey>(["today", "7d", "30d", "month", "custom"])

export function resolvePeriod(
  params: { period?: string; from?: string; to?: string },
  today: string,
  fallback: PeriodKey = "today"
): PeriodSelection {
  const period = PERIOD_KEYS.has(params.period as PeriodKey) ? (params.period as PeriodKey) : fallback
  switch (period) {
    case "today":
      return { period, from: today, to: today }
    case "7d":
      return { period, from: addDays(today, -6), to: today }
    case "30d":
      return { period, from: addDays(today, -29), to: today }
    case "month":
      return { period, from: startOfMonth(today), to: today }
    case "custom": {
      if (!isValidLocalDate(params.from)) return { period: "7d", from: addDays(today, -6), to: today }
      const from = params.from
      let to = isValidLocalDate(params.to) && params.to >= from ? params.to : from
      if (diffDays(from, to) > MAX_CUSTOM_RANGE_DAYS) to = addDays(from, MAX_CUSTOM_RANGE_DAYS)
      return { period, from, to }
    }
  }
}

export function previousRange(range: LocalRange): LocalRange {
  const length = diffDays(range.from, range.to) + 1
  return { from: addDays(range.from, -length), to: addDays(range.to, -length) }
}

export function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
