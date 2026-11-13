import Link from "next/link"
import { Ban, CalendarClock, CircleDollarSign, Clock4, Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { formatCurrency } from "@/lib/format"
import type { TodayOperations } from "@/lib/queries/today"
import { FREE_SLOT_DURATION_MIN } from "@/lib/queries/today"
import type { Appointment } from "@/lib/types"

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  href?: string
  tone?: "default" | "warning"
}) {
  const body = (
    <CardContent className="flex h-full items-start gap-3">
      <span
        className={
          tone === "warning"
            ? "flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive"
            : "flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-brand-light"
        }
      >
        <Icon className="size-4.5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate font-heading text-xl font-semibold tabular-nums">{value}</span>
        <span className="truncate text-xs text-muted-foreground">{hint}</span>
      </div>
    </CardContent>
  )

  return (
    <Card size="sm" className="min-w-0">
      {href ? (
        <Link href={href} className="h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  )
}

export function TodayPanel({
  today,
  appointments,
  operations,
}: {
  today: string
  appointments: Appointment[]
  operations: TodayOperations
}) {
  const { now } = operations
  const upcoming = appointments.filter(
    (a) => (a.status === "pending" || a.status === "confirmed") && a.end > now
  )
  const next = upcoming[0]
  const inProgress = appointments.find((a) => a.status === "in_progress")

  const toReceive = appointments
    .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
    .reduce((sum, a) => sum + Math.max(0, a.price - a.paidAmount), 0)
  const lost = appointments.filter((a) => a.status === "cancelled" || a.status === "no_show")
  const lostValue = lost.reduce((sum, a) => sum + a.price, 0)

  return (
    <section aria-labelledby="today-panel-title" className="flex flex-col gap-3">
      <h2 id="today-panel-title" className="font-heading text-sm font-medium text-muted-foreground">
        Hoje na operação
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Metric
          icon={CalendarClock}
          label={inProgress ? "Em atendimento" : "Próximo atendimento"}
          value={inProgress ? inProgress.start : next ? next.start : "—"}
          hint={
            inProgress
              ? `${inProgress.clientName} · ${inProgress.service.name}`
              : next
                ? `${next.clientName} · ${next.professional.name}`
                : "Nenhum horário pendente hoje"
          }
          href={`/painel/agenda?date=${today}`}
        />
        <Metric
          icon={Clock4}
          label="Horários livres"
          value={String(operations.freeSlots)}
          hint={`Encaixes de ${FREE_SLOT_DURATION_MIN} min até o fim do dia`}
          href={`/painel/agenda?date=${today}`}
        />
        <Metric
          icon={CircleDollarSign}
          label="Recebido hoje"
          value={formatCurrency(operations.revenueReceived)}
          hint="Pagamentos registrados"
          href="/painel/financeiro"
        />
        <Metric
          icon={Wallet}
          label="A receber hoje"
          value={formatCurrency(toReceive)}
          hint={`${upcoming.length} ${upcoming.length === 1 ? "atendimento previsto" : "atendimentos previstos"}`}
          href="/painel/agendamentos"
        />
        <Metric
          icon={Ban}
          label="Cancelamentos e faltas"
          value={String(lost.length)}
          hint={lost.length ? `${formatCurrency(lostValue)} deixados de faturar` : "Nenhuma perda hoje"}
          tone={lost.length ? "warning" : "default"}
          href="/painel/agendamentos?status=cancelled"
        />
      </div>
    </section>
  )
}
