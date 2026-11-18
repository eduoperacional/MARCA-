import Link from "next/link"
import { ArrowUpRight, Ban, CalendarClock, CircleDollarSign, Clock4, Wallet } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { SectionHeading } from "@/components/dashboard/section-heading"
import { formatCurrency } from "@/lib/format"
import type { TodayOperations } from "@/lib/queries/today"
import { FREE_SLOT_DURATION_MIN } from "@/lib/queries/today"
import type { Appointment } from "@/lib/types"
import { cn } from "@/lib/utils"

const tileFocus = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

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
  href: string
  tone?: "default" | "warning"
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-0 flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-accent hover:ring-primary/30",
        tone === "warning" && "ring-destructive/30",
        tileFocus
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            tone === "warning" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-brand-light"
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <ArrowUpRight
          className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            "truncate font-heading text-xl font-semibold tracking-tight tabular-nums sm:text-2xl",
            tone === "warning" && "text-destructive"
          )}
        >
          {value}
        </span>
        <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{hint}</span>
      </div>
    </Link>
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

  const featured = inProgress ?? next

  return (
    <section aria-labelledby="today-panel-title" className="flex flex-col gap-3">
      <SectionHeading id="today-panel-title" title="Hoje na operação" />
      <div className="grid gap-3 lg:grid-cols-5">
        <Link
          href={`/painel/agenda?date=${today}`}
          className={cn(
            "group relative flex min-h-44 flex-col justify-between gap-6 overflow-hidden rounded-xl bg-brand-gradient p-5 text-primary-foreground shadow-[0_16px_48px_-16px_rgb(123_63_242/0.7)] lg:col-span-2",
            tileFocus
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary-foreground/80">
              <CalendarClock className="size-4" aria-hidden="true" />
              {inProgress ? "Em atendimento agora" : "Próximo atendimento"}
            </span>
            <ArrowUpRight
              className="size-4 text-primary-foreground/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          {featured ? (
            <div className="flex flex-col gap-1">
              <span className="font-heading text-5xl font-semibold tracking-tight tabular-nums">{featured.start}</span>
              <span className="truncate text-base font-medium">{featured.clientName}</span>
              <span className="truncate text-sm text-primary-foreground/80">
                {inProgress ? featured.service.name : `${featured.service.name} · ${featured.professional.name}`}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="font-heading text-5xl font-semibold tracking-tight">—</span>
              <span className="text-sm text-primary-foreground/80">Nenhum horário pendente hoje</span>
            </div>
          )}
        </Link>

        <div className="grid grid-cols-2 gap-3 lg:col-span-3">
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
      </div>
    </section>
  )
}
