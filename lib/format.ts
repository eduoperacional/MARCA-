import type { MetricFormat } from "@/lib/types"

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})

const preciseCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat("pt-BR")

const compactCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatCurrency(value: number, precise = false) {
  return (precise ? preciseCurrencyFormatter : currencyFormatter).format(value)
}

export function formatCompactCurrency(value: number) {
  return compactCurrencyFormatter.format(value)
}

export function formatNumber(value: number) {
  return numberFormatter.format(value)
}

export function formatPercent(value: number, fractionDigits = 0) {
  return `${(value * 100).toFixed(fractionDigits).replace(".", ",")}%`
}

export function formatMetric(value: number, format: MetricFormat) {
  if (format === "currency") return formatCurrency(value)
  if (format === "percent") return formatPercent(value)
  return formatNumber(value)
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 1
  return (current - previous) / previous
}
