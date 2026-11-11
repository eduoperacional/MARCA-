"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

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
import type { AppointmentsPoint } from "@/lib/types"

const chartConfig = {
  scheduled: { label: "Agendados", color: "var(--chart-2)" },
  completed: { label: "Concluídos", color: "var(--chart-1)" },
} satisfies ChartConfig

export function AppointmentsChart({
  data,
  granularity,
  rangeLabel,
}: {
  data: AppointmentsPoint[]
  granularity: "hour" | "day"
  rangeLabel: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">
          Agendamentos {granularity === "hour" ? "por horário" : "por dia"}
        </CardTitle>
        <CardDescription>{rangeLabel}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }} barGap={2}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={12}
            />
            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <ChartTooltip
              cursor={{ fill: "var(--accent)" }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel}
                />
              }
            />
            <Bar dataKey="scheduled" fill="var(--color-scheduled)" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
            <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
