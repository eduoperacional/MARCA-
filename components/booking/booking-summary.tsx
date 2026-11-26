import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowRight, CalendarDays, Check, ClipboardList, Clock, Loader2, UserRound } from "lucide-react"

import { formatDuration, type PublicService } from "@/components/booking/booking-types"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { dateFromLocal } from "@/lib/time"
import { cn } from "@/lib/utils"

export interface SummaryAction {
  label: string
  disabled: boolean
  pending: boolean
  submitsForm?: string
  onClick?: () => void
}

function ActionButton({ action, className }: { action: SummaryAction; className?: string }) {
  const Icon = action.pending ? Loader2 : action.submitsForm ? Check : ArrowRight
  return (
    <Button
      type={action.submitsForm ? "submit" : "button"}
      form={action.submitsForm}
      size="lg"
      disabled={action.disabled || action.pending}
      onClick={action.onClick}
      className={cn("h-12 rounded-xl text-base shadow-lg shadow-primary/25", className)}
    >
      {action.submitsForm && <Icon className={cn(action.pending && "animate-spin")} data-icon="inline-start" />}
      {action.label}
      {!action.submitsForm && <Icon data-icon="inline-end" />}
    </Button>
  )
}

export function BookingSummary({
  service,
  professionalLabel,
  date,
  time,
  action,
}: {
  service: PublicService | null
  professionalLabel: string | null
  date: string | null
  time: string | null
  action: SummaryAction
}) {
  const rows = [
    { icon: ClipboardList, label: "Serviço", value: service?.name },
    { icon: UserRound, label: "Profissional", value: professionalLabel },
    {
      icon: CalendarDays,
      label: "Data",
      value: date ? format(dateFromLocal(date), "EEEE, dd 'de' MMMM", { locale: ptBR }) : null,
    },
    { icon: Clock, label: "Horário", value: time ? `${time}${service ? ` · ${formatDuration(service.durationMin)}` : ""}` : null },
  ]

  return (
    <aside aria-label="Resumo do agendamento" className="sticky top-6 flex flex-col gap-5 rounded-3xl border border-white/[0.07] bg-card/80 p-6 backdrop-blur">
      <h2 className="font-heading text-base font-semibold">Resumo</h2>
      <dl className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                row.value ? "bg-primary/15 text-brand-light" : "bg-white/[0.04] text-muted-foreground/60"
              )}
            >
              <row.icon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className={cn("text-sm first-letter:uppercase", row.value ? "font-medium text-foreground" : "text-muted-foreground/60")}>
                {row.value ?? "—"}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between border-t border-white/[0.07] pt-4">
        <span className="text-sm text-muted-foreground">Total</span>
        <span className="font-heading text-2xl font-semibold tabular-nums">{service ? formatCurrency(service.price, true) : "—"}</span>
      </div>
      <ActionButton action={action} className="w-full" />
    </aside>
  )
}

export function MobileActionBar({ service, time, action }: { service: PublicService | null; time: string | null; action: SummaryAction }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-background/85 backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 flex-1 flex-col">
          {service ? (
            <>
              <span className="truncate text-sm font-medium">{service.name}</span>
              <span className="truncate text-xs text-muted-foreground tabular-nums">
                {formatCurrency(service.price, true)} · {formatDuration(service.durationMin)}
                {time && ` · ${time}`}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Selecione um serviço</span>
          )}
        </div>
        <ActionButton action={action} className="shrink-0 px-5" />
      </div>
    </div>
  )
}
