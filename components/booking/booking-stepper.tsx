import { Check } from "lucide-react"

import { STEPS, type ActiveStep } from "@/components/booking/booking-types"
import { cn } from "@/lib/utils"

export function BookingStepper({ current, onNavigate }: { current: ActiveStep; onNavigate: (step: ActiveStep) => void }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current)

  return (
    <nav aria-label="Etapas do agendamento">
      <p className="mb-3 text-xs font-medium text-muted-foreground sm:hidden">
        Etapa {currentIndex + 1} de {STEPS.length} · <span className="text-foreground">{STEPS[currentIndex].label}</span>
      </p>
      <ol className="flex items-center">
        {STEPS.map((s, i) => {
          const done = i < currentIndex
          const active = i === currentIndex
          return (
            <li key={s.key} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
              <button
                type="button"
                disabled={!done}
                onClick={() => onNavigate(s.key)}
                aria-current={active ? "step" : undefined}
                aria-label={`${s.label}${done ? " (concluída, voltar para esta etapa)" : active ? " (etapa atual)" : ""}`}
                className="group flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-all duration-300",
                    done && "border-primary bg-primary text-primary-foreground group-hover:bg-primary/80",
                    active && "border-primary bg-primary/15 text-brand-light ring-4 ring-primary/15",
                    !done && !active && "border-white/10 bg-card text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-sm whitespace-nowrap transition-colors sm:inline",
                    active ? "font-medium text-foreground" : "text-muted-foreground",
                    done && "group-hover:text-foreground"
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className="mx-2 h-px flex-1 overflow-hidden rounded-full bg-white/10 sm:mx-3">
                  <span
                    className={cn("block h-full bg-primary transition-all duration-500 ease-out", done ? "w-full" : "w-0")}
                  />
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
