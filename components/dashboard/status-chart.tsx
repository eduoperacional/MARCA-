"use client"

import { Cell, Label, Pie, PieChart } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { APPOINTMENT_STATUS } from "@/lib/appointment-status"
import { formatNumber, formatPercent } from "@/lib/format"
import type { StatusSlice } from "@/lib/types"

const chartConfig = Object.fromEntries(
  Object.entries(APPOINTMENT_STATUS).map(([status, config]) => [
    status,
    { label: config.label, color: config.color },
  ])
) satisfies ChartConfig

export function StatusChart({ data }: { data: StatusSlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.count, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">Status dos agendamentos</CardTitle>
        <CardDescription>Distribuição no período selecionado</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-48">
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent nameKey="status" hideLabel />}
            />
            <Pie
              data={data}
              dataKey="count"
              nameKey="status"
              innerRadius={58}
              outerRadius={82}
              strokeWidth={3}
              stroke="var(--card)"
              paddingAngle={2}
            >
              {data.map((slice) => (
                <Cell key={slice.status} fill={APPOINTMENT_STATUS[slice.status].color} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox)) return null
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan
                        x={viewBox.cx}
                        y={viewBox.cy}
                        className="fill-foreground font-heading text-2xl font-semibold"
                      >
                        {formatNumber(total)}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 20}
                        className="fill-muted-foreground text-xs"
                      >
                        agendamentos
                      </tspan>
                    </text>
                  )
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>

        <ul className="flex flex-col gap-2">
          {data.map((slice) => {
            const config = APPOINTMENT_STATUS[slice.status]
            return (
              <li key={slice.status} className="flex items-center gap-2 text-sm">
                <span className={`size-2.5 rounded-full ${config.dotClass}`} aria-hidden="true" />
                <span className="flex-1 text-muted-foreground">{config.label}</span>
                <span className="font-medium tabular-nums">{formatNumber(slice.count)}</span>
                <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                  {formatPercent(total ? slice.count / total : 0)}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
