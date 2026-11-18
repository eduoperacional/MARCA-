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

function KpiCard({ kpi, highlight, size = "default" }: { kpi: KpiMetric; highlight?: boolean; size?: "default" | "lg" }) {
  const Icon = KPI_ICONS[kpi.id]
  const change =
    kpi.format === "percent"
      ? kpi.value - kpi.previous
      : percentChange(kpi.value, kpi.previous)
  const isUp = change >= 0
  const isPositive = kpi.lowerIsBetter ? change <= 0 : change >= 0
  const TrendIcon = isUp ? TrendingUp : TrendingDown
  const noBaseline = kpi.format !== "percent" && kpi.previous === 0
  const changeText =
    kpi.format === "percent"
      ? `${isUp ? "+" : "−"}${formatPercent(Math.abs(change))} p.p.`
      : `${isUp ? "+" : "−"}${formatPercent(Math.abs(change))}`

  return (
    <Card
      className={cn(
        "h-full gap-0 py-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        highlight &&
          "bg-brand-gradient ring-0 shadow-[0_12px_40px_-12px_rgb(123_63_242/0.7)]"
      )}
    >
      <CardContent className={cn("flex h-full flex-col justify-between gap-4 p-4", size === "lg" && "gap-6 p-5")}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-lg bg-primary/15 text-brand-light",
              highlight && "bg-white/15 text-white"
            )}
          >
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
          {noBaseline ? (
            <Badge
              variant="outline"
              className={cn("border-transparent bg-muted text-muted-foreground", highlight && "bg-white/15 text-white")}
            >
              Sem comparativo
            </Badge>
          ) : (
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
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span
            className={cn(
              "truncate font-heading text-xl font-semibold tracking-tight tabular-nums sm:text-2xl",
              size === "lg" && "text-3xl sm:text-4xl",
              highlight && "text-white"
            )}
          >
            {formatMetric(kpi.value, kpi.format)}
          </span>
          <span
            className={cn(
              "text-xs text-muted-foreground",
              size === "lg" && "text-sm",
              highlight && "text-white/80"
            )}
          >
            {kpi.label}
          </span>
        </div>
        <span className="sr-only">
          {noBaseline ? "Sem dados no período anterior para comparar" : `Variação de ${changeText} em relação ao período anterior`}
        </span>
      </CardContent>
    </Card>
  )
}

const PRIMARY_KPIS: KpiId[] = ["revenue", "appointments"]

export function KpiGrid({ kpis }: { kpis: KpiMetric[] }) {
  const primary = PRIMARY_KPIS.map((id) => kpis.find((kpi) => kpi.id === id)).filter(
    (kpi): kpi is KpiMetric => Boolean(kpi)
  )
  const secondary = kpis.filter((kpi) => !PRIMARY_KPIS.includes(kpi.id))

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="list" aria-label="Indicadores principais">
      {primary.map((kpi) => (
        <div key={kpi.id} role="listitem" className="col-span-2">
          <KpiCard kpi={kpi} highlight={kpi.id === "revenue"} size="lg" />
        </div>
      ))}
      {secondary.map((kpi) => (
        <div key={kpi.id} role="listitem" className="min-w-0">
          <KpiCard kpi={kpi} />
        </div>
      ))}
    </div>
  )
}
