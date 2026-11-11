"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatCompactCurrency, formatCurrency } from "@/lib/format"
import type { RevenuePoint } from "@/lib/types"

const chartConfig = {
  current: { label: "Período atual", color: "var(--chart-1)" },
  previous: { label: "Período anterior", color: "var(--chart-3)" },
} satisfies ChartConfig

export function RevenueChart({
  data,
  granularity,
  rangeLabel,
  className,
}: {
  data: RevenuePoint[]
  granularity: "hour" | "day"
  rangeLabel: string
  className?: string
}) {
  const total = data.reduce((sum, point) => sum + (point.current ?? 0), 0)

  return (
    <Card className={className}>
      <CardHeader>
        <CardDescription>Faturamento · {rangeLabel}</CardDescription>
        <CardTitle className="font-heading text-2xl tabular-nums">
          {formatCurrency(total)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-64 w-full"
          aria-label={`Gráfico de faturamento ${granularity === "hour" ? "por hora" : "por dia"}`}
        >
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="fillCurrent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-current)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--color-current)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={16}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(value: number) => formatCompactCurrency(value)}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel}
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {chartConfig[name as keyof typeof chartConfig]?.label}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatCurrency(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              dataKey="previous"
              type="monotone"
              stroke="var(--color-previous)"
              strokeDasharray="4 4"
              fill="none"
              strokeWidth={1.5}
            />
            <Area
              dataKey="current"
              type="monotone"
              stroke="var(--color-current)"
              fill="url(#fillCurrent)"
              strokeWidth={2}
              connectNulls={false}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
