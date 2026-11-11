import {
  CalendarCheck2,
  CalendarDays,
  CalendarX2,
  Gauge,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { formatMetric, formatPercent, percentChange } from "@/lib/format"
import type { KpiId, KpiMetric } from "@/lib/types"
import { cn } from "@/lib/utils"

const KPI_ICONS: Record<KpiId, LucideIcon> = {
  appointments: CalendarDays,
  completed: CalendarCheck2,
  revenue: Wallet,
  clients: Users,
  occupancy: Gauge,
  cancellations: CalendarX2,
}

function KpiCard({ kpi, highlight }: { kpi: KpiMetric; highlight?: boolean }) {
  const Icon = KPI_ICONS[kpi.id]
  const change =
    kpi.format === "percent"
      ? kpi.value - kpi.previous
      : percentChange(kpi.value, kpi.previous)
  const isUp = change >= 0
  const isPositive = kpi.lowerIsBetter ? change <= 0 : change >= 0
  const TrendIcon = isUp ? TrendingUp : TrendingDown
  const changeText =
    kpi.format === "percent"
      ? `${isUp ? "+" : "−"}${formatPercent(Math.abs(change))} p.p.`
      : `${isUp ? "+" : "−"}${formatPercent(Math.abs(change))}`

  return (
    <Card
      className={cn(
        "gap-0 py-0",
        highlight &&
          "bg-brand-gradient ring-0 shadow-[0_12px_40px_-12px_rgb(123_63_242/0.7)]"
      )}
    >
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg bg-primary/15 text-brand-light",
              highlight && "bg-white/15 text-white"
            )}
          >
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
          <Badge
            variant="outline"
            className={cn(
              "gap-1 border-transparent",
              isPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
              highlight && "bg-white/15 text-white"
            )}
          >
            <TrendIcon data-icon="inline-start" aria-hidden="true" />
            {changeText}
          </Badge>
        </div>
        <div className="flex flex-col gap-1">
          <span
            className={cn(
              "font-heading text-2xl font-semibold tracking-tight tabular-nums",
              highlight && "text-white"
            )}
          >
            {formatMetric(kpi.value, kpi.format)}
          </span>
          <span
            className={cn(
              "text-xs text-muted-foreground",
              highlight && "text-white/80"
            )}
          >
            {kpi.label}
          </span>
        </div>
        <span className="sr-only">
          Variação de {changeText} em relação ao período anterior
        </span>
      </CardContent>
    </Card>
  )
}

export function KpiGrid({ kpis }: { kpis: KpiMetric[] }) {
  return (
    <section
      aria-label="Indicadores principais"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
    >
      {kpis.map((kpi) => (
        <KpiCard key={kpi.id} kpi={kpi} highlight={kpi.id === "appointments"} />
      ))}
    </section>
  )
}
