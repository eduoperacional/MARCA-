export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string }

export function fail(error: string) {
  return { ok: false as const, error }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function cleanText(value: unknown, max = 500) {
  if (typeof value !== "string") return null
  const trimmed = value.trim().slice(0, max)
  return trimmed.length ? trimmed : null
}

export function toCents(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."))
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) return null
  return Math.round(number * 100)
}

/** Erro de violação da constraint de exclusão (sobreposição de horários). */
export function isOverlapError(error: unknown) {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code
  return code === "23P01"
}
