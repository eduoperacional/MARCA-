import { Award, Clock, Receipt, Scissors, type LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  percentChange,
} from "@/lib/format"
import type { PerformanceSummary as Summary } from "@/lib/types"

function SummaryRow({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-brand-light">
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-sm font-medium">{value}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  )
}

export function PerformanceSummary({ summary }: { summary: Summary }) {
  const ticketChange = percentChange(
    summary.averageTicket.value,
    summary.averageTicket.previous
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading">Resumo de desempenho</CardTitle>
        <CardDescription>Destaques do período</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SummaryRow
          icon={Scissors}
          label="Serviço mais realizado"
          value={summary.topService.name}
          detail={`${formatNumber(summary.topService.count)} atendimentos · ${formatCurrency(summary.topService.revenue)}`}
        />
        <Separator />
        <div className="flex flex-col gap-3">
          <SummaryRow
            icon={Award}
            label="Profissional com mais atendimentos"
            value={summary.topProfessional.name}
            detail={`${summary.topProfessional.role} · ${formatNumber(summary.topProfessional.count)} atendimentos`}
          />
          <div className="flex items-center gap-3 pl-12">
            <Progress
              value={Math.round(summary.topProfessional.share * 100)}
              className="flex-1"
              aria-label="Participação nos atendimentos"
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatPercent(summary.topProfessional.share)}
            </span>
          </div>
        </div>
        <Separator />
        <SummaryRow
          icon={Clock}
          label="Horário de maior movimento"
          value={summary.peakHour.label}
          detail={`${formatPercent(summary.peakHour.share)} dos atendimentos`}
        />
        <Separator />
        <SummaryRow
          icon={Receipt}
          label="Ticket médio"
          value={formatCurrency(summary.averageTicket.value, true)}
          detail={`${ticketChange >= 0 ? "+" : "−"}${formatPercent(Math.abs(ticketChange))} vs. período anterior`}
        />
      </CardContent>
    </Card>
  )
}
