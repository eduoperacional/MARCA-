/**
 * Utilitários de data/hora no fuso do estabelecimento.
 * O Brasil (America/Sao_Paulo) não adota horário de verão desde 2019, então o offset é fixo.
 */
export const BUSINESS_TIMEZONE = "America/Sao_Paulo"
const OFFSET = "-03:00"

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** Converte uma data local (yyyy-MM-dd) + hora (HH:mm) para um instante UTC. */
export function toInstant(date: string, time = "00:00") {
  return new Date(`${date}T${time}:00${OFFSET}`)
}

export function localParts(instant: Date) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map((part) => [part.type, part.value])
  )
  const date = `${parts.year}-${parts.month}-${parts.day}`
  return {
    date,
    time: `${parts.hour}:${parts.minute}`,
    weekday: weekdayOf(date),
  }
}

export function todayLocal() {
  return localParts(new Date()).date
}

export function weekdayOf(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function diffDays(from: string, to: string) {
  return Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) /
      86_400_000
  )
}

export function eachDay(from: string, to: string) {
  const days: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  return days
}

export function startOfWeek(date: string) {
  return addDays(date, -weekdayOf(date))
}

export function startOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`
}

export function endOfMonth(date: string) {
  const [y, m] = date.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`
}

export function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Converte "yyyy-MM-dd" para Date ao meio-dia local, seguro para formatação com date-fns. */
export function dateFromLocal(date: string) {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, m - 1, d, 12)
}

export function localFromDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function isValidLocalDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
]

export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
