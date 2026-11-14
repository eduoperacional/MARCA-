"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatCompactCurrency, formatCurrency, formatNumber } from "@/lib/format"
import type { MonthlyPoint } from "@/lib/admin/metrics"

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
const monthLabel = (value: string) => {
  const [year, month] = value.split("-")
  return `${MONTHS[Number(month) - 1]}/${year.slice(2)}`
}

const growthConfig = {
  totalBusinesses: { label: "Estabelecimentos", color: "var(--chart-1)" },
  newBusinesses: { label: "Novos no mês", color: "var(--chart-2)" },
} satisfies ChartConfig

export function GrowthChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ChartContainer config={growthConfig} className="h-64 w-full" aria-label="Crescimento de estabelecimentos por mês">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="admin-growth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-totalBusinesses)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-totalBusinesses)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeOpacity={0.15} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => monthLabel(String(v))} />} />
        <Area
          dataKey="totalBusinesses"
          type="monotone"
          stroke="var(--color-totalBusinesses)"
          strokeWidth={2}
          fill="url(#admin-growth)"
        />
        <Area dataKey="newBusinesses" type="monotone" stroke="var(--color-newBusinesses)" strokeWidth={2} fill="none" />
      </AreaChart>
    </ChartContainer>
  )
}

const revenueConfig = { revenue: { label: "Receita recebida", color: "var(--chart-1)" } } satisfies ChartConfig

export function RevenueChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ChartContainer config={revenueConfig} className="h-64 w-full" aria-label="Receita recebida por mês">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.15} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickFormatter={(v) => formatCompactCurrency(Number(v))} tickLine={false} axisLine={false} width={64} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(v) => monthLabel(String(v))}
              formatter={(value) => formatCurrency(Number(value))}
            />
          }
        />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

const flowConfig = {
  newSubscriptions: { label: "Novas assinaturas", color: "var(--chart-4)" },
  cancellations: { label: "Cancelamentos", color: "var(--chart-5)" },
} satisfies ChartConfig

export function SubscriptionFlowChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ChartContainer config={flowConfig} className="h-64 w-full" aria-label="Novas assinaturas e cancelamentos por mês">
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.15} />
        <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickFormatter={(v) => formatNumber(Number(v))} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => monthLabel(String(v))} />} />
        <Bar dataKey="newSubscriptions" fill="var(--color-newSubscriptions)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="cancellations" fill="var(--color-cancellations)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
