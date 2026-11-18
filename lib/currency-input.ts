export function parseCurrencyInput(value: string) {
  const normalized = value.trim().replace(",", ".")
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(normalized)) return null

  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}
