"use client"

import { WEEKDAY_SHORT } from "@/lib/time"
import type { Appointment } from "@/lib/types"
import { cn } from "@/lib/utils"

export function MonthGrid({
  days,
  month,
  today,
  appointments,
  onSelectDay,
}: {
  days: string[]
  month: string
  today: string
  appointments: Appointment[]
  onSelectDay: (date: string) => void
}) {
  const byDay = new Map<string, Appointment[]>()
  for (const a of appointments) {
    if (a.status === "no_show") continue
    const list = byDay.get(a.date) ?? []
    list.push(a)
    byDay.set(a.date, list)
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const items = byDay.get(day) ?? []
          const inMonth = day.startsWith(month)
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelectDay(day)}
              className={cn(
                "flex min-h-24 flex-col gap-1 border-r border-b p-1.5 text-left outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent [&:nth-child(7n)]:border-r-0 md:min-h-28",
                !inMonth && "bg-muted/20 text-muted-foreground"
              )}
              aria-label={`${day.split("-").reverse().join("/")}: ${items.length} atendimentos`}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                  day === today && "bg-primary font-semibold text-primary-foreground"
                )}
              >
                {Number(day.slice(8))}
              </span>
              <span className="hidden flex-col gap-0.5 md:flex">
                {items.slice(0, 3).map((a) => (
                  <span key={a.id} className="flex items-center gap-1 truncate text-[11px]">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: a.professional.color }} aria-hidden="true" />
                    <span className="tabular-nums text-muted-foreground">{a.start}</span>
                    <span className="truncate">{a.clientName}</span>
                  </span>
                ))}
              </span>
              {items.length > 0 && (
                <span className="mt-auto text-[11px] font-medium text-brand-light">
                  <span className="md:hidden">{items.length}</span>
                  <span className="hidden md:inline">{items.length > 3 ? `+${items.length - 3} mais` : ""}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
