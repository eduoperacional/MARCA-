import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarSearch, CalendarX2, Moon, Sun, Sunrise } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { addDays, dateFromLocal } from "@/lib/time"
import { cn } from "@/lib/utils"

const PERIODS = [
  { label: "Manhã", icon: Sunrise, test: (h: number) => h < 12 },
  { label: "Tarde", icon: Sun, test: (h: number) => h >= 12 && h < 18 },
  { label: "Noite", icon: Moon, test: (h: number) => h >= 18 },
]

export function TimeStep({
  today,
  days,
  date,
  time,
  slots,
  loading,
  hasProfessional,
  error,
  onSelectDate,
  onSelectTime,
}: {
  today: string
  days: string[]
  date: string | null
  time: string | null
  slots: string[] | undefined
  loading: boolean
  hasProfessional: boolean
  error: string | null
  onSelectDate: (date: string) => void
  onSelectTime: (time: string) => void
}) {
  const tomorrow = addDays(today, 1)

  return (
    <section aria-labelledby="step-time-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id="step-time-title" className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
          Escolha o dia e o horário
        </h2>
        <p className="text-sm text-muted-foreground">Mostramos apenas horários realmente livres na agenda.</p>
      </div>

      {days.length === 0 ? (
        <EmptyState icon={CalendarX2}>Não há dias disponíveis nas próximas semanas{hasProfessional ? ". Tente outro profissional" : ""}.</EmptyState>
      ) : (
        <div
          className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:-mx-0 sm:px-0"
          role="listbox"
          aria-label="Dias disponíveis"
        >
          {days.map((d) => {
            const dt = dateFromLocal(d)
            const selected = d === date
            const relative = d === today ? "Hoje" : d === tomorrow ? "Amanhã" : format(dt, "EEE", { locale: ptBR }).replace(".", "")
            return (
              <button
                key={d}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={format(dt, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                onClick={() => onSelectDate(d)}
                className={cn(
                  "flex w-[4.5rem] shrink-0 snap-start flex-col items-center gap-0.5 rounded-2xl border py-3 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "border-white/[0.07] bg-card hover:border-primary/40"
                )}
              >
                <span className={cn("text-xs capitalize", selected ? "text-primary-foreground/85" : "text-muted-foreground")}>{relative}</span>
                <span className="font-heading text-xl font-semibold tabular-nums">{format(dt, "dd")}</span>
                <span className={cn("text-[11px] capitalize", selected ? "text-primary-foreground/85" : "text-muted-foreground")}>
                  {format(dt, "MMM", { locale: ptBR }).replace(".", "")}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {days.length > 0 &&
        (!date ? (
          <EmptyState icon={CalendarSearch}>Selecione um dia para ver os horários.</EmptyState>
        ) : loading ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Buscando horários livres">
            <Skeleton className="h-4 w-20" />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="h-11 rounded-xl" />
              ))}
            </div>
          </div>
        ) : !slots?.length ? (
          <EmptyState icon={CalendarX2}>Nenhum horário livre neste dia. Tente outra data{hasProfessional ? " ou outro profissional" : ""}.</EmptyState>
        ) : (
          <div className="flex flex-col gap-5 animate-in fade-in duration-300 motion-reduce:animate-none" role="listbox" aria-label="Horários disponíveis">
            {PERIODS.map((period) => {
              const items = slots.filter((s) => period.test(Number(s.slice(0, 2))))
              if (!items.length) return null
              const Icon = period.icon
              return (
                <div key={period.label} role="group" aria-label={period.label} className="flex flex-col gap-2.5">
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Icon className="size-3.5" aria-hidden="true" />
                    {period.label}
                    <span className="text-muted-foreground/60">· {items.length}</span>
                  </span>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {items.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        role="option"
                        aria-selected={time === slot}
                        onClick={() => onSelectTime(slot)}
                        className={cn(
                          "h-11 rounded-xl border text-sm font-medium tabular-nums transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          time === slot
                            ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                            : "border-white/[0.07] bg-card hover:border-primary/50 hover:bg-accent/60"
                        )}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function EmptyState({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 px-6 py-10 text-center">
      <Icon className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-xs text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
