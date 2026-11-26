import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarCheck2, RotateCcw } from "lucide-react"

import { formatDuration, type PublicService } from "@/components/booking/booking-types"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/format"
import { dateFromLocal } from "@/lib/time"

export function BookingDone({
  businessName,
  service,
  professionalName,
  date,
  time,
  onRestart,
}: {
  businessName: string
  service: PublicService
  professionalName: string | null
  date: string
  time: string
  onRestart: () => void
}) {
  return (
    <section
      aria-live="polite"
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 rounded-3xl border border-white/[0.07] bg-card p-6 text-center animate-in fade-in zoom-in-95 duration-500 motion-reduce:animate-none sm:p-10"
    >
      <span className="relative flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
        <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-success/20 [animation-iteration-count:2] motion-reduce:hidden" />
        <CalendarCheck2 className="relative size-8" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Agendamento recebido!</h2>
        <p className="text-sm text-muted-foreground text-pretty">
          {businessName} recebeu seu pedido. Guarde os detalhes do seu horário:
        </p>
      </div>
      <div className="w-full overflow-hidden rounded-2xl border border-white/[0.07] text-left">
        <div className="flex items-center gap-4 bg-primary/10 p-4">
          <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-primary py-1.5 text-primary-foreground">
            <span className="text-[11px] uppercase">{format(dateFromLocal(date), "MMM", { locale: ptBR }).replace(".", "")}</span>
            <span className="font-heading text-xl leading-none font-semibold tabular-nums">{format(dateFromLocal(date), "dd")}</span>
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium capitalize">{format(dateFromLocal(date), "EEEE", { locale: ptBR })} às {time}</span>
            <span className="text-sm text-muted-foreground">{formatDuration(service.durationMin)}</span>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 p-4 text-sm">
          <dt className="text-muted-foreground">Serviço</dt>
          <dd className="text-right font-medium">{service.name}</dd>
          <dt className="text-muted-foreground">Profissional</dt>
          <dd className="text-right font-medium">{professionalName ?? "A definir"}</dd>
          <dt className="text-muted-foreground">Data</dt>
          <dd className="text-right font-medium capitalize">{format(dateFromLocal(date), "EEEE, dd 'de' MMMM", { locale: ptBR })}</dd>
          <dt className="text-muted-foreground">Horário</dt>
          <dd className="text-right font-medium tabular-nums">{time}</dd>
          <dt className="border-t border-white/[0.07] pt-2.5 text-muted-foreground">Valor</dt>
          <dd className="border-t border-white/[0.07] pt-2.5 text-right font-heading font-semibold tabular-nums">
            {formatCurrency(service.price, true)}
          </dd>
        </dl>
      </div>
      <Button variant="outline" size="lg" className="rounded-xl" onClick={onRestart}>
        <RotateCcw data-icon="inline-start" />
        Fazer outro agendamento
      </Button>
    </section>
  )
}
