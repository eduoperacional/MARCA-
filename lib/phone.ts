/** Normaliza telefones brasileiros para apenas dígitos com DDD (sem o +55). */
export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "")
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2)
  return digits
}

export function isValidPhone(value: string) {
  const digits = normalizePhone(value)
  return digits.length === 10 || digits.length === 11
}

export function formatPhone(value: string) {
  const digits = normalizePhone(value)
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return value
}
